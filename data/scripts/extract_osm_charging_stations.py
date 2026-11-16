"""
EVverse 2.0 - OpenStreetMap Western Zone Charging Station Extractor
Extracts amenity=charging_station and man_made=charge_point nodes and ways from Geofabrik Western Zone PBF.
Performs physical duplicate detection against primary facility footprints/nodes.
Preserves OSM IDs, licensing (ODbL-1.0), and attribution (© OpenStreetMap contributors).
Calculates exact completeness metrics without fabricating missing attributes.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import osmium

GEOFABRIK_WESTERN_ZONE_URL = "https://download.geofabrik.de/asia/india/western-zone-latest.osm.pbf"
REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_PBF_PATH = REPO_ROOT / "data" / "raw" / "western-zone-latest.osm.pbf"
DEFAULT_OUTPUT_PATH = REPO_ROOT / "data" / "processed" / "osm" / "western_zone_charging_stations.json"
DEFAULT_SUMMARY_PATH = REPO_ROOT / "data" / "processed" / "osm" / "western_zone_charging_stations_summary.json"

# Geographic bounding boxes for regional analysis
# Pune Metropolitan Region
PUNE_BBOX = {"min_lat": 18.35, "max_lat": 18.75, "min_lon": 73.65, "max_lon": 74.05}
# Mumbai Metropolitan Region (MMR)
MUMBAI_BBOX = {"min_lat": 18.85, "max_lat": 19.35, "min_lon": 72.75, "max_lon": 73.15}
# Mumbai - Pune Expressway / NH48 Corridor (e.g. Panvel, Khopoli, Lonavala, Khandala, Talegaon)
EXPRESSWAY_CORRIDOR_BBOX = {"min_lat": 18.60, "max_lat": 19.05, "min_lon": 73.10, "max_lon": 73.70}


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two coordinates in meters."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def download_pbf(url: str, dest_path: Path, force: bool = False) -> None:
    """Download the PBF file from Geofabrik with progress reporting."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    
    if dest_path.exists() and not force:
        size_bytes = dest_path.stat().st_size
        if size_bytes > 50 * 1024 * 1024:  # At least 50 MB
            print(f"PBF file already exists at {dest_path} ({size_bytes / (1024*1024):.1f} MB). Skipping download.")
            return

    print(f"Connecting to {url}...")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "EVverse-DataPipeline/2.0 (OpenStreetMap Data Extract)"}
    )
    
    start_time = time.time()
    with urllib.request.urlopen(req) as response:
        total_size = int(response.headers.get("Content-Length", 0))
        total_mb = total_size / (1024 * 1024) if total_size else 0
        print(f"Downloading Western Zone PBF (~{total_mb:.1f} MB)...")
        
        chunk_size = 1024 * 1024  # 1 MB chunk
        downloaded = 0
        last_log_mb = 0
        
        with open(dest_path, "wb") as f:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                
                curr_mb = downloaded / (1024 * 1024)
                if curr_mb - last_log_mb >= 20 or downloaded == total_size:
                    elapsed = time.time() - start_time
                    speed = (curr_mb / elapsed) if elapsed > 0 else 0
                    percent = (downloaded / total_size * 100) if total_size else 0
                    print(f"  Downloaded: {curr_mb:.1f} / {total_mb:.1f} MB ({percent:.1f}%) at {speed:.2f} MB/s")
                    last_log_mb = curr_mb

    elapsed = time.time() - start_time
    print(f"Download complete: {dest_path.name} in {elapsed:.1f}s ({dest_path.stat().st_size / (1024*1024):.1f} MB)")


