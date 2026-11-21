"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { BrandLogo } from "@/components/BrandLogo";
import { useLiveData } from "@/hooks/useLiveData";
import { CITY_CONFIGS } from "@/components/CountryCitySelector";
import type { LiveStation } from "@/types/api";

// Driver Mobile Components
import type { DriverTab } from "@/components/driver/DriverNav";
import { DriverDrawer } from "@/components/driver/DriverDrawer";
import { VehicleCockpit, EVVehicle } from "@/components/driver/VehicleCockpit";
import { JourneyPlanner } from "@/components/driver/JourneyPlanner";
import { ChargingConsole } from "@/components/driver/ChargingConsole";
import { VehicleManager } from "@/components/driver/VehicleManager";
import { DriverProfile } from "@/components/driver/DriverProfile";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  OfflineNotice,
} from "@/components/driver/StatusStates";
import { StationDetailSheet } from "@/components/driver/StationDetailSheet";
import { LiveDataSourceSheet } from "@/components/driver/LiveDataSourceSheet";
import { NavigationHUD } from "@/components/driver/NavigationHUD";
import {
  fetchRoadRoute,
  type RoadRoute,
  evaluateDriverPositionOnRoute,
  calculateDistanceMeters,
} from "@/lib/routeService";

import {
  syncFavouritesWithBackend,
  addFavouriteToBackend,
  removeFavouriteFromBackend,
} from "@/lib/stationAdapter";
import {
  VERIFIED_GARAGE_VEHICLES,
  getStoredVehicles,
  saveStoredVehicles,
  getStoredActiveVehicleId,
  saveStoredActiveVehicleId,
  getStoredAutoCompatibility,
  saveStoredAutoCompatibility,
  loadGaragePreferences,
  isStationCompatibleWithVehicle,
  syncAddVehicle,
  syncUpdateVehicle,
  syncDeleteVehicle,
  syncActiveVehicleId,
  syncAutoCompatibility,
} from "@/lib/vehicleStorage";
import { initDriverSession, recordChargingSession } from "@/lib/driverApi";
import { getDeployedStations, subscribeToEcosystem } from "@/lib/ecosystemStore";

import {
  Search,
  Navigation,
  MapPin,
  Clock,
  ArrowRight,
  X,
  Heart,
  ChevronRight,
  BatteryCharging,
  SlidersHorizontal,
  ExternalLink,
  Zap,
  BookOpen,
  ArrowLeft,
  Coins,
  Wallet,
  Gauge,
  Menu,
  AlertTriangle,
} from "lucide-react";

// Dynamic Leaflet Map Component
const DriverMobileMap = dynamic(
  () => import("@/components/DriverMobileMap"),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#FAF9F6] text-[#8C938E]">
        <div className="w-6 h-6 border-2 border-[#111312] border-t-transparent rounded-full animate-spin mb-2" />
        <span className="text-xs font-mono">Loading map...</span>
      </div>
    ),
  }
);

export interface DriverStation extends LiveStation {
  distanceKm?: number;
}

// Helper: Haversine distance in km
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return +(R * c).toFixed(1);
}

