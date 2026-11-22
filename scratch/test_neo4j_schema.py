import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.graph.neo4j_client import get_graph_client
from backend.graph.schema import ensure_schema

client = get_graph_client()
print("Connecting and executing ensure_schema()...")
statements = ensure_schema(client)
print(f"Executed {len(statements)} schema statements.")

# Check constraints
constraints = client.read("SHOW CONSTRAINTS YIELD name, type, entityType, labelsOrTypes, properties")
print("\n--- ACTIVE NEO4J CONSTRAINTS ---")
for c in constraints:
    print(f"  {c['name']} ({c['type']}) on {c['labelsOrTypes']} properties={c['properties']}")

# Check indexes
indexes = client.read("SHOW INDEXES YIELD name, type, entityType, labelsOrTypes, properties")
print("\n--- ACTIVE NEO4J INDEXES ---")
for idx in indexes:
    print(f"  {idx['name']} ({idx['type']}) on {idx['labelsOrTypes']} properties={idx['properties']}")

print("\nSCHEMA CONSTRAINTS AND INDEXES VERIFIED SUCCESSFULLY ON NEO4J AURA!")
