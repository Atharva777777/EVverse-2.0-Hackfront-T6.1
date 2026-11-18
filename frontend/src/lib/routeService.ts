/**
 * frontend/src/lib/routeService.ts
 * ================================
 * Provider-independent road-based routing service for EVverse 2.0.
 *
 * Fetches real road coordinates, highway paths, and turn-by-turn maneuver
 * instructions using the OpenStreetMap road network via OSRM.
 *
 * Supports:
 * - Single-leg routes (Origin -> Destination)
 * - Multi-leg EV routes (Origin -> Charging Waypoint -> Destination)
 * - ETA clock time calculation
 * - Real GPS proximity to maneuvers and off-route detection
 */

export interface RouteManeuver {
  id: string;
  type: string;
  modifier?: string;
  instruction: string;
  distanceMeters: number;
  formattedDistance: string;
  durationSeconds: number;
  location: [number, number]; // [lat, lng]
  streetName: string;
}

export interface RouteLeg {
  legIndex: number;
  title: string;
  distanceKm: number;
  durationMins: number;
  coordinates: [number, number][]; // [lat, lng]
  steps: RouteManeuver[];
  startLocation: [number, number];
  endLocation: [number, number];
  targetName: string;
  isChargingWaypoint: boolean;
}

export interface RoadRoute {
  success: boolean;
  provider: string;
  totalDistanceKm: number;
  totalDurationMins: number;
  etaTimestamp: number;
  formattedEta: string;
  legs: RouteLeg[];
  allCoordinates: [number, number][];
  allSteps: RouteManeuver[];
  hasChargingWaypoint: boolean;
  chargingWaypointName?: string;
  chargingWaypointCoords?: [number, number];
  destinationName: string;
  destinationCoords: [number, number];
  originCoords: [number, number];
  error?: string;
}

export interface FetchRouteParams {
  origin: [number, number]; // [lat, lng]
  destination: [number, number]; // [lat, lng]
  destinationName: string;
  chargingWaypoint?: {
    name: string;
    latitude: number;
    longitude: number;
  } | null;
}

