from pathlib import Path
from neo4j import GraphDatabase

txt_path = Path("C:/Users/athar/Downloads/Neo4j-cae49472-Created-2026-11-22.txt")
creds = {}
with open(txt_path) as f:
    for line in f:
        if "=" in line:
            k, v = line.strip().split("=", 1)
            creds[k.strip()] = v.strip()

uri = creds.get("NEO4J_URI")
user = creds.get("NEO4J_USERNAME")
pwd = creds.get("NEO4J_PASSWORD")
db = creds.get("NEO4J_DATABASE", "neo4j")

print("Attempting connection to live Neo4j Aura...")
try:
    driver = GraphDatabase.driver(uri, auth=(user, pwd))
    driver.verify_connectivity()
    print("SUCCESS! CONNECTIVITY VERIFIED WITH REAL NEO4J AURA!")
    with driver.session(database=db) as session:
        result = session.run("RETURN 1 AS ping, datetime() AS now, 'Neo4j Aura Live' AS status")
        record = result.single()
        print("Query result:", record.data())
    driver.close()
    print("DATABASE LIVE AND QUERYABLE!")
except Exception as e:
    print("Failed:", type(e).__name__, e)