export default function EVVerseDriverPage() {
  // Navigation tabs: home, explore, journeys, charging, profile, garage
  const [activeTab, setActiveTab] = useState<DriverTab>("home");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Desktop Studio Frame: retain iPhone 16 Pro mockup on desktop, fluid on mobile
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isFramed = !isMobileScreen;

  // Selected city & live data
  const [selectedCity, setSelectedCity] = useState("Pune");
  const cityConfig = CITY_CONFIGS[selectedCity] || CITY_CONFIGS["Pune"];

  // Active Vehicle & Fleet State (persisted with backend/storage adapter)
  const [vehicles, setVehicles] = useState<EVVehicle[]>(VERIFIED_GARAGE_VEHICLES);
  const [activeVehicleId, setActiveVehicleId] = useState<string>("tata-nexon-ev");
  const [autoCompatibility, setAutoCompatibility] = useState<boolean>(true);
  const [isGarageLoading, setIsGarageLoading] = useState<boolean>(true);
  const [garageErrorMessage, setGarageErrorMessage] = useState<string | null>(null);

  // Active Vehicle derived object
  const activeVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === activeVehicleId) || vehicles[0] || VERIFIED_GARAGE_VEHICLES[0];
  }, [vehicles, activeVehicleId]);

  const [currentBatteryPct, setCurrentBatteryPct] = useState(activeVehicle.currentBatteryPct);
  const [driveMode, setDriveMode] = useState<"normal" | "eco" | "sport">("normal");
  const [hvacActive, setHvacActive] = useState(true);
  const [doorsLocked, setDoorsLocked] = useState(true);
  const [isPreconditioning, setIsPreconditioning] = useState(false);
  const [isVehicleManagerOpen, setIsVehicleManagerOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const shouldManage = params.get("manage") === "1" || params.get("garage") === "1";
      const shouldDrawer = params.get("menu") === "1" || params.get("drawer") === "1";
      const tabParam = params.get("tab");

      if (shouldManage || shouldDrawer || tabParam) {
        requestAnimationFrame(() => {
          if (shouldManage) setIsVehicleManagerOpen(true);
          if (shouldDrawer) setIsDrawerOpen(true);
          if (tabParam === "profile") setActiveTab("profile");
        });
      }
    }
  }, []);

  // Location Management: Explicitly separate real device GPS from catalog filtering city center
  const [deviceLocation, setDeviceLocation] = useState<[number, number] | null>(null);
  const [deviceAccuracy, setDeviceAccuracy] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "prompt" | "detecting" | "precise" | "approximate" | "denied" | "unavailable" | "timeout" | "unsupported"
  >("prompt");

  // Fallback location strictly derived from currently selected city
  const fallbackLocation = useMemo<[number, number]>(() => {
    return [cityConfig.lat, cityConfig.lng];
  }, [cityConfig.lat, cityConfig.lng]);

  // User location defaults to genuine device GPS when acquired, falling back to city center
  const userLocation: [number, number] = deviceLocation || fallbackLocation;

  // Live stations from backend API
  const {
    data: liveData,
    loading,
    error,
    isLive,
    stationCount,
    source,
    sources,
    lastUpdatedTime,
    fallbackReason,
    refetch,
  } = useLiveData(selectedCity);
  const [isLiveDataSheetOpen, setIsLiveDataSheetOpen] = useState(false);

  // Explore Map State
  const [mapCenter, setMapCenter] = useState<[number, number]>([cityConfig.lat, cityConfig.lng]);
  const [mapZoom, setMapZoom] = useState(13);
  const [selectedStation, setSelectedStation] = useState<DriverStation | null>(null);
  const [isStationDetailOpen, setIsStationDetailOpen] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [speedFilter, setSpeedFilter] = useState<"all" | "ultra" | "fast" | "ac">("all");
  const [connectorFilter, setConnectorFilter] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [savedStationIds, setSavedStationIds] = useState<Set<string>>(new Set());

  // Real Road In-app Navigation & Multi-Leg GPS State
  const [isNavigating, setIsNavigating] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RoadRoute | null>(null);
  const [activeLegIndex, setActiveLegIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [driverLocation, setDriverLocation] = useState<[number, number] | null>(null);
  const [driverHeading, setDriverHeading] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"prompt" | "active" | "denied" | "unavailable">("prompt");
  const [isOffRoute, setIsOffRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Charging Session State
  const [isCharging, setIsCharging] = useState(false);
  const [chargeStation, setChargeStation] = useState<DriverStation | null>(null);
  const [chargeTargetLimit, setChargeTargetLimit] = useState(80);
  const [chargeElapsedSeconds, setChargeElapsedSeconds] = useState(0);
  const [chargeKwhDelivered, setChargeKwhDelivered] = useState(0);
  const [chargeCurrentKw, setChargeCurrentKw] = useState(0);
  const [chargeCost, setChargeCost] = useState(0);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const chargeIntervalRef = useRef<NodeJS.Timeout | number | null>(null);


  // Hydrate vehicles & preferences from storage adapter on mount
  useEffect(() => {
    loadGaragePreferences()
      .then(({ vehicles: loadedVehicles, activeVehicleId: loadedActiveId, autoCompatibility: loadedAutoCompat }) => {
        setVehicles(loadedVehicles);
        setActiveVehicleId(loadedActiveId);
        setAutoCompatibility(loadedAutoCompat);
        setOnlyCompatible(loadedAutoCompat);
      })
      .catch((err) => {
        console.warn("[QuantEV] Error hydrating garage preferences:", err);
        setGarageErrorMessage("Could not load persisted vehicle preferences. Using verified defaults.");
      })
      .finally(() => {
        setIsGarageLoading(false);
      });
  }, []);

  // Hydrate driver session & favourites from backend
  useEffect(() => {
    initDriverSession().catch((err) => {
      console.warn("[QuantEV] Driver session initialization error:", err);
    });
    syncFavouritesWithBackend().then(setSavedStationIds);
  }, []);

  // High-accuracy device GPS acquisition with automatic fallback tier
  const requestDeviceLocation = useCallback((forceHighAccuracy = true) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationStatus("unsupported");
      return;
    }

    setLocationStatus("detecting");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!isMountedRef.current) return;
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setDeviceLocation(coords);
        setDeviceAccuracy(pos.coords.accuracy);
        const isPrecise = pos.coords.accuracy <= 100;
        setLocationStatus(isPrecise ? "precise" : "approximate");
        setMapCenter(coords);
      },
      (err) => {
        if (!isMountedRef.current) return;
        console.warn("[EVverse GPS] High-accuracy geolocation notice:", err.message, "code:", err.code);
        if (err.code === 1) {
          // GeolocationPositionError.PERMISSION_DENIED
          setLocationStatus("denied");
        } else {
          // POSITION_UNAVAILABLE or TIMEOUT: Attempt second tier fallback with lower constraints
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!isMountedRef.current) return;
              const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
              setDeviceLocation(coords);
              setDeviceAccuracy(pos.coords.accuracy);
              setLocationStatus("approximate");
              setMapCenter(coords);
            },
            (fallbackErr) => {
              if (!isMountedRef.current) return;
              console.warn("[EVverse GPS] Fallback geolocation notice:", fallbackErr.message);
              if (fallbackErr.code === 3) {
                setLocationStatus("timeout");
              } else {
                setLocationStatus("unavailable");
              }
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 30000 }
          );
        }
      },
      {
        enableHighAccuracy: forceHighAccuracy,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  }, []);

  // Initialize and track browser geolocation permissions
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      requestAnimationFrame(() => setLocationStatus("unsupported"));
      return;
    }

    if (navigator.permissions && navigator.permissions.query) {
      try {
        navigator.permissions
          .query({ name: "geolocation" as PermissionName })
          .then((permissionStatus) => {
            if (!isMountedRef.current) return;
            if (permissionStatus.state === "granted") {
              requestDeviceLocation(true);
            } else if (permissionStatus.state === "denied") {
              setLocationStatus("denied");
            } else {
              // "prompt"
              requestDeviceLocation(true);
            }

            permissionStatus.onchange = () => {
              if (!isMountedRef.current) return;
              if (permissionStatus.state === "granted") {
                requestDeviceLocation(true);
              } else if (permissionStatus.state === "denied") {
                setLocationStatus("denied");
                setDeviceLocation(null);
                setDeviceAccuracy(null);
              }
            };
          })
          .catch(() => {
            if (isMountedRef.current) {
              requestAnimationFrame(() => requestDeviceLocation(true));
            }
          });
      } catch {
        requestAnimationFrame(() => requestDeviceLocation(true));
      }
    } else {
      requestAnimationFrame(() => requestDeviceLocation(true));
    }
  }, [requestDeviceLocation]);

  // Center map on city change (render-phase state adjustment)
  const [prevCity, setPrevCity] = useState(selectedCity);
  if (selectedCity !== prevCity) {
    setPrevCity(selectedCity);
    setMapCenter([cityConfig.lat, cityConfig.lng]);
    // NOTE: deviceLocation is preserved! Never overwrite genuine device coordinates.
  }

  // Update battery percentage when vehicle changes
  const [prevVehicleId, setPrevVehicleId] = useState(activeVehicleId);
  if (activeVehicleId !== prevVehicleId) {
    setPrevVehicleId(activeVehicleId);
    setCurrentBatteryPct(activeVehicle.currentBatteryPct);
  }

  // Active Spot Booking State (localStorage polling removed — booking feature removed)

  const [deployedStations, setDeployedStations] = useState(getDeployedStations);

  useEffect(() => {
    const unsub = subscribeToEcosystem(() => {
      setDeployedStations(getDeployedStations());
    });
    return unsub;
  }, []);

  // Compute stations with real Haversine distance from driver (merging investor-deployed community hubs)
  const stationsWithDistance = useMemo<DriverStation[]>(() => {
    const baseline = (liveData?.stations || []).map((st) => ({
      ...st,
      distanceKm: haversineKm(userLocation[0], userLocation[1], st.latitude, st.longitude),
    }));

    const communityInCity: DriverStation[] = deployedStations
      .filter((d) => {
        const c1 = d.city.toLowerCase();
        const c2 = selectedCity.toLowerCase();
        return c1 === c2 || (c1 === "pune" && (c2 === "pimpri-chinchwad" || c2 === "hinjawadi"));
      })
      .map((d) => ({
        station_id: d.id,
        name: d.name,
        latitude: d.lat,
        longitude: d.lng,
        address: d.address,
        operator: d.operator,
        status: "Operational (Community Hub)",
        is_operational: true,
        power_kw: d.powerKw,
        bays: d.bays,
        connector_types: d.connectorTypes,
        usage_cost: `₹${d.ratePerKwh}/kWh`,
        source: "open_charge_map" as const,
        last_status_update: new Date().toISOString(),
        distanceKm: haversineKm(userLocation[0], userLocation[1], d.lat, d.lng),
      }));

    return [...communityInCity, ...baseline];
  }, [liveData, userLocation, deployedStations, selectedCity]);

  // Candidate charging stations for long-distance / corridor journey planning
  const journeyCandidateStations = useMemo<DriverStation[]>(() => {
    const communityStations: DriverStation[] = deployedStations.map((d) => ({
      station_id: d.id,
      name: d.name,
      latitude: d.lat,
      longitude: d.lng,
      address: d.address,
      operator: d.operator,
      status: "Operational (Community Hub)",
      is_operational: d.status === "Online",
      power_kw: d.powerKw,
      bays: d.bays,
      connector_types: d.connectorTypes,
      usage_cost: `₹${d.ratePerKwh}/kWh`,
      source: "open_charge_map" as const,
      last_status_update: new Date().toISOString(),
      distanceKm: haversineKm(userLocation[0], userLocation[1], d.lat, d.lng),
    }));

    const existingIds = new Set(communityStations.map((s) => s.station_id));
    const baseline = (liveData?.stations || [])
      .filter((s) => !existingIds.has(s.station_id))
      .map((st) => ({
        ...st,
        distanceKm: haversineKm(userLocation[0], userLocation[1], st.latitude, st.longitude),
      }));

    return [...communityStations, ...baseline];
  }, [deployedStations, liveData, userLocation]);

  // Filter stations based on driver inputs
  const filteredStations = useMemo(() => {
    return stationsWithDistance.filter((st) => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = st.name.toLowerCase().includes(q);
        const opMatch = (st.operator || "").toLowerCase().includes(q);
        const addrMatch = (st.address || "").toLowerCase().includes(q);
        if (!nameMatch && !opMatch && !addrMatch) return false;
      }

      // 2. Power Speed Filter
      if (speedFilter === "ultra") {
        if (!st.power_kw || st.power_kw < 150) return false;
      } else if (speedFilter === "fast") {
        if (!st.power_kw || st.power_kw < 50 || st.power_kw >= 150) return false;
      } else if (speedFilter === "ac") {
        if (st.power_kw && st.power_kw >= 50) return false;
      }

      // 3. Connector Filter
      if (connectorFilter !== "all") {
        if (!st.connector_types || !st.connector_types.some((c) => c.toLowerCase().includes(connectorFilter.toLowerCase()))) {
          return false;
        }
      }

      // 4. Availability Filter
      if (onlyAvailable && !st.is_operational) {
        return false;
      }

      // 5. Vehicle Compatibility Filter (Auto-applied or manually toggled)
      // Never silently substitute connector types
      if (onlyCompatible || autoCompatibility) {
        const isMatched = isStationCompatibleWithVehicle(st.connector_types, activeVehicle.plugType);
        if (!isMatched) return false;
      }

      // 6. Saved Bookmarks Filter
      if (onlySaved) {
        if (!savedStationIds.has(st.station_id)) return false;
      }

      return true;
    });
  }, [
    stationsWithDistance,
    searchQuery,
    speedFilter,
    connectorFilter,
    onlyAvailable,
    onlyCompatible,
    autoCompatibility,
    onlySaved,
    savedStationIds,
    activeVehicle.plugType,
  ]);

  // Reset all filters helper
  const handleResetFilters = () => {
    setSearchQuery("");
    setSpeedFilter("all");
    setConnectorFilter("all");
    setOnlyAvailable(false);
    setOnlyCompatible(false);
    setOnlySaved(false);
  };

  // Nearest Ultra Charger for quick-action
  const nearestUltraStation = useMemo(() => {
    const ultraStations = stationsWithDistance
      .filter((s) => s.power_kw && s.power_kw >= 150)
      .sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
    if (ultraStations.length > 0) {
      return {
        name: ultraStations[0].name,
        distanceKm: ultraStations[0].distanceKm || 2.4,
        powerKw: ultraStations[0].power_kw || 150,
        raw: ultraStations[0],
      };
    }
    return null;
  }, [stationsWithDistance]);

  // Automotive range calculation physics formula:
  // Range (km) = (Usable Battery kWh * (SoC / 100)) / (Efficiency kWh/100km / 100) * DriveModeFactor * HvacFactor
  const calibratedRangeKm = useMemo(() => {
    const energyAvailableKwh = activeVehicle.usableKwh * (currentBatteryPct / 100);
    const baseKm = energyAvailableKwh / (activeVehicle.efficiencyKwh100km / 100);

    let driveFactor = 1.0;
    if (driveMode === "eco") driveFactor = 1.12;
    if (driveMode === "sport") driveFactor = 0.86;

    const hvacFactor = hvacActive ? 0.92 : 1.0;
    return Math.round(baseKm * driveFactor * hvacFactor);
  }, [activeVehicle, currentBatteryPct, driveMode, hvacActive]);

  // Garage Vehicle Management Handlers
  const handleSelectVehicle = (id: string) => {
    setActiveVehicleId(id);
    const target = vehicles.find((v) => v.id === id);
    if (target) {
      setCurrentBatteryPct(target.currentBatteryPct);
    }
    syncActiveVehicleId(id);
  };

  const handleAddVehicle = async (newVehicle: EVVehicle) => {
    try {
      const updated = [newVehicle, ...vehicles];
      setVehicles(updated);
      saveStoredVehicles(updated);
      setActiveVehicleId(newVehicle.id);
      saveStoredActiveVehicleId(newVehicle.id);
      setCurrentBatteryPct(newVehicle.currentBatteryPct);
      setGarageErrorMessage(null);
      await syncAddVehicle(newVehicle);
      await syncActiveVehicleId(newVehicle.id);
    } catch (err: unknown) {
      setGarageErrorMessage(err instanceof Error ? err.message : "Failed to persist new vehicle.");
    }
  };

  const handleUpdateVehicle = async (updatedVehicle: EVVehicle) => {
    try {
      const updated = vehicles.map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v));
      setVehicles(updated);
      saveStoredVehicles(updated);
      if (updatedVehicle.id === activeVehicleId) {
        setCurrentBatteryPct(updatedVehicle.currentBatteryPct);
      }
      setGarageErrorMessage(null);
      await syncUpdateVehicle(updatedVehicle);
    } catch (err: unknown) {
      setGarageErrorMessage(err instanceof Error ? err.message : "Failed to update vehicle.");
    }
  };

  const handleRemoveVehicle = async (id: string) => {
    try {
      if (vehicles.length <= 1) return;
      const updated = vehicles.filter((v) => v.id !== id);
      setVehicles(updated);
      saveStoredVehicles(updated);
      if (activeVehicleId === id) {
        const nextActive = updated[0].id;
        setActiveVehicleId(nextActive);
        saveStoredActiveVehicleId(nextActive);
        await syncActiveVehicleId(nextActive);
      }
      setGarageErrorMessage(null);
      await syncDeleteVehicle(id);
    } catch (err: unknown) {
      setGarageErrorMessage(err instanceof Error ? err.message : "Failed to remove vehicle.");
    }
  };

  const handleToggleAutoCompatibility = (enabled: boolean) => {
    setAutoCompatibility(enabled);
    setOnlyCompatible(enabled);
    syncAutoCompatibility(enabled);
  };

  // Toggle Save Station (persisted to backend and cached locally)
  const toggleSaveStation = (stationId: string) => {
    setSavedStationIds((prev) => {
      const next = new Set(prev);
      if (next.has(stationId)) {
        next.delete(stationId);
        removeFavouriteFromBackend(stationId);
      } else {
        next.add(stationId);
        addFavouriteToBackend(stationId);
      }
      return next;
    });
  };

  // Launch real road navigation
  const startRoadNavigation = async ({
    destination,
    destinationName,
    chargingWaypoint,
    originCoords,
  }: {
    destination: [number, number];
    destinationName: string;
    chargingWaypoint?: {
      name: string;
      latitude: number;
      longitude: number;
    } | null;
    originCoords?: [number, number];
  }) => {
    setIsNavigating(true);
    setIsRouteLoading(true);
    setRouteError(null);
    setActiveLegIndex(0);
    setCurrentStepIndex(0);
    setActiveTab("explore");
    setIsStationDetailOpen(false);

    let startPos: [number, number] | null = driverLocation || originCoords || deviceLocation;

    // If no real position is available yet, await a one-shot high-accuracy position acquisition
    if (!startPos) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (typeof window === "undefined" || !navigator.geolocation) {
            reject(new Error("Geolocation not supported by device"));
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000,
          });
        });
        startPos = [pos.coords.latitude, pos.coords.longitude];
        setDeviceLocation(startPos);
        setDeviceAccuracy(pos.coords.accuracy);
        setDriverLocation(startPos);
        setLocationStatus(pos.coords.accuracy <= 100 ? "precise" : "approximate");
      } catch (err: unknown) {
        console.warn("[EVverse Navigation] Could not acquire device GPS before route calculation:", err);
        setIsRouteLoading(false);
        setIsNavigating(false);
        setRouteError(
          "Device GPS location is required to calculate and begin turn-by-turn navigation. Please grant location permissions."
        );
        return;
      }
    }

    // Start watchPosition for real GPS device tracking
    if (typeof window !== "undefined" && navigator.geolocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (!isMountedRef.current || watchIdRef.current === null) return;
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setDriverLocation(coords);
          setDeviceLocation(coords);
          setDeviceAccuracy(pos.coords.accuracy);
          setGpsStatus("active");
          if (typeof pos.coords.heading === "number" && !isNaN(pos.coords.heading)) {
            setDriverHeading(pos.coords.heading);
          }
        },
        (err) => {
          if (!isMountedRef.current || watchIdRef.current === null) return;
          console.warn("[EVverse GPS] Location tracking notice:", err.message);
          setGpsStatus(err.code === 1 ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      );
    }

    // Fetch real road route starting from genuine device location
    const res = await fetchRoadRoute({
      origin: startPos,
      destination,
      destinationName,
      chargingWaypoint: chargingWaypoint || null,
    });

    setIsRouteLoading(false);
    if (res.success) {
      setActiveRoute(res);
      setRouteError(null);
    } else {
      setActiveRoute(null);
      setRouteError(res.error || "Could not fetch road route.");
    }
  };

  const startNavigation = (station: DriverStation) => {
    startRoadNavigation({
      destination: [station.latitude, station.longitude],
      destinationName: station.name,
      chargingWaypoint: null,
    });
  };

  // Cancel in-app navigation
  const cancelNavigation = () => {
    if (watchIdRef.current !== null && typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsNavigating(false);
    setActiveRoute(null);
    setRouteError(null);
    setActiveLegIndex(0);
    setCurrentStepIndex(0);
    setDriverHeading(null);
    setIsOffRoute(false);
  };

  // Clean up GPS watcher and track component lifecycle on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (watchIdRef.current !== null && typeof window !== "undefined" && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Real GPS step advancement & off-route detection
  useEffect(() => {
    if (!isNavigating || !activeRoute || !driverLocation) return;
    const currentLeg = activeRoute.legs[activeLegIndex];
    if (!currentLeg) return;

    // Check off-route & advance maneuver asynchronously to prevent synchronous render cascade
    const evalRes = evaluateDriverPositionOnRoute(driverLocation, currentLeg.coordinates);
    const animId = requestAnimationFrame(() => {
      setIsOffRoute(evalRes.isOffRoute);

      const currentStep = currentLeg.steps[currentStepIndex];
      if (currentStep) {
        const dist = calculateDistanceMeters(driverLocation, currentStep.location);
        if (dist < 35 && currentStepIndex < currentLeg.steps.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
        }
      }
    });

    return () => cancelAnimationFrame(animId);
  }, [driverLocation, isNavigating, activeRoute, activeLegIndex, currentStepIndex]);

  // Start Charging Session
  const startChargingSession = (station?: DriverStation) => {
    const target = station || selectedStation || filteredStations[0];
    if (!target) return;

    setChargeStation(target);
    setIsCharging(true);
    setChargeElapsedSeconds(0);
    setChargeKwhDelivered(0);

    const maxKw = Math.min(activeVehicle.maxDcSpeedKw, target.power_kw || 150);
    setChargeCurrentKw(maxKw);
    setActiveTab("charging");
    setIsStationDetailOpen(false);
  };

  // Stop Charging Session
  const stopChargingSession = () => {
    if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
    setIsCharging(false);
    setShowReceiptModal(true);

    if (chargeStation && chargeKwhDelivered > 0) {
      recordChargingSession({
        station_id: chargeStation.station_id,
        station_name: chargeStation.name,
        kwh_delivered: chargeKwhDelivered,
        duration_seconds: chargeElapsedSeconds,
        cost: chargeCost,
        max_power_kw: chargeCurrentKw,
      }).catch((err) => {
        console.warn("[QuantEV] Could not save charging session to backend:", err);
      });
    }
  };

  // Live Charging Simulation Timer
  useEffect(() => {
    if (isCharging) {
      chargeIntervalRef.current = setInterval(() => {
        setChargeElapsedSeconds((prev) => prev + 1);

        setChargeKwhDelivered((prev) => {
          const increment = +(chargeCurrentKw / 3600).toFixed(4);
          const nextKwh = +(prev + increment).toFixed(3);
          const parsedRate = chargeStation?.usage_cost
            ? parseFloat(chargeStation.usage_cost.replace(/[^0-9.]/g, ""))
            : null;
          const rate = parsedRate && !isNaN(parsedRate) && parsedRate > 0 ? parsedRate : 0;
          setChargeCost(+(nextKwh * rate).toFixed(2));
          return nextKwh;
        });

        setCurrentBatteryPct((prev) => {
          if (prev >= chargeTargetLimit) {
            stopChargingSession();
            return chargeTargetLimit;
          }
          return prev + 0.1 > chargeTargetLimit ? chargeTargetLimit : +(prev + 0.05).toFixed(1);
        });
      }, 1000);
    } else {
      if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
    }

    return () => {
      if (chargeIntervalRef.current) clearInterval(chargeIntervalRef.current);
    };
  }, [isCharging, chargeCurrentKw, chargeTargetLimit]);

  return (
    <div
      className={`min-h-screen md:min-h-screen h-[100dvh] md:h-auto w-full flex flex-col items-center selection:bg-[#111312] selection:text-white transition-colors duration-300 ${isFramed
        ? "bg-[#0C0E0D] text-[#111312]"
        : "bg-[#FAF9F6] text-[#111312]"
        }`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      }}
    >
      {/* ── Studio Toolbar (visible on desktop) ── */}
      <div className={`hidden md:flex w-full max-w-5xl items-center justify-between px-6 py-3 border-b text-xs z-50 transition-colors ${isFramed
        ? "border-[rgba(255,255,255,0.08)] text-[#8C938E]"
        : "border-black/[0.08] text-[#525854]"
      }`}>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
              isFramed
                ? "bg-white/10 hover:bg-white/20 text-white border-white/15"
                : "bg-black/[0.05] hover:bg-black/[0.1] text-[#111312] border-black/10"
            }`}
            title="Return to EVverse Landing Page"
          >
            <ArrowLeft size={13} />
            <span>Landing Page</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isFramed ? "bg-[#C8F369]" : "bg-[#16A34A]"}`} />
            <span className={`font-bold tracking-tight ${isFramed ? "text-white" : "text-[#111312]"}`}>
              EV VERSE MOBILE DRIVER APP
            </span>
          </div>
          <span className={`text-[11px] px-2 py-0.5 rounded-md font-mono ${
            isFramed
              ? "bg-white/10 text-white/80"
              : "bg-black/[0.06] text-[#525854] font-semibold"
          }`}>
            Live Cockpit
          </span>
        </div>
        <div className="text-[11px] font-mono text-[#8C938E]">
          iPhone 16 Pro Preview
        </div>
      </div>
      {/* ── Outer Mobile Container Shell ── */}
      <div
        className={`w-full flex-1 flex items-center justify-center ${isFramed ? "py-6 px-4" : "py-0 px-0 max-w-[430px]"
          }`}
      >
        {/* Hardware Frame or Standard Container */}
        <div
          className={
            isFramed
              ? "relative w-[424px] max-w-full h-[866px] rounded-[56px] p-[10px] flex flex-col select-none"
              : "w-full max-w-[430px] h-[100dvh] max-h-[100dvh] flex flex-col relative bg-[#FAF9F6] shadow-2xl border-x border-[rgba(17,19,18,0.06)] overflow-hidden"
          }
          style={
            isFramed
              ? {
                background:
                  "linear-gradient(145deg, #383B39 0%, #1D1F1E 30%, #303331 60%, #151716 100%)",
                boxShadow:
                  "0 45px 120px -20px rgba(0,0,0,0.95), 0 25px 60px -15px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 2px rgba(255,255,255,0.25)",
              }
              : undefined
          }
        >
          {/* Physical Hardware Buttons (Left & Right) */}
          {isFramed && (
            <>
              {/* Left: Action Button */}
              <div
                className="absolute -left-[5px] top-28 w-[5px] h-8 rounded-l-xs"
                style={{
                  background: "linear-gradient(to right, #242625, #444845)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              />
              {/* Left: Volume Up */}
              <div
                className="absolute -left-[5px] top-40 w-[5px] h-12 rounded-l-xs"
                style={{
                  background: "linear-gradient(to right, #242625, #444845)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              />
              {/* Left: Volume Down */}
              <div
                className="absolute -left-[5px] top-56 w-[5px] h-12 rounded-l-xs"
                style={{
                  background: "linear-gradient(to right, #242625, #444845)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              />
              {/* Right: Power / Siri Button */}
              <div
                className="absolute -right-[5px] top-36 w-[5px] h-16 rounded-r-xs"
                style={{
                  background: "linear-gradient(to left, #242625, #444845)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              />
              {/* Right: Camera Control Touch Groove */}
              <div
                className="absolute -right-[4.5px] top-64 w-[4.5px] h-14 rounded-r-xs opacity-75"
                style={{
                  background: "linear-gradient(to left, #1A1C1B, #333634)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1)",
                }}
              />
            </>
          )}

          {/* Inner OLED Glass Bezel */}
          <div
            className={
              isFramed
                ? "w-full h-full rounded-[48px] bg-[#0A0C0B] p-[6px] flex flex-col relative overflow-hidden"
                : "w-full h-full flex flex-col"
            }
          >
            {/* Specular Diagonal Glass Highlight Sheen */}
            {isFramed && (
              <div
                className="pointer-events-none absolute -top-32 -right-32 w-80 h-80 rounded-full z-50 opacity-40"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 70%)",
                }}
              />
            )}

            {/* ── Seamless Display Canvas ── */}
            <div
              className={`w-full h-full flex flex-col relative bg-[#FAF9F6] overflow-hidden ${isFramed ? "rounded-[42px]" : ""
                }`}
            >
              {/* iOS Dynamic Island & Status Bar (in frame mode) */}
              {isFramed && (
                <div className="h-10 w-full relative flex items-center justify-between px-6 shrink-0 z-40 bg-[#FAF9F6] border-b border-black/[0.04] select-none">
                  {/* iOS Time (Left) */}
                  <span className="text-[13px] font-semibold text-[#111312] font-mono tracking-tight z-10">
                    9:41
                  </span>

                  {/* Hyperrealistic Dynamic Island - EXACT HORIZONTAL CENTER */}
                  <div
                    className={`absolute left-1/2 -translate-x-1/2 top-1.5 transition-all duration-300 h-7 bg-black rounded-full flex items-center justify-between px-2.5 shadow-md z-20 ${isCharging
                      ? "w-48 bg-black text-[#34D399]"
                      : isNavigating
                        ? "w-44 bg-black text-white"
                        : "w-24 bg-black"
                      }`}
                  >
                    {isCharging ? (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                          <Zap size={11} className="text-[#34D399] animate-pulse" />
                          <span>+{chargeCurrentKw} kW</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-white">
                            {currentBatteryPct}%
                          </span>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] border border-black" />
                        </div>
                      </>
                    ) : isNavigating && activeRoute ? (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#38BDF8]">
                          <Navigation size={11} />
                          <span>{activeRoute.legs[activeLegIndex]?.distanceKm || activeRoute.totalDistanceKm} km</span>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-[#38BDF8] animate-pulse" />
                      </>
                    ) : (
                      <>
                        {/* True sapphire lens reflection & sensor */}
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0D1527] border border-[#233554] shadow-inner" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#0A0E17] border border-[#162136]" />
                      </>
                    )}
                  </div>

                  {/* iOS Status Indicators (Cellular Bars, 5G, Wi-Fi, Battery) */}
                  <div className="flex items-center gap-1.5 text-[#111312] z-10">
                    {/* Cellular 4-Bars SVG */}
                    <svg className="w-3.5 h-2.5 fill-current" viewBox="0 0 17 12">
                      <rect x="0" y="9" width="2.5" height="3" rx="0.5" />
                      <rect x="4.5" y="6" width="2.5" height="6" rx="0.5" />
                      <rect x="9" y="3" width="2.5" height="9" rx="0.5" />
                      <rect x="13.5" y="0" width="2.5" height="12" rx="0.5" />
                    </svg>

                    {/* 5G Badge */}
                    <span className="text-[10.5px] font-mono font-bold">5G</span>

                    {/* Wi-Fi Arcs SVG */}
                    <svg className="w-3.5 h-2.5 fill-current" viewBox="0 0 16 12">
                      <path d="M8 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-4.24-2.83a6 6 0 018.48 0l-1.06 1.06a4.5 4.5 0 00-6.36 0L3.76 7.67zm-2.83-2.83a10 10 0 0114.14 0l-1.06 1.06a8.5 8.5 0 00-12.02 0L.93 4.84z" />
                    </svg>

                    {/* iOS Battery Cylinder with Fill */}
                    <div className="relative w-5 h-2.5 border-[1.5px] border-[#111312] rounded-[3px] p-[1px] flex items-center">
                      <div
                        className="h-full bg-[#111312] rounded-[1px] transition-all"
                        style={{ width: `${Math.max(10, currentBatteryPct)}%` }}
                      />
                      <div className="absolute -right-[3px] top-[2px] w-[1.5px] h-1 bg-[#111312] rounded-r-[1px]" />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Top Driver Status Header ─────────────────────────────────────── */}
              <header
                className="shrink-0 z-30 px-4 py-3 border-b flex items-center justify-between"
                style={{
                  background: "rgba(250, 249, 246, 0.96)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderColor: "rgba(17, 19, 18, 0.07)",
                }}
                aria-label="Driver App Header"
              >
                {/* Brand Logo & Back to Home */}
                <div className="flex items-center gap-2.5 min-w-0">
                  {activeTab !== "home" ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab("home")}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111312] bg-white border border-[rgba(17,19,18,0.08)] p-2 rounded-xl shadow-2xs hover:bg-[#F5F4EF] transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#111312] cursor-pointer"
                      title="Return to Home Cockpit"
                      aria-label="Back to Home"
                    >
                      <ArrowLeft size={14} />
                    </button>
                  ) : (
                    <Link
                      href="/"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#111312] bg-white border border-[rgba(17,19,18,0.08)] px-2 py-1.5 rounded-xl shadow-2xs hover:bg-[#F5F4EF] transition-colors shrink-0"
                      title="Return to EVverse Landing Page"
                      aria-label="Back to Landing Page"
                    >
                      <ArrowLeft size={12} />
                      <span>Home</span>
                    </Link>
                  )}
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center">
                    <Image
                      src="/images/evverse-logo.png"
                      alt="EVverse Logo"
                      width={40}
                      height={40}
                      priority
                      className="object-contain w-full h-full"
                    />
                  </div>
                </div>

                {/* Right: Subtle Live Data Button & Hamburger Menu */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLiveDataSheetOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-[#111312] bg-[#F5F4EF] hover:bg-[#EAE8E2] border border-black/[0.06] shadow-2xs transition-all active:scale-95 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
                    title="Live charging data sources"
                    aria-label="Live charging data sources"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#16A34A] animate-pulse" : "bg-[#D97706]"
                        }`}
                    />
                    <span>Live Data</span>
                  </button>

                  <button
                    type="button"
                    id="driver-menu-button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="w-9 h-9 rounded-xl bg-white border border-black/[0.08] flex items-center justify-center text-[#111312] hover:bg-[#F2EFE9] active:scale-95 transition-all shadow-2xs cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
                    aria-label="Open navigation menu"
                    title="Open navigation menu"
                  >
                    <Menu size={18} />
                  </button>
                </div>
              </header>

              {/* ── Main Viewport Content ────────────────────────────────────────── */}
              <main className="flex-1 flex flex-col relative overflow-y-auto no-scrollbar">

                {/* ═════════ TAB 1: HOME (Cockpit) ═════════ */}
                {activeTab === "home" && (
                  <div className="p-4 flex-1">
                    <VehicleCockpit
                      vehicle={activeVehicle}
                      currentBatteryPct={currentBatteryPct}
                      calibratedRangeKm={calibratedRangeKm}
                      driveMode={driveMode}
                      setDriveMode={setDriveMode}
                      hvacActive={hvacActive}
                      setHvacActive={setHvacActive}
                      doorsLocked={doorsLocked}
                      setDoorsLocked={setDoorsLocked}
                      isPreconditioning={isPreconditioning}
                      setIsPreconditioning={setIsPreconditioning}
                      nearestUltraStation={nearestUltraStation}
                      onNavigateToNearest={() => {
                        if (nearestUltraStation?.raw) {
                          startNavigation(nearestUltraStation.raw);
                        }
                      }}
                      onOpenGarage={() => setIsVehicleManagerOpen(true)}
                      onOpenJourneyPlanner={() => setActiveTab("journeys")}
                      selectedCity={selectedCity}
                      onCityChange={setSelectedCity}
                    />
                  </div>
                )}

                {/* ═════════ TAB 2: EXPLORE (Charging Map) ═════════ */}
                {activeTab === "explore" && (
                  <div className="flex-1 flex flex-col relative w-full h-full min-h-0">
                    {/* Interactive Leaflet Map Viewport */}
                    <div className="flex-1 relative w-full h-full">
                      <DriverMobileMap
                        center={mapCenter}
                        zoom={mapZoom}
                        userLocation={userLocation}
                        deviceLocation={deviceLocation}
                        deviceAccuracy={deviceAccuracy}
                        locationStatus={locationStatus}
                        onAcquireLocation={() => requestDeviceLocation(true)}
                        stations={filteredStations}
                        selectedStation={selectedStation}
                        onStationSelect={(st) => {
                          setSelectedStation(st);
                          setIsStationDetailOpen(true);
                        }}
                        activeRoute={activeRoute}
                        activeLegIndex={activeLegIndex}
                        driverLocation={driverLocation}
                        driverHeading={driverHeading}
                        isNavigating={isNavigating}
                        routeError={routeError}
                        onRetryRoute={() => {
                          if (activeRoute) {
                            startRoadNavigation({
                              destination: activeRoute.destinationCoords,
                              destinationName: activeRoute.destinationName,
                              chargingWaypoint: activeRoute.chargingWaypointCoords
                                ? {
                                  name: activeRoute.chargingWaypointName || "Charging Stop",
                                  latitude: activeRoute.chargingWaypointCoords[0],
                                  longitude: activeRoute.chargingWaypointCoords[1],
                                }
                                : null,
                            });
                          }
                        }}
                      />

                      {/* Floating Top Controls (Search & Quick Filters) */}
                      {!isStationDetailOpen && !isNavigating && (
                        <div className="absolute top-3 left-3 right-3 z-20 space-y-2 pointer-events-auto">
                          {/* Search Bar */}
                          <div className="relative w-full">
                            <Search
                              size={15}
                              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C938E] pointer-events-none"
                            />
                            <input
                              type="text"
                              placeholder={`Search charging stations in ${selectedCity}...`}
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              aria-label={`Search charging stations in ${selectedCity}`}
                              className="w-full pl-9 pr-9 py-2.5 bg-white/95 backdrop-blur-md rounded-2xl border border-[rgba(17,19,18,0.1)] text-[16px] sm:text-xs font-medium text-[#111312] placeholder-[#8C938E] shadow-sm focus:outline-hidden focus:ring-1 focus:ring-[#111312]"
                            />
                            {searchQuery && (
                              <button
                                onClick={() => setSearchQuery("")}
                                aria-label="Clear search text"
                                className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#8C938E] hover:text-[#111312] cursor-pointer rounded-full"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          {/* Filter Pills */}
                          <div
                            role="group"
                            aria-label="Filter Charging Stations"
                            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5"
                          >
                            {/* Will I Make It? Direct Route Feasibility Action */}
                            <button
                              type="button"
                              onClick={() => setActiveTab("journeys")}
                              className="px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-xs active:scale-95 cursor-pointer flex items-center gap-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white shrink-0 focus-visible:outline-2 focus-visible:outline-[#0284C7]"
                            >
                              <Gauge size={13} className="text-white" />
                              <span>Will I Make It?</span>
                            </button>

                            {(
                              [
                                { id: "all", label: "All Speeds" },
                                { id: "ultra", label: "Ultra (150kW+)" },
                                { id: "fast", label: "Fast (50kW+)" },
                                { id: "ac", label: "Standard AC" },
                              ] as const
                            ).map((f) => {
                              const isActive = speedFilter === f.id;
                              return (
                                <button
                                  key={f.id}
                                  onClick={() => setSpeedFilter(f.id)}
                                  aria-pressed={isActive}
                                  className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#0284C7] ${isActive
                                    ? "bg-[#E0F2FE] text-[#0369A1] border border-[#0284C7]"
                                    : "bg-white/95 backdrop-blur-md text-slate-700 border border-slate-200 hover:bg-slate-50"
                                    }`}
                                >
                                  {f.label}
                                </button>
                              );
                            })}

                            {/* Connector Match Toggle */}
                            <button
                              onClick={() => {
                                const next = !(onlyCompatible || autoCompatibility);
                                setOnlyCompatible(next);
                                if (!next && autoCompatibility) {
                                  handleToggleAutoCompatibility(false);
                                }
                              }}
                              aria-pressed={onlyCompatible || autoCompatibility}
                              className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#16A34A] ${onlyCompatible || autoCompatibility
                                ? "bg-[#DCFCE7] text-[#15803D] border border-[#86EFAC]"
                                : "bg-white/95 backdrop-blur-md text-slate-700 border border-slate-200 hover:bg-slate-50"
                                }`}
                            >
                              Compatible ({activeVehicle.plugType.split(" ")[0]})
                            </button>

                            {/* Saved Bookmarks Filter */}
                            {savedStationIds.size > 0 && (
                              <button
                                onClick={() => setOnlySaved(!onlySaved)}
                                aria-pressed={onlySaved}
                                className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#EF4444] ${onlySaved
                                  ? "bg-[#EF4444] text-white"
                                  : "bg-white/95 backdrop-blur-md text-[#EF4444] border border-[#FCA5A5]"
                                  }`}
                              >
                                Saved ({savedStationIds.size})
                              </button>
                            )}
                          </div>

                          {/* Location Status Feedback Banner */}
                          {locationStatus === "detecting" && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-md rounded-xl border border-black/[0.08] text-[11px] font-medium text-[#525854] shadow-xs">
                              <div className="w-3 h-3 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin shrink-0" />
                              <span>Detecting device location...</span>
                            </div>
                          )}
                          {locationStatus === "denied" && (
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#FFFBEB] rounded-xl border border-[#FDE68A] text-[11px] text-[#92400E] shadow-xs">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={13} className="text-[#D97706] shrink-0" />
                                <span>Location access denied. Showing {selectedCity} center.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => requestDeviceLocation(true)}
                                className="font-semibold underline ml-2 cursor-pointer hover:text-[#78350F]"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                          {(locationStatus === "unavailable" || locationStatus === "timeout") && (
                            <div className="flex items-center justify-between px-3 py-1.5 bg-[#FFFBEB] rounded-xl border border-[#FDE68A] text-[11px] text-[#92400E] shadow-xs">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle size={13} className="text-[#D97706] shrink-0" />
                                <span>GPS signal unavailable. Showing {selectedCity} center.</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => requestDeviceLocation(true)}
                                className="font-semibold underline ml-2 cursor-pointer hover:text-[#78350F]"
                              >
                                Retry
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Genuine Road Turn-by-Turn Navigation HUD */}
                      {isNavigating && activeRoute && (
                        <NavigationHUD
                          route={activeRoute}
                          activeLegIndex={activeLegIndex}
                          currentStepIndex={currentStepIndex}
                          driverLocation={driverLocation}
                          driverHeading={driverHeading}
                          gpsStatus={gpsStatus}
                          isOffRoute={isOffRoute}
                          activeVehicleSoc={currentBatteryPct}
                          onAdvanceToLeg={(nextLeg) => {
                            if (nextLeg < activeRoute.legs.length) {
                              setActiveLegIndex(nextLeg);
                              setCurrentStepIndex(0);
                            }
                          }}
                          onExitNavigation={cancelNavigation}
                        />
                      )}

                      {/* Empty State Overlay when 0 stations found */}
                      {filteredStations.length === 0 && !loading && (
                        <div className="absolute inset-x-3 bottom-4 z-20">
                          <EmptyState onReset={handleResetFilters} />
                        </div>
                      )}

                      {/* Bottom Quick Hubs Drawer / Peek Card */}
                      {!isStationDetailOpen && !isNavigating && filteredStations.length > 0 && (
                        <div className="absolute bottom-3 left-3 right-3 z-20 bg-white/95 backdrop-blur-md rounded-2xl p-3.5 border border-[rgba(17,19,18,0.08)] shadow-lg">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C938E] font-semibold">
                              {filteredStations.length} Charging Stations
                            </span>
                            <button
                              type="button"
                              onClick={() => setIsLiveDataSheetOpen(true)}
                              className={`text-[10px] font-semibold font-mono flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${isLive
                                ? "text-[#16A34A] bg-emerald-50 border-emerald-200 hover:bg-emerald-100/70"
                                : "text-[#D97706] bg-amber-50 border-amber-200 hover:bg-amber-100/70"
                                }`}
                              title="Click to view data source details"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-[#16A34A] animate-pulse" : "bg-[#D97706]"
                                  }`}
                                aria-hidden="true"
                              />
                              <span>{isLive ? "Live OCM" : "Static Baseline"}</span>
                            </button>
                          </div>

                          {/* First Station Preview Card */}
                          {filteredStations[0] && (
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label={`View details for ${filteredStations[0].name}`}
                              onClick={() => {
                                setSelectedStation(filteredStations[0]);
                                setIsStationDetailOpen(true);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  setSelectedStation(filteredStations[0]);
                                  setIsStationDetailOpen(true);
                                }
                              }}
                              className="flex items-center justify-between cursor-pointer group rounded-xl p-1 -m-1 focus-visible:outline-2 focus-visible:outline-[#111312]"
                            >
                              <div className="pr-3 truncate">
                                <div className="text-xs font-bold text-[#111312] group-hover:text-[#16A34A] transition-colors truncate">
                                  {filteredStations[0].name}
                                </div>
                                <div className="text-[10.5px] text-[#525854] font-mono mt-0.5">
                                  {filteredStations[0].distanceKm ? `${filteredStations[0].distanceKm.toFixed(1)} km` : "Nearby"} • {filteredStations[0].power_kw || 120} kW DC • {filteredStations[0].bays} Bays
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStation(filteredStations[0]);
                                    setIsStationDetailOpen(true);
                                  }}
                                  className="min-h-[40px] px-3 py-2 bg-[#F0FDF4] border border-[#BBF7D0] text-[#15803D] rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-[#DCFCE7] active:scale-95 cursor-pointer"
                                >
                                  <Zap size={12} className="text-[#16A34A]" />
                                  <span>Book Stall</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startNavigation(filteredStations[0]);
                                  }}
                                  aria-label={`Start navigation to ${filteredStations[0].name}`}
                                  className="min-h-[40px] px-3.5 py-2 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs active:scale-95 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0284C7]"
                                >
                                  <Navigation size={12} className="text-white fill-white/20" aria-hidden="true" />
                                  Route
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Complete Station Detail Sheet Experience */}
                      <StationDetailSheet
                        station={selectedStation}
                        userLocation={userLocation}
                        isOpen={isStationDetailOpen && !!selectedStation}
                        onClose={() => setIsStationDetailOpen(false)}
                        onStartNavigation={(st: LiveStation) => startNavigation(st as DriverStation)}
                        onStartCharging={(st) => startChargingSession(st as DriverStation)}
                        isSaved={selectedStation ? savedStationIds.has(selectedStation.station_id) : false}
                        onToggleSave={(id) => toggleSaveStation(id)}
                        activeVehicleSoc={currentBatteryPct}
                        vehicleWltpKm={activeVehicle.wltpRangeKm}
                        activeVehicle={activeVehicle}
                      />
                    </div>
                  </div>
                )}

                {/* ═════════ TAB 3: JOURNEYS (Corridor Planner) ═════════ */}
                {activeTab === "journeys" && (
                  <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between w-full h-full max-w-lg mx-auto">
                    <JourneyPlanner
                      activeVehicle={activeVehicle}
                      currentBatteryPct={currentBatteryPct}
                      candidateStations={journeyCandidateStations}
                      userLocation={userLocation}
                      deviceLocation={deviceLocation}
                      deviceAccuracy={deviceAccuracy}
                      locationStatus={locationStatus}
                      onAcquireLocation={() => requestDeviceLocation(true)}
                      selectedCity={selectedCity}
                      onStartTripNavigation={({ name, latitude, longitude, primaryStation, originCoords }) => {
                        startRoadNavigation({
                          destination: [latitude, longitude],
                          destinationName: name,
                          chargingWaypoint: primaryStation
                            ? {
                              name: primaryStation.name,
                              latitude: primaryStation.latitude,
                              longitude: primaryStation.longitude,
                            }
                            : null,
                          originCoords,
                        });
                      }}
                    />
                  </div>
                )}

                {/* ═════════ TAB 4: CHARGING (Session Console) ═════════ */}
                {activeTab === "charging" && (
                  <div className="p-4 flex-1">
                    <ChargingConsole
                      isCharging={isCharging}
                      vehicle={activeVehicle}
                      currentBatteryPct={currentBatteryPct}
                      chargeStation={chargeStation}
                      targetLimit={chargeTargetLimit}
                      setTargetLimit={setChargeTargetLimit}
                      elapsedSeconds={chargeElapsedSeconds}
                      kwhDelivered={chargeKwhDelivered}
                      currentKw={chargeCurrentKw}
                      chargeCost={chargeCost}
                      onStartCharge={() => startChargingSession()}
                      onStopCharge={stopChargingSession}
                      showReceiptModal={showReceiptModal}
                      onCloseReceiptModal={() => setShowReceiptModal(false)}
                    />
                  </div>
                )}

                {/* ═════════ TAB 5: PROFILE (Account & Preferences) ═════════ */}
                {activeTab === "profile" && (
                  <DriverProfile
                    activeVehicle={activeVehicle}
                    vehicles={vehicles}
                    currentBatteryPct={currentBatteryPct}
                    selectedCity={selectedCity}
                    onCityChange={setSelectedCity}
                    autoCompatibility={autoCompatibility}
                    onToggleAutoCompatibility={(next) => {
                      setAutoCompatibility(next);
                      setOnlyCompatible(next);
                      saveStoredAutoCompatibility(next);
                      syncAutoCompatibility(next);
                    }}
                    savedStationIds={savedStationIds}
                    onOpenVehicleManager={() => setIsVehicleManagerOpen(true)}
                  />
                )}

                {/* ═════════ TAB 6: GARAGE (Redirected to Dedicated Manager) ═════════ */}
                {activeTab === "garage" && (
                  <div className="p-4 flex-1">
                    <VehicleManager
                      isOpen={true}
                      onClose={() => setActiveTab("home")}
                      vehicles={vehicles}
                      activeVehicleId={activeVehicleId}
                      onSelectVehicle={handleSelectVehicle}
                      onAddVehicle={handleAddVehicle}
                      onUpdateVehicle={handleUpdateVehicle}
                      onRemoveVehicle={handleRemoveVehicle}
                    />
                  </div>
                )}
              </main>

              {/* ── Dedicated Full-Screen Vehicle Management Experience ───────── */}
              <VehicleManager
                isOpen={isVehicleManagerOpen}
                onClose={() => setIsVehicleManagerOpen(false)}
                vehicles={vehicles}
                activeVehicleId={activeVehicleId}
                onSelectVehicle={handleSelectVehicle}
                onAddVehicle={handleAddVehicle}
                onUpdateVehicle={handleUpdateVehicle}
                onRemoveVehicle={handleRemoveVehicle}
              />

              {/* ── Left-side Navigation Drawer (Replaces Bottom Bar) ─────────── */}
              <DriverDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                activeTab={activeTab}
                onSelectTab={(tab) => {
                  if (tab === "garage") {
                    setIsVehicleManagerOpen(true);
                  } else {
                    setActiveTab(tab);
                  }
                }}
                activeVehicle={activeVehicle}
                onOpenGarage={() => setIsVehicleManagerOpen(true)}
              />

              {/* ── Transparent Multi-Source Live Data Panel ───────────────────── */}
              <LiveDataSourceSheet
                isOpen={isLiveDataSheetOpen}
                onClose={() => setIsLiveDataSheetOpen(false)}
                selectedCity={selectedCity}
                isLive={isLive}
                source={source}
                stationCount={stationCount}
                lastUpdatedTime={lastUpdatedTime}
                loading={loading}
                fallbackReason={fallbackReason}
                sources={sources}
                onRefresh={refetch}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
