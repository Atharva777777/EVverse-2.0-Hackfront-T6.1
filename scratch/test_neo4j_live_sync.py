"""
scratch/test_neo4j_live_sync.py
===============================
Execution script for Phase 2 Live Neo4j Aura integration and acceptance verification.
"""

import json
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.graph.neo4j_client import get_graph_client
from backend.graph.sync_service import sync_engine


def run_verification():
    print("=" * 60)
    print("PHASE 2: LIVE NEO4J AURA INTEGRATION VERIFICATION")
    print("=" * 60)

    client = get_graph_client()
    status = client.status()
    print(f"\n1. Connection Status:")
    print(f"   Configured: {status.get('configured')}")
    print(f"   Connected: {status.get('connected')}")
    print(f"   Server: {status.get('server')}")
    if not status.get("connected"):
        print(f"   Connection error: {status.get('error')}")
        return

    # 2. Run Idempotent Synchronization (Run 1)
    print("\n2. Executing Idempotent Synchronization (Run 1)...")
    sync_stats_1 = sync_engine.sync_all(seed_demo=True)
    print("   Run 1 Stats:")
    for k, v in sync_stats_1.items():
        print(f"     {k}: {v}")

    # 3. Verify Entities and Counts
    print("\n3. Verifying Required Entities in Neo4j Aura:")
    entity_queries = {
        "User": "MATCH (u:User) RETURN count(u) AS count, collect(u.email) AS emails",
        "Vehicle": "MATCH (v:Vehicle) RETURN count(v) AS count, collect(v.id) AS vehicle_ids",
        "ChargingStation": "MATCH (s:ChargingStation) RETURN count(s) AS count",
        "Connector": "MATCH (c:Connector) RETURN count(c) AS count, collect(c.id) AS connectors",
        "Location": "MATCH (l:Location) RETURN count(l) AS count, collect(l.id) AS locations",
        "Journey": "MATCH (j:Journey) RETURN count(j) AS count, collect(j.id) AS journeys",
        "ChargingSession": "MATCH (cs:ChargingSession) RETURN count(cs) AS count, collect(cs.id) AS sessions",
    }
    entity_counts = {}
    for entity, query in entity_queries.items():
        res = client.read(query)[0]
        entity_counts[entity] = res["count"]
        print(f"   {entity}: {res['count']} nodes")
        if "emails" in res:
            print(f"     Emails: {res['emails']}")
        if "connectors" in res:
            print(f"     Connectors: {res['connectors']}")
        if "locations" in res:
            print(f"     Locations: {res['locations']}")

    # 4. Verify Required Relationships
    print("\n4. Verifying Required Relationships in Neo4j Aura:")
    relationship_queries = {
        "(User)-[:OWNS]->(Vehicle)": "MATCH (u:User)-[r:OWNS]->(v:Vehicle) RETURN count(r) AS count, collect(u.email + ' -> ' + v.id) AS samples",
        "(Vehicle)-[:SUPPORTS]->(Connector)": "MATCH (v:Vehicle)-[r:SUPPORTS]->(c:Connector) RETURN count(r) AS count, collect(v.id + ' -> ' + c.id) AS samples",
        "(ChargingStation)-[:PROVIDES]->(Connector)": "MATCH (s:ChargingStation)-[r:PROVIDES]->(c:Connector) RETURN count(r) AS count",
        "(ChargingStation)-[:LOCATED_IN]->(Location)": "MATCH (s:ChargingStation)-[r:LOCATED_IN]->(l:Location) RETURN count(r) AS count",
        "(Journey)-[:USES]->(Vehicle)": "MATCH (j:Journey)-[r:USES]->(v:Vehicle) RETURN count(r) AS count, collect(j.id + ' -> ' + v.id) AS samples",
        "(Journey)-[:PASSES_NEAR]->(ChargingStation)": "MATCH (j:Journey)-[r:PASSES_NEAR]->(s:ChargingStation) RETURN count(r) AS count",
        "(User)-[:CREATED]->(Journey)": "MATCH (u:User)-[r:CREATED]->(j:Journey) RETURN count(r) AS count, collect(u.email + ' -> ' + j.id) AS samples",
    }
    rel_counts = {}
    for rel_name, query in relationship_queries.items():
        res = client.read(query)[0]
        rel_counts[rel_name] = res["count"]
        print(f"   {rel_name}: {res['count']} relationships")
        if "samples" in res and res["samples"]:
            print(f"     Samples: {res['samples'][:3]}")

    # 5. Neo4j Acceptance Test (Live Cypher MATCH)
    print("\n5. Running Neo4j Acceptance Test Query:")
    acceptance_cypher = """
    MATCH (u:User {email: 'demo@evverse.app'})
    OPTIONAL MATCH (u)-[:OWNS]->(v:Vehicle)
    OPTIONAL MATCH (v)-[:SUPPORTS]->(c:Connector)
    OPTIONAL MATCH (u)-[:CREATED]->(j:Journey)
    OPTIONAL MATCH (j)-[:PASSES_NEAR]->(s:ChargingStation)
    RETURN
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,
        u.location AS user_location,
        u.user_type AS user_type,
        u.is_admin AS is_admin,
        v.id AS vehicle_id,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.battery_kwh AS battery_kwh,
        v.usable_kwh AS usable_kwh,
        v.wltp_range_km AS wltp_range_km,
        v.efficiency_kwh100km AS efficiency,
        v.max_dc_speed_kw AS max_dc_speed_kw,
        v.plug_type AS plug_type,
        collect(DISTINCT c.id) AS compatible_connectors,
        collect(DISTINCT j.name) AS user_journeys,
        collect(DISTINCT s.name)[..3] AS sample_corridor_stations
    """
    acceptance_res = client.read(acceptance_cypher)
    print(json.dumps(acceptance_res, indent=2))

    # 6. Verify Idempotence (Run 2)
    print("\n6. Testing Idempotence (Running sync_all again)...")
    sync_engine.sync_all(seed_demo=True)
    for entity, query in entity_queries.items():
        res = client.read(query)[0]
        assert res["count"] == entity_counts[entity], f"Idempotence failure on {entity}: {res['count']} != {entity_counts[entity]}"
    print("   PASSED: Node counts identical after second sync run.")

    for rel_name, query in relationship_queries.items():
        res = client.read(query)[0]
        assert res["count"] == rel_counts[rel_name], f"Idempotence failure on {rel_name}: {res['count']} != {rel_counts[rel_name]}"
    print("   PASSED: Relationship counts identical after second sync run.")

    # 7. Verify Security (No passwords in Neo4j)
    print("\n7. Verifying Graph Data Hygiene & Security:")
    pw_check = client.read("""
    MATCH (n)
    WHERE n.password IS NOT NULL 
       OR n.password_hash IS NOT NULL 
       OR n.hash IS NOT NULL
       OR n.secret IS NOT NULL
    RETURN count(n) AS vulnerable_nodes
    """)
    vuln_count = pw_check[0]["vulnerable_nodes"]
    print(f"   Vulnerable nodes with credentials in Neo4j: {vuln_count}")
    assert vuln_count == 0, "CRITICAL: Password or hash found in Neo4j graph!"
    print("   PASSED: Zero credentials found in Neo4j graph.")

    print("\n" + "=" * 60)
    print("PHASE 2 NEO4J LIVE INTEGRATION VERIFICATION COMPLETE: ALL CHECKS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    run_verification()