// ── Great-Circle Distance Helper ─────────────────────────────────────────────
export function calculateDistanceMeters(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const R = 6371000; // meters
  const dLat = ((coord2[0] - coord1[0]) * Math.PI) / 180;
  const dLon = ((coord2[1] - coord1[1]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1[0] * Math.PI) / 180) *
    Math.cos((coord2[0] * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Format meters to human readable distance
export function formatManeuverDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Format clock time (e.g. "6:45 PM")
export function formatClockTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// ── Turn-by-Turn Instruction Formatter ───────────────────────────────────────
function formatManeuverInstruction(
  type: string,
  modifier: string | undefined,
  name: string
): string {
  const street = name ? `onto ${name}` : "";
  const onStreet = name ? `on ${name}` : "";

  switch (type) {
    case "depart":
      return `Head ${modifier || "forward"} ${onStreet}`.trim();
    case "turn":
      return `Turn ${modifier || ""} ${street}`.trim();
    case "new name":
      return `Continue ${street}`.trim();
    case "fork":
      return `Take the ${modifier || ""} fork ${street}`.trim();
    case "merge":
      return `Merge ${modifier || ""} ${street}`.trim();
    case "on ramp":
      return `Take ramp ${modifier || ""} ${street}`.trim();
    case "off ramp":
      return `Take exit ${modifier || ""} ${street}`.trim();
    case "roundabout":
    case "rotary":
      return `At the roundabout, take exit ${street}`.trim();
    case "arrive":
      return `Arrive at destination`;
    default:
      if (name) {
        return `Continue on ${name}`;
      }
      return `Continue straight`;
  }
}

// ── Core Route Fetcher ───────────────────────────────────────────────────────
export async function fetchRoadRoute({
  origin,
  destination,
  destinationName,
  chargingWaypoint,
}: FetchRouteParams): Promise<RoadRoute> {
  const hasWaypoint =
    Boolean(chargingWaypoint) &&
    typeof chargingWaypoint?.latitude === "number" &&
    typeof chargingWaypoint?.longitude === "number";

  // Build coordinate query: [lng, lat] format for OSRM
  let coordsQuery = `${origin[1]},${origin[0]};`;
  if (hasWaypoint && chargingWaypoint) {
    coordsQuery += `${chargingWaypoint.longitude},${chargingWaypoint.latitude};`;
  }
  coordsQuery += `${destination[1]},${destination[0]}`;

  const url = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson&steps=true`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Routing provider returned HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || "No mapped road route found between locations.");
    }

    const primaryRoute = data.routes[0];
    const totalDistanceKm = +(primaryRoute.distance / 1000).toFixed(1);
    const totalDurationMins = Math.max(1, Math.round(primaryRoute.duration / 60));
    const etaTimestamp = Date.now() + totalDurationMins * 60 * 1000;
    const formattedEta = formatClockTime(etaTimestamp);

    // Parse distinct legs
    const parsedLegs: RouteLeg[] = [];
    const allCoordinates: [number, number][] = [];
    const allSteps: RouteManeuver[] = [];

    primaryRoute.legs.forEach((leg: any, index: number) => {
      const isLegToCharger = hasWaypoint && index === 0;
      const legTargetName = isLegToCharger
        ? chargingWaypoint?.name || "Charging Station"
        : destinationName;

      const legDistanceKm = +(leg.distance / 1000).toFixed(1);
      const legDurationMins = Math.max(1, Math.round(leg.duration / 60));

      const legSteps: RouteManeuver[] = [];
      const legCoords: [number, number][] = [];

      (leg.steps || []).forEach((step: any, stepIdx: number) => {
        const stepCoords: [number, number][] = (step.geometry?.coordinates || []).map(
          ([lng, lat]: [number, number]) => [lat, lng]
        );
        legCoords.push(...stepCoords);

        const maneuverLoc: [number, number] = step.maneuver?.location
          ? [step.maneuver.location[1], step.maneuver.location[0]]
          : stepCoords[0] || origin;

        const distanceM = Math.round(step.distance || 0);
        const street = (step.name || "").trim();
        const type = step.maneuver?.type || "turn";
        const modifier = step.maneuver?.modifier;
        const instruction = formatManeuverInstruction(type, modifier, street);

        const maneuverItem: RouteManeuver = {
          id: `step-${index}-${stepIdx}`,
          type,
          modifier,
          instruction,
          distanceMeters: distanceM,
          formattedDistance: formatManeuverDistance(distanceM),
          durationSeconds: Math.round(step.duration || 0),
          location: maneuverLoc,
          streetName: street,
        };

        legSteps.push(maneuverItem);
        allSteps.push(maneuverItem);
      });

      // Deduplicate contiguous identical coordinates
      const cleanedLegCoords = legCoords.filter((coord, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        return coord[0] !== prev[0] || coord[1] !== prev[1];
      });

      allCoordinates.push(...cleanedLegCoords);

      parsedLegs.push({
        legIndex: index,
        title: isLegToCharger
          ? `Leg 1: En Route to ${legTargetName}`
          : hasWaypoint
            ? `Leg 2: Continue to ${legTargetName}`
            : `Direct Route to ${legTargetName}`,
        distanceKm: legDistanceKm,
        durationMins: legDurationMins,
        coordinates: cleanedLegCoords,
        steps: legSteps,
        startLocation: cleanedLegCoords[0] || origin,
        endLocation: cleanedLegCoords[cleanedLegCoords.length - 1] || destination,
        targetName: legTargetName,
        isChargingWaypoint: isLegToCharger,
      });
    });

    return {
      success: true,
      provider: "OpenStreetMap Graph via OSRM",
      totalDistanceKm,
      totalDurationMins,
      etaTimestamp,
      formattedEta,
      legs: parsedLegs,
      allCoordinates:
        allCoordinates.length > 0 ? allCoordinates : [origin, destination],
      allSteps,
      hasChargingWaypoint: hasWaypoint,
      chargingWaypointName: chargingWaypoint?.name,
      chargingWaypointCoords: chargingWaypoint
        ? [chargingWaypoint.latitude, chargingWaypoint.longitude]
        : undefined,
      destinationName,
      destinationCoords: destination,
      originCoords: origin,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Routing engine unavailable.";
    return {
      success: false,
      provider: "OpenStreetMap Graph via OSRM",
      totalDistanceKm: 0,
      totalDurationMins: 0,
      etaTimestamp: Date.now(),
      formattedEta: "--:--",
      legs: [],
      allCoordinates: [],
      allSteps: [],
      hasChargingWaypoint: hasWaypoint,
      destinationName,
      destinationCoords: destination,
      originCoords: origin,
      error: `Could not compute real road route: ${errorMsg}`,
    };
  }
}

// ── Off-Route & Closest Point Detection ──────────────────────────────────────
export function evaluateDriverPositionOnRoute(
  driverLoc: [number, number],
  routeCoordinates: [number, number][],
  offRouteThresholdMeters = 150
): {
  isOffRoute: boolean;
  closestCoordinateIndex: number;
  perpendicularDistanceMeters: number;
} {
  if (!routeCoordinates || routeCoordinates.length === 0) {
    return {
      isOffRoute: false,
      closestCoordinateIndex: 0,
      perpendicularDistanceMeters: 0,
    };
  }

  let minDistance = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < routeCoordinates.length; i++) {
    const d = calculateDistanceMeters(driverLoc, routeCoordinates[i]);
    if (d < minDistance) {
      minDistance = d;
      closestIdx = i;
    }
  }

  return {
    isOffRoute: minDistance > offRouteThresholdMeters,
    closestCoordinateIndex: closestIdx,
    perpendicularDistanceMeters: minDistance,
  };
}

