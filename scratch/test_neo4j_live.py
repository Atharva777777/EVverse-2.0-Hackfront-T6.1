import os
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER") or "neo4j"
password = os.getenv("NEO4J_PASSWORD")
database = os.getenv("NEO4J_DATABASE") or "neo4j"

print(f"Connecting to Neo4j URI: {uri[:15]}... User: {user} Database: {database}")

try:
    from neo4j import GraphDatabase
    driver = GraphDatabase.driver(uri, auth=(user, password))
    driver.verify_connectivity()
    print("Connectivity verified successfully!")

    with driver.session(database=database) as session:
        result = session.run("RETURN 1 AS ping, datetime() AS now")
        record = result.single()
        print("Cypher query succeeded! Record:", record.data())

    driver.close()
    print("ALL NEO4J TESTS PASSED!")
except Exception as e:
    print(f"Neo4j connection error: {type(e).__name__}: {e}")