class ChargingStationHandler(osmium.SimpleHandler):
    """pyosmium handler to extract amenity=charging_station and man_made=charge_point nodes and ways."""

    def __init__(self):
        super().__init__()
        self.stations: List[Dict[str, Any]] = []
        self.node_count = 0
        self.way_count = 0
        self.invalid_geom_count = 0

    def _is_charging_station(self, tags: Dict[str, str]) -> bool:
        """Check if tags indicate an EV charging station or individual dispenser."""
        if tags.get("amenity") == "charging_station":
            return True
        if tags.get("man_made") == "charge_point":
            return True
        return False

    def node(self, n):
        tags = dict(n.tags)
        if self._is_charging_station(tags):
            if not n.location.valid():
                self.invalid_geom_count += 1
                return
            
            self.node_count += 1
            station = self._normalize_station(
                osm_type="node",
                osm_id=n.id,
                lat=n.location.lat,
                lon=n.location.lon,
                tags=tags
            )
            self.stations.append(station)

    def way(self, w):
        tags = dict(w.tags)
        if self._is_charging_station(tags):
            lats = []
            lons = []
            for node_ref in w.nodes:
                try:
                    if node_ref.location.valid():
                        lats.append(node_ref.location.lat)
                        lons.append(node_ref.location.lon)
                except Exception:
                    continue
            
            if not lats:
                self.invalid_geom_count += 1
                return
            
            # Centroid calculation for polygon / footprint
            centroid_lat = sum(lats) / len(lats)
            centroid_lon = sum(lons) / len(lons)
            
            self.way_count += 1
            station = self._normalize_station(
                osm_type="way",
                osm_id=w.id,
                lat=centroid_lat,
                lon=centroid_lon,
                tags=tags,
                node_count=len(lats)
            )
            self.stations.append(station)

    def _normalize_station(
        self,
        osm_type: str,
        osm_id: int,
        lat: float,
        lon: float,
        tags: Dict[str, str],
        node_count: Optional[int] = None
    ) -> Dict[str, Any]:
        """Normalize OSM station tags into a structured schema without inventing data."""
        name = tags.get("name")
        operator = tags.get("operator") or tags.get("brand") or tags.get("network")
        brand = tags.get("brand")
        network = tags.get("network")
        
        tag_type = "amenity=charging_station" if tags.get("amenity") == "charging_station" else "man_made=charge_point"

        # Capacity
        raw_capacity = tags.get("capacity")
        capacity = None
        if raw_capacity:
            try:
                capacity = int(raw_capacity)
            except ValueError:
                capacity = raw_capacity
                
        # Sockets / connectors
        sockets: Dict[str, Any] = {}
        socket_outputs: Dict[str, str] = {}
        for k, v in tags.items():
            if k.startswith("socket:"):
                subparts = k.split(":")
                if len(subparts) == 2:
                    # e.g. socket:type2_combo = 2 or 1
                    sockets[subparts[1]] = v
                elif len(subparts) == 3 and subparts[2] == "output":
                    # e.g. socket:type2_combo:output = 60kW
                    socket_outputs[subparts[1]] = v

        # Max Power: check max_power, output, and charging_station:output
        max_power = (
            tags.get("max_power") or 
            tags.get("max_power:kw") or 
            tags.get("output") or 
            tags.get("charging_station:output")
        )

        # Opening hours
        opening_hours = tags.get("opening_hours")
        
        # Fee & Payment
        fee = tags.get("fee")
        payment = {k.replace("payment:", ""): v for k, v in tags.items() if k.startswith("payment:")}
        authentication = {k.replace("authentication:", ""): v for k, v in tags.items() if k.startswith("authentication:")}
        access = tags.get("access")

        # Address fields
        address = {
            "street": tags.get("addr:street"),
            "city": tags.get("addr:city"),
            "district": tags.get("addr:district"),
            "suburb": tags.get("addr:suburb"),
            "postcode": tags.get("addr:postcode"),
            "state": tags.get("addr:state"),
            "full": tags.get("addr:full"),
        }
        address = {k: v for k, v in address.items() if v is not None}

        # Classify regional zone by bounding box or explicit city tag
        region_tags = []
        if (PUNE_BBOX["min_lat"] <= lat <= PUNE_BBOX["max_lat"] and 
            PUNE_BBOX["min_lon"] <= lon <= PUNE_BBOX["max_lon"]):
            region_tags.append("pune_metro")
        elif (MUMBAI_BBOX["min_lat"] <= lat <= MUMBAI_BBOX["max_lat"] and 
              MUMBAI_BBOX["min_lon"] <= lon <= MUMBAI_BBOX["max_lon"]):
            region_tags.append("mumbai_metro")
            
        if (EXPRESSWAY_CORRIDOR_BBOX["min_lat"] <= lat <= EXPRESSWAY_CORRIDOR_BBOX["max_lat"] and 
            EXPRESSWAY_CORRIDOR_BBOX["min_lon"] <= lon <= EXPRESSWAY_CORRIDOR_BBOX["max_lon"]):
            region_tags.append("mumbai_pune_corridor")

        city_lower = (tags.get("addr:city") or "").lower()
        if "pune" in city_lower or "pcmc" in city_lower or "pimpri" in city_lower:
            if "pune_metro" not in region_tags:
                region_tags.append("pune_metro")
        elif "mumbai" in city_lower or "navi mumbai" in city_lower or "thane" in city_lower:
            if "mumbai_metro" not in region_tags:
                region_tags.append("mumbai_metro")

        record = {
            "id": f"{osm_type}/{osm_id}",
            "osm_type": osm_type,
            "osm_id": osm_id,
            "tag_type": tag_type,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "name": name,
            "operator": operator,
            "brand": brand,
            "network": network,
            "capacity": capacity,
            "sockets": sockets if sockets else None,
            "socket_outputs": socket_outputs if socket_outputs else None,
            "max_power": max_power,
            "opening_hours": opening_hours,
            "fee": fee,
            "access": access,
            "payment": payment if payment else None,
            "authentication": authentication if authentication else None,
            "address": address if address else None,
            "region_tags": region_tags,
            "is_physical_duplicate": False,
            "duplicate_of": None,
            "co_located_distance_m": None,
            "osm_url": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            "attribution": "© OpenStreetMap contributors",
            "license": "ODbL-1.0",
            "raw_tags": tags
        }
        
        if node_count is not None:
            record["way_node_count"] = node_count
            
        return record


