"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { BrandLogo } from "@/components/BrandLogo";
import { useLiveData } from "@/hooks/useLiveData";
import { CITY_CONFIGS } from "@/components/CountryCitySelector";
import type { LiveStation } from "@/types/api";

// Driver Mobile Components
import { DriverNav, DriverTab } from "@/components/driver/DriverNav";
import { VehicleCockpit, EVVehicle } from "@/components/driver/VehicleCockpit";
import { JourneyPlanner } from "@/components/driver/JourneyPlanner";
import { ChargingConsole } from "@/components/driver/ChargingConsole";
import { GarageFleet } from "@/components/driver/GarageFleet";
import {
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  OfflineNotice,
} from "@/components/driver/StatusStates";
import { StationDetailSheet } from "@/components/driver/StationDetailSheet";
import {
  ParkingBookingModal,
  type ParkingBooking,
} from "@/components/driver/ParkingBookingModal";
import {
  MONAD_CONFIG,
  getExistingAccounts,
  getCurrentChainId,
  requestWalletAccounts,
  truncateAddress,
} from "@/lib/monadPayment";
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
  // Navigation tabs: home, explore, journeys, charging, garage
  const [activeTab, setActiveTab] = useState<DriverTab>("home");

  // Desktop Studio Frame Controls: "frame" (iPhone 16 Pro mockup), "fluid" (clean mobile column), "expanded" (wide responsive cockpit)
  const [viewMode, setViewMode] = useState<"frame" | "fluid" | "expanded">("frame");
  const [isMobileScreen, setIsMobileScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isFramed = !isMobileScreen && viewMode === "frame";
  const effectiveViewMode = isMobileScreen ? "fluid" : viewMode;

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

  // User Location (centered relative to selected city)
  const [userLocation, setUserLocation] = useState<[number, number]>([
    cityConfig.lat + 0.008,
    cityConfig.lng - 0.006,
  ]);

  // Live stations from backend API
  const { data: liveData, loading, error, isLive, stationCount, source } = useLiveData(selectedCity);

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

  // In-app Navigation State
  const [navStation, setNavStation] = useState<DriverStation | null>(null);
  const [navProgress, setNavProgress] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const navIntervalRef = useRef<NodeJS.Timeout | number | null>(null);

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

  // User geolocation detection with graceful denial handling
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(coords);
        },
        (err) => {
          console.info("[EV Verse] Geolocation not granted; using regional baseline coordinates:", err.code);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  // Center map on city change (render-phase state adjustment)
  const [prevCity, setPrevCity] = useState(selectedCity);
  if (selectedCity !== prevCity) {
    setPrevCity(selectedCity);
    setMapCenter([cityConfig.lat, cityConfig.lng]);
    setUserLocation([cityConfig.lat + 0.008, cityConfig.lng - 0.006]);
  }

  // Update battery percentage when vehicle changes
  const [prevVehicleId, setPrevVehicleId] = useState(activeVehicleId);
  if (activeVehicleId !== prevVehicleId) {
    setPrevVehicleId(activeVehicleId);
    setCurrentBatteryPct(activeVehicle.currentBatteryPct);
  }

  // Active Spot Booking State
  const [activeSpotBooking, setActiveSpotBooking] = useState<ParkingBooking | null>(null);

  useEffect(() => {
    const checkBooking = () => {
      try {
        const stored = localStorage.getItem("evverse_active_spot_booking");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.expiryTimestamp > Date.now()) {
            setActiveSpotBooking(parsed);
            return;
          }
        }
        setActiveSpotBooking(null);
      } catch {
        setActiveSpotBooking(null);
      }
    };
    checkBooking();
    window.addEventListener("evverse-spot-booking-changed", checkBooking);
    const interval = setInterval(checkBooking, 4000);
    return () => {
      window.removeEventListener("evverse-spot-booking-changed", checkBooking);
      clearInterval(interval);
    };
  }, []);

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
      .filter((d) => d.city.toLowerCase() === selectedCity.toLowerCase())
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

  // Monad Testnet Payment Modal State & Web3 Wallet Sync
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [driverWalletAddress, setDriverWalletAddress] = useState<string | null>(null);
  const [driverWalletChainId, setDriverWalletChainId] = useState<string | null>(null);
  const [isDriverConnectingWallet, setIsDriverConnectingWallet] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    getExistingAccounts().then((accounts) => {
      if (accounts && accounts.length > 0) {
        setDriverWalletAddress(accounts[0]);
      }
    });

    getCurrentChainId().then((chainId) => {
      if (chainId) setDriverWalletChainId(chainId.toLowerCase());
    });

    const handleAccountsChanged = (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs && accs.length > 0) {
        setDriverWalletAddress(accs[0]);
      } else {
        setDriverWalletAddress(null);
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      if (typeof chainId === "string") {
        setDriverWalletChainId(chainId.toLowerCase());
      }
    };

    window.ethereum.on?.("accountsChanged", handleAccountsChanged);
    window.ethereum.on?.("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const isDriverMonadActive =
    driverWalletChainId === MONAD_CONFIG.chainIdHex.toLowerCase();

  const handleDriverConnectWallet = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsDriverConnectingWallet(true);
    try {
      const accounts = await requestWalletAccounts();
      if (accounts && accounts.length > 0) {
        setDriverWalletAddress(accounts[0]);
      }
      const chain = await getCurrentChainId();
      if (chain) setDriverWalletChainId(chain.toLowerCase());
    } catch (err) {
      console.warn("[EVverse Driver Wallet Connect]:", err);
    } finally {
      setIsDriverConnectingWallet(false);
    }
  };

  // Derive target station for Monad booking/checkout flow
  const paymentTargetStation = useMemo<LiveStation>(() => {
    if (selectedStation) return selectedStation;
    if (activeSpotBooking) {
      const booked = stationsWithDistance.find((s) => s.station_id === activeSpotBooking.stationId);
      if (booked) return booked;
    }
    if (nearestUltraStation?.raw) return nearestUltraStation.raw;
    if (filteredStations.length > 0) return filteredStations[0];
    if (stationsWithDistance.length > 0) return stationsWithDistance[0];
    return {
      station_id: `EVV-MONAD-${selectedCity.toUpperCase()}-01`,
      name: `${selectedCity} Central Monad Fast Charger`,
      latitude: cityConfig.lat,
      longitude: cityConfig.lng,
      address: `Central Hub, ${selectedCity}`,
      operator: "EVverse Monad Network",
      status: "Operational",
      is_operational: true,
      power_kw: 150,
      bays: 4,
      connector_types: [activeVehicle.plugType, "CCS2 Combo", "Type 2"],
      usage_cost: "$0.28/kWh",
      source: "open_charge_map",
    };
  }, [
    selectedStation,
    activeSpotBooking,
    stationsWithDistance,
    nearestUltraStation,
    filteredStations,
    selectedCity,
    cityConfig,
    activeVehicle.plugType,
  ]);

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
    syncActiveVehicleId(id);
  };

  const handleAddVehicle = async (newVehicle: EVVehicle) => {
    try {
      const updated = [newVehicle, ...vehicles];
      setVehicles(updated);
      saveStoredVehicles(updated);
      setActiveVehicleId(newVehicle.id);
      saveStoredActiveVehicleId(newVehicle.id);
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

  // Launch in-app navigation
  const startNavigation = (station: DriverStation) => {
    setNavStation(station);
    setIsNavigating(true);
    setNavProgress(0);
    setActiveTab("explore");
    setIsStationDetailOpen(false);

    if (navIntervalRef.current) clearInterval(navIntervalRef.current);
    navIntervalRef.current = setInterval(() => {
      setNavProgress((prev) => {
        if (prev >= 1) {
          if (navIntervalRef.current) clearInterval(navIntervalRef.current);
          return 1;
        }
        return prev + 0.03;
      });
    }, 500);
  };

  // Cancel in-app navigation
  const cancelNavigation = () => {
    if (navIntervalRef.current) clearInterval(navIntervalRef.current);
    setIsNavigating(false);
    setNavStation(null);
    setNavProgress(0);
  };

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
          setChargeCost(+(nextKwh * 0.28).toFixed(2));
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
      className={`min-h-screen w-full flex flex-col items-center selection:bg-[#111312] selection:text-white transition-colors duration-300 ${
        isFramed
          ? "bg-[#0C0E0D] text-[#111312]"
          : "bg-[#FAF9F6] text-[#111312]"
      }`}
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      }}
    >
      {/* ── Studio Toolbar (visible on desktop) ── */}
      <div className="hidden md:flex w-full max-w-5xl items-center justify-between px-6 py-3 border-b border-[rgba(255,255,255,0.08)] text-xs text-[#8C938E] z-50">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white/90 hover:text-white bg-white/10 hover:bg-white/15 transition-all border border-white/10"
            title="Return to EVverse Landing Page"
          >
            <ArrowLeft size={13} />
            <span>Back to EVverse</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C8F369]" />
            <span className="font-bold text-white tracking-tight">EV VERSE MOBILE DRIVER APP</span>
          </div>
          <span className="text-[11px] bg-white/10 text-white/80 px-2 py-0.5 rounded-md font-mono">
            Port 3001
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-[#1A1D1B] p-1 rounded-xl border border-[rgba(255,255,255,0.08)]">
          <button
            onClick={() => setViewMode("frame")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === "frame" ? "bg-[#C8F369] text-[#111312] shadow-xs" : "text-[#8C938E] hover:text-white"
            }`}
          >
            Phone Frame
          </button>
          <button
            onClick={() => setViewMode("fluid")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === "fluid" ? "bg-white text-[#111312] shadow-xs" : "text-[#8C938E] hover:text-white"
            }`}
          >
            Mobile Column
          </button>
          <button
            onClick={() => setViewMode("expanded")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              viewMode === "expanded" ? "bg-white text-[#111312] shadow-xs" : "text-[#8C938E] hover:text-white"
            }`}
          >
            Expanded View
          </button>
        </div>
      </div>

      {/* ── Outer Mobile Container Shell ── */}
      <div
        className={`w-full flex-1 flex items-center justify-center ${
          isFramed
            ? "py-6 px-4"
            : effectiveViewMode === "expanded"
            ? "py-4 px-4 max-w-5xl"
            : "py-0 px-0 max-w-[430px]"
        }`}
      >
        {/* Hardware Frame or Standard Container */}
        <div
          className={
            isFramed
              ? "relative w-[424px] max-w-full h-[866px] rounded-[56px] p-[10px] flex flex-col select-none"
              : effectiveViewMode === "expanded"
              ? "w-full max-w-5xl min-h-screen flex flex-col relative bg-[#FAF9F6] shadow-xl rounded-3xl border border-[rgba(17,19,18,0.08)] overflow-hidden"
              : "w-full max-w-[430px] min-h-screen flex flex-col relative bg-[#FAF9F6] shadow-2xl border-x border-[rgba(17,19,18,0.06)]"
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
              className={`w-full h-full flex flex-col relative bg-[#FAF9F6] overflow-hidden ${
                isFramed ? "rounded-[42px]" : ""
              }`}
            >
              {/* iOS Dynamic Island & Status Bar (in frame mode) */}
              {isFramed && (
                <div className="h-10 w-full flex items-center justify-between px-6 shrink-0 z-40 bg-[#FAF9F6] border-b border-black/[0.04] select-none">
                  {/* iOS Time */}
                  <span className="text-[13px] font-semibold text-[#111312] font-mono tracking-tight">
                    9:41
                  </span>

                  {/* Hyperrealistic Dynamic Island with Live Activity Expansion */}
                  <div
                    className={`transition-all duration-300 h-7 bg-black rounded-full flex items-center justify-between px-2.5 shadow-md ${
                      isCharging
                        ? "w-48 bg-black text-[#C8F369]"
                        : isNavigating
                        ? "w-44 bg-black text-white"
                        : "w-24 bg-black"
                    }`}
                  >
                    {isCharging ? (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold">
                          <Zap size={11} className="text-[#C8F369] animate-pulse" />
                          <span>+{chargeCurrentKw} kW</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-mono font-bold text-white">
                            {currentBatteryPct}%
                          </span>
                          <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A] border border-black" />
                        </div>
                      </>
                    ) : isNavigating && navStation ? (
                      <>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#C8F369]">
                          <Navigation size={11} />
                          <span>{Math.round((1 - navProgress) * (navStation.distanceKm || 4.2) * 10) / 10} km</span>
                        </div>
                        <div className="w-2 h-2 rounded-full bg-[#C8F369] animate-pulse" />
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
                  <div className="flex items-center gap-1.5 text-[#111312]">
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
                className="shrink-0 z-30 px-3 sm:px-4 py-2 sm:py-2.5 border-b flex items-center justify-between"
                style={{
                  background: "rgba(250, 249, 246, 0.96)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  borderColor: "rgba(17, 19, 18, 0.07)",
                }}
                aria-label="Driver App Header"
              >
              {/* Brand Logo, Model & Back Navigation */}
              <div className="flex items-center gap-2 min-w-0">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#111312] bg-white border border-[rgba(17,19,18,0.08)] p-2 rounded-xl shadow-2xs hover:bg-[#F5F4EF] transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-[#111312]"
                  title="Return to Home Page"
                  aria-label="Back"
                >
                  <ArrowLeft size={14} />
                </Link>
                <div className="w-px h-6 bg-[rgba(17,19,18,0.08)] shrink-0" />
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center">
                    <Image
                      src="/images/evverse-logo.png"
                      alt="EVverse Logo"
                      width={44}
                      height={44}
                      priority
                      className="object-contain w-full h-full"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-semibold text-[#8C938E] leading-none block truncate max-w-[100px] xs:max-w-[130px] sm:max-w-[180px]">
                      {activeVehicle.make} {activeVehicle.model}
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Right Controls: Guide Link, City Selector & Live Grid Indicator */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* EV Knowledge Hub Guide */}
                <Link
                  href="/users/knowledge"
                  className="flex items-center justify-center text-[#525854] hover:text-[#111312] bg-white border border-[rgba(17,19,18,0.08)] p-2 rounded-xl shadow-2xs hover:bg-[#F5F4EF] transition-colors cursor-pointer min-h-[34px] min-w-[34px] focus-visible:outline-2 focus-visible:outline-[#111312]"
                  title="EV Knowledge Hub Guide"
                  aria-label="Open EV Knowledge Hub Guide"
                >
                  <BookOpen size={13} className="text-[#16A34A]" />
                </Link>

                {/* City Selector */}
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  aria-label="Select City"
                  className="text-xs font-semibold bg-white border border-[rgba(17,19,18,0.08)] text-[#111312] rounded-xl px-2 sm:px-2.5 py-1.5 focus:outline-hidden cursor-pointer shadow-2xs hover:bg-[#F5F4EF] transition-colors min-h-[34px]"
                >
                  {Object.keys(CITY_CONFIGS).map((cityName) => (
                    <option key={cityName} value={cityName}>
                      {cityName}
                    </option>
                  ))}
                </select>

                {/* Live Status Indicator */}
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    isLive ? "bg-[#16A34A]" : "bg-[#EAB308]"
                  }`}
                  title={isLive ? "Open Charge Map Live" : "Verified Regional Baseline"}
                  aria-label={isLive ? "Connected to live grid" : "Regional baseline data"}
                />
              </div>
            </header>

            {/* ── Monad Testnet Driver Payment Panel (when no active spot booking) ── */}
            {!activeSpotBooking && (
              <div className="mx-3 sm:mx-4 mt-2.5 p-3 bg-white border border-black/[0.08] rounded-2xl flex items-center justify-between text-xs shadow-xs animate-in slide-in-from-top-1 gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-[#111312] text-[#C8F369] flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                    <Coins size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-[#111312]">Monad Testnet</span>
                      <span className="text-[10px] font-mono text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.2 rounded border border-[#BFDBFE]">
                        Chain 10143
                      </span>
                    </div>
                    {/* Hold Amount & Connection Status without truncation cutoffs */}
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[#525854] flex-wrap">
                      <span className="font-medium text-[#111312]">
                        Hold Deposit: <strong className="font-mono text-[#16A34A]">₹49</strong> (0.025 MON)
                      </span>
                      <span className="text-black/20 hidden xs:inline">•</span>
                      <span
                        title={
                          driverWalletAddress
                            ? isDriverMonadActive
                              ? "Connected to Monad Testnet (Chain ID 10143)"
                              : "Wrong Network: Wallet is not on Monad Testnet"
                            : "Wallet Disconnected"
                        }
                        className="inline-flex items-center gap-1 font-mono text-[10.5px]"
                      >
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            driverWalletAddress
                              ? isDriverMonadActive
                                ? "bg-[#16A34A]"
                                : "bg-[#EAB308]"
                              : "bg-[#EF4444]"
                          }`}
                        />
                        <span className="truncate max-w-[90px] xs:max-w-[120px]">
                          {driverWalletAddress
                            ? truncateAddress(driverWalletAddress)
                            : "Disconnected"}
                        </span>
                        {driverWalletAddress && !isDriverMonadActive && (
                          <span className="text-[9px] text-[#B45309] font-sans font-bold bg-[#FEF3C7] px-1 py-0.2 rounded border border-[#FDE68A]">
                            Wrong Net
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ONE Single Primary Action at a time */}
                <div className="shrink-0">
                  {!driverWalletAddress ? (
                    <button
                      type="button"
                      onClick={handleDriverConnectWallet}
                      disabled={isDriverConnectingWallet}
                      aria-label="Connect Web3 Wallet for Monad Payment"
                      className="min-h-[34px] px-3 py-1.5 bg-[#111312] hover:bg-[#252826] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-[#111312]"
                    >
                      <Wallet size={13} className="text-[#C8F369] shrink-0" />
                      <span>{isDriverConnectingWallet ? "Connecting..." : "Connect Wallet"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsPayModalOpen(true)}
                      aria-label="Continue to Monad Payment"
                      className="min-h-[34px] px-3.5 py-1.5 bg-[#111312] hover:bg-[#252826] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 cursor-pointer transition-all focus-visible:outline-2 focus-visible:outline-[#111312]"
                    >
                      <Zap size={13} className="text-[#C8F369] shrink-0" />
                      <span>Continue to Payment</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Active Spot Booking Banner */}
            {activeSpotBooking && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setIsPayModalOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setIsPayModalOpen(true);
                  }
                }}
                className="mx-3 sm:mx-4 mt-2.5 p-2.5 sm:p-3 bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl flex items-center justify-between text-xs cursor-pointer shadow-xs animate-in slide-in-from-top-1 hover:bg-[#DCFCE7]/70 transition-colors gap-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#16A34A] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]" />
                  </span>
                  <div className="truncate">
                    <span className="font-bold text-[#15803D]">Spot Held: </span>
                    <span className="text-[#111312] font-semibold">{activeSpotBooking.bayNumber}</span>
                    <span className="text-[#525854] text-[11px] ml-1">({activeSpotBooking.stationName})</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-bold bg-white text-[#15803D] px-2 py-0.5 rounded-md border border-[#86EFAC]">
                    PIN: {activeSpotBooking.pinCode}
                  </span>
                  <span className="min-h-[30px] px-2.5 py-1 bg-[#15803D] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                    View Receipt
                  </span>
                </div>
              </div>
            )}

            {/* ── Main Viewport Content ────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col relative overflow-y-auto no-scrollbar">
              
              {/* ═════════ TAB 1: HOME (Cockpit) ═════════ */}
              {activeTab === "home" && (
                <div className="p-4 flex-1">
                  <OfflineNotice source={source} />
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
                    onOpenGarage={() => setActiveTab("garage")}
                    onOpenJourneyPlanner={() => setActiveTab("journeys")}
                  />
                </div>
              )}

              {/* ═════════ TAB 2: EXPLORE (Charging Map) ═════════ */}
              {activeTab === "explore" && (
                <div className="flex-1 flex flex-col relative w-full h-full min-h-[500px]">
                  {/* Interactive Leaflet Map Viewport */}
                  <div className="flex-1 relative w-full h-full">
                <DriverMobileMap
                  center={mapCenter}
                  zoom={mapZoom}
                  userLocation={userLocation}
                  stations={filteredStations}
                  selectedStation={selectedStation}
                  onStationSelect={(st) => {
                    setSelectedStation(st);
                    setIsStationDetailOpen(true);
                  }}
                  navigationStation={navStation}
                  isNavigating={isNavigating}
                  navProgress={navProgress}
                />

                {/* Floating Top Controls (Search & Quick Filters) */}
                <div className="absolute top-3 left-3 right-3 z-30 space-y-2 pointer-events-auto">
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
                      className="px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center gap-1.5 bg-[#111312] text-[#C8F369] hover:bg-[#252826] shrink-0 focus-visible:outline-2 focus-visible:outline-[#111312]"
                    >
                      <Gauge size={13} className="text-[#C8F369]" />
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
                          className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#111312] ${
                            isActive
                              ? "bg-[#111312] text-white"
                              : "bg-white/95 backdrop-blur-md text-[#525854] border border-[rgba(17,19,18,0.08)] hover:bg-[#F3F2ED]"
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
                      className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#111312] ${
                        onlyCompatible || autoCompatibility
                          ? "bg-[#111312] text-[#C8F369]"
                          : "bg-white/95 backdrop-blur-md text-[#525854] border border-[rgba(17,19,18,0.08)] hover:bg-[#F3F2ED]"
                      }`}
                    >
                      Compatible ({activeVehicle.plugType.split(" ")[0]})
                    </button>

                    {/* Saved Bookmarks Filter */}
                    {savedStationIds.size > 0 && (
                      <button
                        onClick={() => setOnlySaved(!onlySaved)}
                        aria-pressed={onlySaved}
                        className={`px-3.5 py-2 min-h-[38px] rounded-full text-[11px] font-semibold whitespace-nowrap transition-all shadow-2xs active:scale-95 cursor-pointer flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#EF4444] ${
                          onlySaved
                            ? "bg-[#EF4444] text-white"
                            : "bg-white/95 backdrop-blur-md text-[#EF4444] border border-[#FCA5A5]"
                        }`}
                      >
                        Saved ({savedStationIds.size})
                      </button>
                    )}
                  </div>
                </div>

                {/* In-app Navigation HUD Banner */}
                {isNavigating && navStation && (
                  <div className="absolute top-28 left-3 right-3 z-30 bg-[#111312] text-white rounded-2xl p-3.5 shadow-xl flex items-center justify-between border border-[rgba(255,255,255,0.1)]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[rgba(200,243,105,0.2)] flex items-center justify-center text-[#C8F369]">
                        <Navigation size={16} />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#C8F369] font-bold">
                          NAVIGATING ({Math.round((1 - navProgress) * (navStation.distanceKm || 4.2) * 10) / 10} km)
                        </div>
                        <div className="text-xs font-bold text-white truncate max-w-[180px]">
                          {navStation.name}
                        </div>
                        <div className="text-[10px] text-[#9CA3AF]">
                          Arrival Battery: ~{Math.max(10, currentBatteryPct - Math.round(((navStation.distanceKm || 4) / activeVehicle.wltpRangeKm) * 100))}%
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={cancelNavigation}
                      aria-label="Exit navigation mode"
                      className="min-h-[36px] px-3.5 py-1.5 text-[11px] font-semibold bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white"
                    >
                      Exit
                    </button>
                  </div>
                )}

                {/* Empty State Overlay when 0 stations found */}
                {filteredStations.length === 0 && !loading && (
                  <div className="absolute inset-x-3 bottom-20 z-30">
                    <EmptyState onReset={handleResetFilters} />
                  </div>
                )}

                {/* Bottom Quick Hubs Drawer / Peek Card */}
                {!isStationDetailOpen && filteredStations.length > 0 && (
                  <div className="absolute bottom-16 left-3 right-3 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-3.5 border border-[rgba(17,19,18,0.08)] shadow-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#8C938E] font-semibold">
                        {filteredStations.length} Charging Stations
                      </span>
                      <span className="text-[10px] text-[#16A34A] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" aria-hidden="true" />
                        Live
                      </span>
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
                            className="min-h-[40px] px-3.5 py-2 bg-[#111312] text-white rounded-xl text-xs font-semibold flex items-center gap-1 shadow-xs hover:bg-[#252826] active:scale-95 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#111312]"
                          >
                            <Navigation size={12} className="text-[#C8F369]" aria-hidden="true" />
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
                  onStartNavigation={(st: any) => startNavigation(st as DriverStation)}
                  onStartCharging={(st) => startChargingSession(st as DriverStation)}
                  isSaved={selectedStation ? savedStationIds.has(selectedStation.station_id) : false}
                  onToggleSave={(id) => toggleSaveStation(id)}
                  activeVehicleSoc={currentBatteryPct}
                  vehicleWltpKm={activeVehicle.wltpRangeKm}
                  activeVehicle={activeVehicle}
                  onOpenBookingModal={() => setIsPayModalOpen(true)}
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
                candidateStations={liveData?.stations || []}
                userLocation={userLocation}
                selectedCity={selectedCity}
                onStartTripNavigation={({ name, latitude, longitude, primaryStation }) => {
                  const targetStation: DriverStation = primaryStation
                    ? {
                        ...primaryStation,
                        distanceKm: haversineKm(userLocation[0], userLocation[1], primaryStation.latitude, primaryStation.longitude),
                      }
                    : {
                        station_id: `CORRIDOR-${name.replace(/\s+/g, "-")}`,
                        name,
                        latitude,
                        longitude,
                        address: `${name} Transit Corridor, ${selectedCity}`,
                        operator: "EVverse Fast Charging",
                        status: "Operational",
                        is_operational: true,
                        power_kw: 250,
                        bays: 8,
                        connector_types: [activeVehicle.plugType, "CCS2 Combo", "Type 2"],
                        usage_cost: "$0.28/kWh",
                        source: "open_charge_map",
                        distanceKm: haversineKm(userLocation[0], userLocation[1], latitude, longitude),
                      };
                  startNavigation(targetStation);
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

          {/* ═════════ TAB 5: GARAGE (Fleet Registry) ═════════ */}
          {activeTab === "garage" && (
            <div className="p-4 flex-1">
              <GarageFleet
                vehicles={vehicles}
                activeVehicleId={activeVehicleId}
                onSelectVehicle={handleSelectVehicle}
                onAddVehicle={handleAddVehicle}
                onUpdateVehicle={handleUpdateVehicle}
                onRemoveVehicle={handleRemoveVehicle}
                autoCompatibility={autoCompatibility}
                onToggleAutoCompatibility={handleToggleAutoCompatibility}
                isLoading={isGarageLoading}
                errorMessage={garageErrorMessage}
                onClearError={() => setGarageErrorMessage(null)}
              />
            </div>
          )}
        </main>

        {/* ── Fixed Bottom Navigation Bar ──────────────────────────────────── */}
        <DriverNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isCharging={isCharging}
        />

        {/* ── Global Monad Payment & Stall Hold Modal ────────────────────── */}
        <ParkingBookingModal
          isOpen={isPayModalOpen}
          onClose={() => setIsPayModalOpen(false)}
          station={paymentTargetStation}
          onStartNavigation={(st: any) => startNavigation(st as DriverStation)}
          activeVehicle={activeVehicle}
          initialStep="review"
        />
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
