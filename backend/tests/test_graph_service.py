"""
backend/tests/test_graph_service.py
===================================
Tests for Neo4j Graph Relationship & Reachability Engine (Challenge T6.1).
"""

import pytest
from backend.data.graph_service import Neo4jGraphEngine, graph_engine

def test_graph_initialization_and_topology():
    assert len(graph_engine.nodes) >= 10
    assert "route_pune_mumbai" in graph_engine.nodes
    assert "st_lonavala_expressway" in graph_engine.nodes
    assert "conn_ccs2" in graph_engine.nodes

def test_find_compatible_route_stations():
    candidates = graph_engine.find_compatible_route_stations(
        vehicle_connector_standards=["CCS2"],
        max_detour_km=2.0,
    )
    assert len(candidates) > 0
    # Verified primary corridor station
    primary_stops = [c for c in candidates if "Jio-bp" in c.name or "Lonavala" in c.name]
    assert len(primary_stops) >= 1
    # Check that Khandala backup station is established via BACKUP_FOR relationship
    assert primary_stops[0].backup_station_name is not None
    assert "Khandala" in primary_stops[0].backup_station_name

def test_detect_corridor_chokepoints():
    chokepoints = graph_engine.detect_corridor_chokepoints("route_pune_mumbai")
    assert isinstance(chokepoints, list)
    # Stations without backup relationships are flagged
    for cp in chokepoints:
        assert cp.risk_level in ("HIGH", "MODERATE")
