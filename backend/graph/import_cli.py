"""
backend/graph/import_cli.py
===========================
One command that builds the EVverse Neo4j graph from the processed OSM extract.

    cd <project root>
    python -m backend.graph.import_cli

Steps (each idempotent, safe to re-run):
  1. Check Neo4j connection settings and connectivity.
  2. Create constraints and indexes.
  3. Import OSM charging stations, cities, operators, connectors and NEAR links.
  4. Sync seeded vehicles and their SUPPORTS edges to connector types.
  5. Attach the demo station owner (simulated) to one real station.
  6. Generate investor opportunity nodes from the graph's own counts.

Exit codes: 0 success, 2 Neo4j not configured, 3 Neo4j unreachable.
"""

from __future__ import annotations

import json
import sys
from typing import List, Optional

from backend.data.driver_db import DEFAULT_SEED_VEHICLES
from backend.graph import queries
from backend.graph.neo4j_client import get_graph_client
from backend.graph.osm_import import import_osm


def main(argv: Optional[List[str]] = None) -> int:
    client = get_graph_client()
    if not client.configured:
        print("Neo4j is not configured. Missing: " + ", ".join(client.missing_settings()))
        print("Add these to backend/.env (see .env.example), then run this command again.")
        return 2

    status = client.status()
    if not status["connected"]:
        print(f"Cannot connect to Neo4j: {status['error']}")
        return 3

    report = {"neo4j": {"connected": True, "server": status.get("server")}}
    report["osm_import"] = import_osm(client)
    report["vehicles_synced"] = queries.sync_vehicles(client, DEFAULT_SEED_VEHICLES)
    report["demo_owner"] = queries.ensure_demo_owner(client)
    report["opportunities"] = [
        {"id": o["id"], "city": o["city"], "stations": o["stations"]}
        for o in queries.generate_opportunities(client)
    ]
    print(json.dumps(report, indent=2, default=str))
    client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
