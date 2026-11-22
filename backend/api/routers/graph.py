"""
backend/api/routers/graph.py
============================
Graph-powered infrastructure intelligence backed by Neo4j.

All endpoints are read-only. Graph writes happen only through the import CLI
(backend/graph/import_cli.py), never from a public request.

If Neo4j is not configured or unreachable, endpoints return HTTP 503 with
`{"error": "graph_unavailable", "message": ...}`. Credentials are never returned.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.graph import queries
from backend.graph.neo4j_client import GraphQueryError, GraphUnavailable, get_graph_client
from backend.graph.simulation import simulate_owner_month

router = APIRouter()


def _graph_call(fn: Callable[[], Any]) -> Any:
    try:
        return fn()
    except GraphUnavailable as exc:
        raise HTTPException(status_code=503, detail={"error": "graph_unavailable", "message": str(exc)})
    except GraphQueryError as exc:
        raise HTTPException(status_code=500, detail={"error": "graph_query_failed", "message": str(exc)})


@router.get("/status", summary="Neo4j configuration and connection status (no credentials)")
def graph_status() -> Dict[str, Any]:
    return get_graph_client().status()


@router.get("/stations", summary="Charging stations inside a geographic area (bounding box)")
def graph_stations(
    min_lat: float = Query(..., ge=-90, le=90),
    min_lng: float = Query(..., ge=-180, le=180),
    max_lat: float = Query(..., ge=-90, le=90),
    max_lng: float = Query(..., ge=-180, le=180),
    limit: int = Query(200, ge=1, le=1000),
) -> Dict[str, Any]:
    if min_lat > max_lat or min_lng > max_lng:
        raise HTTPException(status_code=422, detail="min values must be less than or equal to max values")
    client = get_graph_client()
    rows = _graph_call(lambda: queries.stations_in_bbox(client, min_lat, min_lng, max_lat, max_lng, limit))
    return {"count": len(rows), "stations": rows, "source": "neo4j"}


@router.get(
    "/vehicles/{vehicle_id}/compatible-stations",
    summary="Stations whose connectors a vehicle can use",
)
def graph_compatible_stations(
    vehicle_id: str,
    limit: int = Query(200, ge=1, le=1000),
) -> Dict[str, Any]:
    client = get_graph_client()
    result = _graph_call(lambda: queries.compatible_stations(client, vehicle_id, limit))
    if not result["vehicle_found"]:
        raise HTTPException(
            status_code=404,
            detail=f"Vehicle '{vehicle_id}' is not in the graph. Run backend.graph.import_cli to sync vehicles.",
        )
    return {"vehicle_id": vehicle_id, "vehicle_model": result["vehicle_model"],
            "count": len(result["stations"]), "stations": result["stations"], "source": "neo4j"}


@router.get("/stations/{station_id}/nearby", summary="Stations within a radius, by real distance")
def graph_nearby(
    station_id: str,
    radius_m: float = Query(2000.0, gt=0, le=20000),
    limit: int = Query(50, ge=1, le=200),
) -> Dict[str, Any]:
    client = get_graph_client()
    result = _graph_call(lambda: queries.nearby_stations(client, station_id, radius_m, limit))
    if not result["station_found"]:
        raise HTTPException(status_code=404, detail=f"Station '{station_id}' is not in the graph.")
    return {"station_id": station_id, "radius_m": radius_m, "count": len(result["neighbours"]),
            "neighbours": result["neighbours"], "source": "neo4j"}


@router.get("/clusters", summary="Charging-station clusters on a grid")
def graph_clusters(
    cell_deg: float = Query(0.02, gt=0.001, le=1.0),
    min_stations: int = Query(2, ge=1, le=100),
) -> Dict[str, Any]:
    client = get_graph_client()
    result = _graph_call(lambda: queries.station_clusters(client, cell_deg, min_stations))
    return {**result, "source": "neo4j"}


@router.get("/analytics/distribution", summary="Stations by city, operator, connector and power band")
def graph_distribution() -> Dict[str, Any]:
    client = get_graph_client()
    result = _graph_call(lambda: queries.distribution(client))
    return {**result, "source": "neo4j"}


@router.get("/analytics/gaps", summary="Low-coverage cities and isolated stations")
def graph_gaps() -> Dict[str, Any]:
    client = get_graph_client()
    result = _graph_call(lambda: queries.coverage_gaps(client))
    return {**result, "source": "neo4j"}


@router.get("/investor/opportunities", summary="Investment opportunities generated from graph data")
def graph_investor_opportunities() -> Dict[str, Any]:
    client = get_graph_client()
    rows = _graph_call(lambda: queries.list_opportunities(client))
    return {
        "count": len(rows),
        "opportunities": rows,
        "data_limitations": (
            "No EV registration or population data is loaded, so opportunities use station counts only. "
            "OSM mapping completeness differs by city."
        ),
        "source": "neo4j",
    }


@router.get("/owner/demo", summary="Demo station owner: station from the graph plus SIMULATED operations")
def graph_owner_demo(
    owner_id: str = Query(queries.DEMO_OWNER_ID, min_length=1, max_length=100),
) -> Dict[str, Any]:
    client = get_graph_client()
    station: Optional[Dict[str, Any]] = _graph_call(lambda: queries.owner_station(client, owner_id))
    if station is None:
        raise HTTPException(
            status_code=404,
            detail="No demo owner in the graph. Run backend.graph.import_cli to create the demo owner.",
        )
    operations = simulate_owner_month(
        station_id=station["station_id"],
        max_power_kw=station.get("max_power_kw"),
        connector_count=len(station.get("connectors") or []),
    )
    return {
        "owner": {"id": owner_id, "name": station["owner_name"], "is_simulated": bool(station["is_simulated"])},
        "station": {
            "id": station["station_id"],
            "name": station["station_name"],
            "city": station["city"],
            "operator": station["operator"],
            "max_power_kw": station["max_power_kw"],
            "connectors": station["connectors"],
            "source_url": station["source_url"],
            "attribution": station["attribution"],
        },
        "operations": operations,
        "labels": {
            "station_and_connectors": "Real OpenStreetMap record via Neo4j",
            "owner_and_operations": "Simulated for the demo. Not real owner data.",
        },
        "source": "neo4j+simulation",
    }