def check_physical_duplicates(
    stations: List[Dict[str, Any]],
    distance_threshold_m: float = 10.0
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Identifies physical co-location/duplicates against existing amenity=charging_station records.
    If a man_made=charge_point dispenser or adjacent node is located < 10m from an existing
    primary facility record, it is linked as a physical duplicate to prevent double-counting.
    """
    duplicates_detected = []
    
    # Priority: amenity=charging_station ways, then amenity=charging_station nodes, then man_made=charge_point
    amenity_records = [s for s in stations if s.get("tag_type") == "amenity=charging_station"]
    
    for s in stations:
        # Check against primary amenity records (excluding itself)
        for parent in amenity_records:
            if s["id"] == parent["id"]:
                continue
            dist = haversine_distance_m(s["latitude"], s["longitude"], parent["latitude"], parent["longitude"])
            if dist <= distance_threshold_m:
                # If s is man_made=charge_point or s is a node near an amenity way of same operator
                is_dup = False
                if s.get("tag_type") == "man_made=charge_point":
                    is_dup = True
                elif s["osm_type"] == "node" and parent["osm_type"] == "way":
                    is_dup = True

                if is_dup:
                    s["is_physical_duplicate"] = True
                    s["duplicate_of"] = parent["id"]
                    s["co_located_distance_m"] = round(dist, 2)
                    duplicates_detected.append({
                        "entity_id": s["id"],
                        "tag_type": s.get("tag_type"),
                        "operator": s.get("operator"),
                        "duplicate_of": parent["id"],
                        "parent_operator": parent.get("operator"),
                        "distance_m": round(dist, 2),
                        "description": (
                            f"Physical duplicate: {s['id']} ({s.get('tag_type')}) is located {round(dist, 2)}m "
                            f"from parent facility {parent['id']} ({parent.get('operator')})"
                        )
                    })
                    break

    return stations, duplicates_detected


def analyze_dataset(
    stations: List[Dict[str, Any]],
    duplicates: List[Dict[str, Any]],
    pbf_size_mb: float,
    json_size_kb: float
) -> Dict[str, Any]:
    """Perform comprehensive quality, coverage, completeness and deduplication audit."""
    total = len(stations)
    if total == 0:
        return {"total_records": 0}

    nodes = [s for s in stations if s["osm_type"] == "node"]
    ways = [s for s in stations if s["osm_type"] == "way"]
    amenity_count = sum(1 for s in stations if s.get("tag_type") == "amenity=charging_station")
    charge_point_count = sum(1 for s in stations if s.get("tag_type") == "man_made=charge_point")
    unique_physical_count = sum(1 for s in stations if not s.get("is_physical_duplicate"))

    # Coverage by region (all records)
    pune_count = sum(1 for s in stations if "pune_metro" in s.get("region_tags", []))
    mumbai_count = sum(1 for s in stations if "mumbai_metro" in s.get("region_tags", []))
    corridor_count = sum(1 for s in stations if "mumbai_pune_corridor" in s.get("region_tags", []))
    other_count = sum(1 for s in stations if not s.get("region_tags"))

    # Completeness counts
    has_name = sum(1 for s in stations if s.get("name"))
    has_operator = sum(1 for s in stations if s.get("operator"))
    has_capacity = sum(1 for s in stations if s.get("capacity") is not None)
    has_sockets = sum(1 for s in stations if s.get("sockets"))
    has_power = sum(1 for s in stations if s.get("max_power") or s.get("socket_outputs"))
    has_opening_hours = sum(1 for s in stations if s.get("opening_hours"))
    has_fee = sum(1 for s in stations if s.get("fee") is not None)
    has_access = sum(1 for s in stations if s.get("access"))
    has_address = sum(1 for s in stations if s.get("address"))

    # Operator distribution
    operators = Counter()
    for s in stations:
        op = s.get("operator")
        if op:
            operators[op.strip()] += 1
        else:
            operators["[Unspecified]"] += 1

    # Socket types distribution
    socket_counter = Counter()
    for s in stations:
        if s.get("sockets"):
            for sock in s["sockets"].keys():
                socket_counter[sock] += 1

    # Bounds
    min_lat = min(s["latitude"] for s in stations)
    max_lat = max(s["latitude"] for s in stations)
    min_lon = min(s["longitude"] for s in stations)
    max_lon = max(s["longitude"] for s in stations)

    analysis = {
        "dataset_name": "OpenStreetMap Western Zone India - Charging Stations",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_url": GEOFABRIK_WESTERN_ZONE_URL,
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "file_sizes": {
            "pbf_raw_mb": round(pbf_size_mb, 2),
            "extracted_json_kb": round(json_size_kb, 2)
        },
        "counts": {
            "total_records_extracted": total,
            "unique_physical_stations": unique_physical_count,
            "physical_duplicates_detected": len(duplicates),
            "nodes": len(nodes),
            "ways": len(ways),
            "amenity_charging_station": amenity_count,
            "man_made_charge_point": charge_point_count,
        },
        "geographic_bounds": {
            "min_latitude": min_lat,
            "max_latitude": max_lat,
            "min_longitude": min_lon,
            "max_longitude": max_lon,
        },
        "regional_breakdown": {
            "pune_metro": {
                "count": pune_count,
                "percentage": round(pune_count / total * 100, 1)
            },
            "mumbai_metro": {
                "count": mumbai_count,
                "percentage": round(mumbai_count / total * 100, 1)
            },
            "mumbai_pune_corridor": {
                "count": corridor_count,
                "percentage": round(corridor_count / total * 100, 1)
            },
            "other_western_zone": {
                "count": other_count,
                "percentage": round(other_count / total * 100, 1)
            }
        },
        "attribute_completeness": {
            "name": {"present": has_name, "percentage": round(has_name / total * 100, 1)},
            "operator_or_brand": {"present": has_operator, "percentage": round(has_operator / total * 100, 1)},
            "capacity": {"present": has_capacity, "percentage": round(has_capacity / total * 100, 1)},
            "socket_types": {"present": has_sockets, "percentage": round(has_sockets / total * 100, 1)},
            "max_power": {"present": has_power, "percentage": round(has_power / total * 100, 1)},
            "opening_hours": {"present": has_opening_hours, "percentage": round(has_opening_hours / total * 100, 1)},
            "fee_info": {"present": has_fee, "percentage": round(has_fee / total * 100, 1)},
            "access_restrictions": {"present": has_access, "percentage": round(has_access / total * 100, 1)},
            "address": {"present": has_address, "percentage": round(has_address / total * 100, 1)},
        },
        "top_operators": operators.most_common(12),
        "top_socket_types": socket_counter.most_common(10),
        "physical_duplicates": duplicates
    }
    return analysis


def print_report(analysis: Dict[str, Any]) -> None:
    """Print structured, human-readable summary to stdout."""
    print("=" * 80)
    print("  OPENSTREETMAP WESTERN ZONE CHARGING STATION EXTRACTION REPORT")
    print("=" * 80)
    print(f"Generated at: {analysis['generated_at']}")
    print(f"Attribution:  {analysis['attribution']}")
    print(f"License:      {analysis['license']}")
    print(f"Raw PBF Size: {analysis['file_sizes']['pbf_raw_mb']} MB")
    print(f"JSON Output:  {analysis['file_sizes']['extracted_json_kb']} KB")
    print("-" * 80)
    c = analysis['counts']
    print(f"Total Extracted Features:          {c['total_records_extracted']}")
    print(f"  - Unique Physical Stations:      {c['unique_physical_stations']}")
    print(f"  - Co-located Physical Dps/Nodes: {c['physical_duplicates_detected']}")
    print(f"  - Nodes (point locations):       {c['nodes']}")
    print(f"  - Ways (polygons / areas):       {c['ways']}")
    print(f"  - amenity=charging_station:      {c['amenity_charging_station']}")
    print(f"  - man_made=charge_point:         {c['man_made_charge_point']}")
    print("-" * 80)
    print("PHYSICAL DUPLICATES & CO-LOCATED DISPENSERS RESOLVED:")
    for d in analysis.get("physical_duplicates", []):
        print(f"  - {d['entity_id']} ({d['tag_type']}) -> co-located with {d['duplicate_of']} ({d['parent_operator']}) at {d['distance_m']}m")
    print("-" * 80)
    print("GEOGRAPHIC COVERAGE:")
    print(f"  Bounds: Lat [{analysis['geographic_bounds']['min_latitude']:.4f}, {analysis['geographic_bounds']['max_latitude']:.4f}], "
          f"Lon [{analysis['geographic_bounds']['min_longitude']:.4f}, {analysis['geographic_bounds']['max_longitude']:.4f}]")
    rb = analysis["regional_breakdown"]
    print(f"  - Pune Metro Region:             {rb['pune_metro']['count']} ({rb['pune_metro']['percentage']}%)")
    print(f"  - Mumbai Metro Region:           {rb['mumbai_metro']['count']} ({rb['mumbai_metro']['percentage']}%)")
    print(f"  - Mumbai-Pune Corridor / NH48:   {rb['mumbai_pune_corridor']['count']} ({rb['mumbai_pune_corridor']['percentage']}%)")
    print(f"  - Rest of Western Zone:          {rb['other_western_zone']['count']} ({rb['other_western_zone']['percentage']}%)")
    print("-" * 80)
    print("ATTRIBUTE COMPLETENESS (Missing vs Present - No Fabricated Defaults):")
    ac = analysis["attribute_completeness"]
    for field, data in ac.items():
        missing = analysis['counts']['total_records_extracted'] - data['present']
        bar = "#" * int(data['percentage'] / 5) + "-" * (20 - int(data['percentage'] / 5))
        print(f"  {field.ljust(22)}: {str(data['present']).rjust(4)} present ({data['percentage']:5.1f}%) | {str(missing).rjust(4)} missing [{bar}]")
    print("-" * 80)
    print("TOP OPERATORS / NETWORKS:")
    for op, cnt in analysis["top_operators"]:
        print(f"  - {op.ljust(35)}: {cnt} stations")
    print("-" * 80)
    print("CONNECTOR / SOCKET TYPES RECORDED:")
    for sock, cnt in analysis["top_socket_types"]:
        print(f"  - {sock.ljust(35)}: {cnt} stations")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="Extract charging stations from OSM Western Zone PBF")
    parser.add_argument("--download", action="store_true", help="Download PBF file if missing")
    parser.add_argument("--force-download", action="store_true", help="Force redownload even if exists")
    parser.add_argument("--pbf-path", type=Path, default=DEFAULT_PBF_PATH, help="Path to PBF file")
    parser.add_argument("--output-path", type=Path, default=DEFAULT_OUTPUT_PATH, help="Path to output JSON")
    parser.add_argument("--summary-path", type=Path, default=DEFAULT_SUMMARY_PATH, help="Path to summary JSON")
    args = parser.parse_args()

    # 1. Download if requested or missing
    if args.download or not args.pbf_path.exists():
        download_pbf(GEOFABRIK_WESTERN_ZONE_URL, args.pbf_path, force=args.force_download)

    if not args.pbf_path.exists():
        print(f"Error: PBF file not found at {args.pbf_path}. Pass --download to fetch it.")
        sys.exit(1)

    pbf_size_mb = args.pbf_path.stat().st_size / (1024 * 1024)
    print(f"Processing PBF: {args.pbf_path} ({pbf_size_mb:.1f} MB)...")

    # 2. Extract using pyosmium
    handler = ChargingStationHandler()
    start_time = time.time()
    
    # Apply with locations=True and flex_mem index for way coordinate resolution
    handler.apply_file(str(args.pbf_path), locations=True, idx="flex_mem")
    extract_duration = time.time() - start_time
    print(f"Extraction completed in {extract_duration:.2f}s:")
    print(f"  Extracted {len(handler.stations)} raw features ({handler.node_count} nodes, {handler.way_count} ways)")
    if handler.invalid_geom_count:
        print(f"  Skipped {handler.invalid_geom_count} features with incomplete/invalid geometries")

    # 3. Check for physical duplicates / co-located dispensers
    stations, duplicates = check_physical_duplicates(handler.stations, distance_threshold_m=10.0)
    unique_count = sum(1 for s in stations if not s.get("is_physical_duplicate"))
    print(f"Physical Duplicate Resolution: {len(duplicates)} co-located features linked; {unique_count} distinct physical stations.")

    # 4. Save extracted stations JSON
    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata": {
            "source": "OpenStreetMap",
            "provider": "Geofabrik Western Zone Extract",
            "source_url": GEOFABRIK_WESTERN_ZONE_URL,
            "extraction_timestamp": datetime.now(timezone.utc).isoformat(),
            "license": "ODbL-1.0",
            "attribution": "© OpenStreetMap contributors",
            "total_records_extracted": len(stations),
            "unique_physical_stations": unique_count,
            "physical_duplicates_detected": len(duplicates),
            "node_count": handler.node_count,
            "way_count": handler.way_count
        },
        "stations": stations
    }
    
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        
    json_size_kb = args.output_path.stat().st_size / 1024
    print(f"Saved {len(stations)} records to {args.output_path} ({json_size_kb:.1f} KB)")

    # 5. Generate Analysis & Summary
    analysis = analyze_dataset(stations, duplicates, pbf_size_mb, json_size_kb)
    with open(args.summary_path, "w", encoding="utf-8") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)
    print(f"Saved summary report to {args.summary_path}")

    # 6. Print Human-Readable Report
    print_report(analysis)


if __name__ == "__main__":
    main()
