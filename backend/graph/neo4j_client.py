"""
backend/graph/neo4j_client.py
=============================
Neo4j connection for EVverse graph infrastructure intelligence.

Configuration comes only from backend environment variables. Credentials are
never returned by any API and are never sent to the frontend.

    NEO4J_URI        e.g. neo4j+s://xxxx.databases.neo4j.io  or  bolt://localhost:7687
    NEO4J_USERNAME   e.g. neo4j
    NEO4J_PASSWORD
    NEO4J_DATABASE   optional; defaults to the instance's default database

When Neo4j is not configured or cannot be reached, callers receive a
GraphUnavailable exception instead of a crash, so the rest of the backend keeps
working.
"""

from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

# Load backend/.env for standalone runs (import CLI, live tests). The API process
# already loads it in backend/api/main.py; override=False keeps real environment
# variables (for example on Render) in charge.
_BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"
try:
    from dotenv import load_dotenv

    if _BACKEND_ENV.exists():
        load_dotenv(dotenv_path=_BACKEND_ENV, override=False)
except ImportError:  # python-dotenv is optional at import time
    pass

ENV_URI = "NEO4J_URI"
ENV_USERNAME = "NEO4J_USERNAME"
ENV_PASSWORD = "NEO4J_PASSWORD"
ENV_DATABASE = "NEO4J_DATABASE"


class GraphUnavailable(RuntimeError):
    """Neo4j is not configured, the driver is missing, or the server cannot be reached."""


class GraphQueryError(RuntimeError):
    """Neo4j was reached but rejected or failed the query."""


def _redact(text: str, secrets: List[str]) -> str:
    for secret in secrets:
        if secret:
            text = text.replace(secret, "***")
    return text[:300]


class Neo4jClient:
    def __init__(
        self,
        uri: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        database: Optional[str] = None,
    ) -> None:
        self._uri = (uri if uri is not None else os.environ.get(ENV_URI, "")).strip()
        self._username = (username if username is not None else os.environ.get(ENV_USERNAME, "")).strip()
        self._password = password if password is not None else os.environ.get(ENV_PASSWORD, "")
        db = database if database is not None else os.environ.get(ENV_DATABASE, "")
        self._database: Optional[str] = db.strip() or None
        self._driver: Any = None
        self._lock = threading.Lock()

    # ── configuration ────────────────────────────────────────────────────

    def missing_settings(self) -> List[str]:
        missing = []
        if not self._uri:
            missing.append(ENV_URI)
        if not self._username:
            missing.append(ENV_USERNAME)
        if not self._password:
            missing.append(ENV_PASSWORD)
        return missing

    @property
    def configured(self) -> bool:
        return not self.missing_settings()

    def _secrets(self) -> List[str]:
        return [self._password, self._uri]

    # ── driver lifecycle ─────────────────────────────────────────────────

    def _get_driver(self) -> Any:
        if not self.configured:
            raise GraphUnavailable(
                "Neo4j is not configured. Set " + ", ".join(self.missing_settings())
                + " in the backend environment (backend/.env)."
            )
        with self._lock:
            if self._driver is None:
                try:
                    from neo4j import GraphDatabase  # imported lazily so the app starts without the package
                except ImportError as exc:
                    raise GraphUnavailable(
                        "The neo4j Python driver is not installed. Run: pip install -r requirements.txt"
                    ) from exc
                # Short timeouts: an unreachable Neo4j must fail fast instead of stalling API requests.
                self._driver = GraphDatabase.driver(
                    self._uri,
                    auth=(self._username, self._password),
                    connection_timeout=5.0,
                    max_transaction_retry_time=3.0,
                )
            return self._driver

    def close(self) -> None:
        with self._lock:
            if self._driver is not None:
                self._driver.close()
                self._driver = None

    # ── query helpers ────────────────────────────────────────────────────

    def _execute(self, cypher: str, params: Dict[str, Any], mode: str) -> List[Dict[str, Any]]:
        driver = self._get_driver()
        try:
            from neo4j.exceptions import (
                AuthError,
                ServiceUnavailable,
                SessionExpired,
            )
        except ImportError:  # pragma: no cover - driver present if _get_driver succeeded
            AuthError = ServiceUnavailable = SessionExpired = ()  # type: ignore

        try:
            with driver.session(database=self._database) as session:
                if mode == "auto":  # schema DDL cannot run inside a managed transaction
                    return [record.data() for record in session.run(cypher, params)]

                def work(tx: Any) -> List[Dict[str, Any]]:
                    return [record.data() for record in tx.run(cypher, params)]

                if mode == "write":
                    return session.execute_write(work)
                return session.execute_read(work)
        except (ServiceUnavailable, SessionExpired, AuthError, OSError) as exc:
            raise GraphUnavailable(
                f"Cannot reach Neo4j ({type(exc).__name__}: {_redact(str(exc), self._secrets())})"
            ) from exc
        except Exception as exc:  # Cypher syntax/semantic errors and anything else
            raise GraphQueryError(
                f"Neo4j rejected the query ({type(exc).__name__}: {_redact(str(exc), self._secrets())})"
            ) from exc

    def read(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self._execute(cypher, params or {}, "read")

    def write(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self._execute(cypher, params or {}, "write")

    def run_auto(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        return self._execute(cypher, params or {}, "auto")

    # ── status (safe to expose: contains no credentials) ─────────────────

    def status(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {
            "configured": self.configured,
            "missing_settings": self.missing_settings(),
            "connected": False,
            "error": None,
        }
        if not self.configured:
            result["error"] = "Neo4j is not configured on the backend."
            return result
        try:
            rows = self.read("CALL dbms.components() YIELD name, versions RETURN name, versions[0] AS version")
            result["connected"] = True
            result["server"] = rows[0] if rows else None
        except GraphUnavailable as exc:
            result["error"] = str(exc)
        except GraphQueryError as exc:
            # The server answered but may restrict dbms procedures (e.g. managed services).
            try:
                self.read("RETURN 1 AS ok")
                result["connected"] = True
            except GraphUnavailable as inner:
                result["error"] = str(inner)
            except GraphQueryError as inner:
                result["error"] = str(inner)
        return result


_client: Optional[Neo4jClient] = None
_client_lock = threading.Lock()


def get_graph_client() -> Neo4jClient:
    global _client
    with _client_lock:
        if _client is None:
            _client = Neo4jClient()
        return _client
