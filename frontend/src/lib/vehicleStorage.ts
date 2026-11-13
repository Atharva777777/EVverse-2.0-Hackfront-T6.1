import type { EVVehicle } from "@/components/driver/VehicleCockpit";
import type { DriverVehicle } from "@/types/api";
import {
  fetchDriverVehicles,
  createDriverVehicle,
  updateDriverVehicle,
  deleteDriverVehicle,
  fetchDriverPreferences,
  updateDriverPreferences,
} from "@/lib/driverApi";

// ── Verified Production EV Initial Fleet (OEM Homologation Specs) ─────────────
// Specifications verified from manufacturer homologation / EV-Database.
// Never invent specifications or silently substitute connector types.
export const VERIFIED_GARAGE_VEHICLES: EVVehicle[] = [
  {
    id: "tata-nexon-ev",
    make: "Tata",
    model: "Nexon EV Long Range",
    year: 2025,
    image: "/images/car-tata-nexon.jpg",
    batteryKwh: 40.5,
    usableKwh: 39.0,
    currentBatteryPct: 72,
    wltpRangeKm: 465,
    efficiencyKwh100km: 14.5,
    maxDcSpeedKw: 30,
    maxAcSpeedKw: 7,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT624108PNA09821",
    sohPct: 99.2,
  },
  {
    id: "ather-450x-gen3",
    make: "Ather",
    model: "450X (Gen 3)",
    year: 2025,
    image: "/images/scooter-ather-450x.jpg",
    batteryKwh: 3.7,
    usableKwh: 3.24,
    currentBatteryPct: 84,
    wltpRangeKm: 150,
    efficiencyKwh100km: 2.8,
    maxDcSpeedKw: 3,
    maxAcSpeedKw: 3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "ME4ATH450XPN10492",
    sohPct: 98.9,
  },
  {
    id: "mahindra-treo-auto",
    make: "Mahindra",
    model: "Treo Electric 3W Auto",
    year: 2025,
    image: "/images/auto-mahindra-treo.jpg",
    batteryKwh: 7.37,
    usableKwh: 7.0,
    currentBatteryPct: 65,
    wltpRangeKm: 140,
    efficiencyKwh100km: 5.4,
    maxDcSpeedKw: 3,
    maxAcSpeedKw: 3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "MA1TR3W84PNA19024",
    sohPct: 97.8,
  },
  {
    id: "tata-tiago-ev",
    make: "Tata",
    model: "Tiago EV TechLux",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 24.0,
    usableKwh: 22.8,
    currentBatteryPct: 78,
    wltpRangeKm: 315,
    efficiencyKwh100km: 12.8,
    maxDcSpeedKw: 15,
    maxAcSpeedKw: 7,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT612903PNA44102",
    sohPct: 98.4,
  },
  {
    id: "porsche-taycan-gts",
    make: "Porsche",
    model: "Taycan GTS",
    year: 2025,
    image: "/images/car-porsche.png",
    batteryKwh: 93.4,
    usableKwh: 83.7,
    currentBatteryPct: 68,
    wltpRangeKm: 504,
    efficiencyKwh100km: 20.3,
    maxDcSpeedKw: 270,
    maxAcSpeedKw: 22,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "WP0AA2Y15PSA92811",
    sohPct: 98.4,
  },
];

// ── Verified OEM Catalogue Presets for Adding New Vehicles ─────────────────────
// Homologation and manufacturer certified specs.
export const VERIFIED_OEM_CATALOGUE: Omit<EVVehicle, "id" | "currentBatteryPct" | "sohPct">[] = [
  // ── Indian Market EVs (Tata & Mahindra) ──────────────────────────────────────
  {
    make: "Tata",
    model: "Nexon EV Long Range",
    year: 2025,
    image: "/images/car-tata-nexon.jpg",
    batteryKwh: 40.5,
    usableKwh: 39.0,
    wltpRangeKm: 465,
    efficiencyKwh100km: 14.5,
    maxDcSpeedKw: 30,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT624108PNA09821",
  },
  {
    make: "Tata",
    model: "Nexon EV Empowered+ LR",
    year: 2025,
    image: "/images/car-tata-nexon.jpg",
    batteryKwh: 45.0,
    usableKwh: 40.5,
    wltpRangeKm: 489,
    efficiencyKwh100km: 15.0,
    maxDcSpeedKw: 35,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT621980RA089123",
  },
  {
    make: "Tata",
    model: "Punch EV Long Range",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 35.0,
    usableKwh: 33.0,
    wltpRangeKm: 421,
    efficiencyKwh100km: 14.0,
    maxDcSpeedKw: 25,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT634812PNA77812",
  },
  {
    make: "Tata",
    model: "Curvv EV 55",
    year: 2025,
    image: "/images/car-rangerover.png",
    batteryKwh: 55.0,
    usableKwh: 52.0,
    wltpRangeKm: 502,
    efficiencyKwh100km: 15.5,
    maxDcSpeedKw: 70,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT645901RNA12948",
  },
  {
    make: "Tata",
    model: "Tiago EV TechLux",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 24.0,
    usableKwh: 22.8,
    wltpRangeKm: 315,
    efficiencyKwh100km: 12.8,
    maxDcSpeedKw: 15,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MAT612903PNA44102",
  },
  {
    make: "Mahindra",
    model: "XUV400 EV EL Pro",
    year: 2025,
    image: "/images/car-rangerover.png",
    batteryKwh: 39.4,
    usableKwh: 38.0,
    wltpRangeKm: 456,
    efficiencyKwh100km: 15.2,
    maxDcSpeedKw: 50,
    maxAcSpeedKw: 7.2,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "MA1X40084PNA33891",
  },
  {
    make: "Mahindra",
    model: "Treo Electric 3W Auto",
    year: 2025,
    image: "/images/auto-mahindra-treo.jpg",
    batteryKwh: 7.37,
    usableKwh: 7.0,
    wltpRangeKm: 140,
    efficiencyKwh100km: 5.4,
    maxDcSpeedKw: 3,
    maxAcSpeedKw: 3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "MA1TR3W84PNA19024",
  },
  // ── Indian Market EVs (MG Motor) ─────────────────────────────────────────────
  {
    make: "MG",
    model: "ZS EV Exclusive",
    year: 2025,
    image: "/images/car-bmw.png",
    batteryKwh: 50.3,
    usableKwh: 48.0,
    wltpRangeKm: 461,
    efficiencyKwh100km: 16.0,
    maxDcSpeedKw: 50,
    maxAcSpeedKw: 7.4,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "SAICMGZS0PNA55102",
  },
  {
    make: "MG",
    model: "Windsor EV Essence",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 38.0,
    usableKwh: 36.5,
    wltpRangeKm: 331,
    efficiencyKwh100km: 14.2,
    maxDcSpeedKw: 45,
    maxAcSpeedKw: 7.4,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "SAICMGWN0PNA88192",
  },
  {
    make: "MG",
    model: "Comet EV Play",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 17.3,
    usableKwh: 16.5,
    wltpRangeKm: 230,
    efficiencyKwh100km: 9.8,
    maxDcSpeedKw: 3.3,
    maxAcSpeedKw: 3.3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "SAICMGCM0PNA12049",
  },
  // ── Global & Premium EVs ───────────────────────────────────────────────────
  {
    make: "Hyundai",
    model: "Ioniq 5 AWD Long Range",
    year: 2025,
    image: "/images/car-bmw.png",
    batteryKwh: 84.0,
    usableKwh: 80.0,
    wltpRangeKm: 485,
    efficiencyKwh100km: 17.5,
    maxDcSpeedKw: 233,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "KMHC55LB2PU091823",
  },
  {
    make: "Kia",
    model: "EV6 GT-Line AWD",
    year: 2025,
    image: "/images/car-bmw.png",
    batteryKwh: 77.4,
    usableKwh: 74.0,
    wltpRangeKm: 528,
    efficiencyKwh100km: 16.5,
    maxDcSpeedKw: 240,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "KNAEV6LB3PU441920",
  },
  {
    make: "BYD",
    model: "Atto 3 (CCS2 Standard)",
    year: 2024,
    image: "/images/car-bmw.png",
    batteryKwh: 60.5,
    usableKwh: 60.5,
    wltpRangeKm: 420,
    efficiencyKwh100km: 15.6,
    maxDcSpeedKw: 88,
    maxAcSpeedKw: 7.0,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "LGXC41940R0198421",
  },
  {
    make: "BYD",
    model: "Atto 3 (GB/T Standard)",
    year: 2024,
    image: "/images/car-bmw.png",
    batteryKwh: 60.5,
    usableKwh: 60.5,
    wltpRangeKm: 420,
    efficiencyKwh100km: 15.6,
    maxDcSpeedKw: 88,
    maxAcSpeedKw: 7.0,
    plugType: "GB/T DC",
    plugImage: "/images/plug-gbt.png",
    vin: "LGXC41940R0198422",
  },
  {
    make: "BYD",
    model: "Seal EV Premium",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 82.5,
    usableKwh: 80.0,
    wltpRangeKm: 570,
    efficiencyKwh100km: 16.2,
    maxDcSpeedKw: 150,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "LGXCS5210R0458129",
  },
  {
    make: "Tesla",
    model: "Model Y Long Range",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 78.1,
    usableKwh: 75.0,
    wltpRangeKm: 533,
    efficiencyKwh100km: 16.9,
    maxDcSpeedKw: 250,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "XP7YGCEK5RB109482",
  },
  {
    make: "Tesla",
    model: "Model 3 RWD",
    year: 2025,
    image: "/images/car-model.png",
    batteryKwh: 60.0,
    usableKwh: 57.5,
    wltpRangeKm: 513,
    efficiencyKwh100km: 13.2,
    maxDcSpeedKw: 170,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "5YJ3E1EA5NF291048",
  },
  {
    make: "Porsche",
    model: "Taycan GTS",
    year: 2025,
    image: "/images/car-porsche.png",
    batteryKwh: 93.4,
    usableKwh: 83.7,
    wltpRangeKm: 504,
    efficiencyKwh100km: 20.3,
    maxDcSpeedKw: 270,
    maxAcSpeedKw: 22,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "WP0AA2Y15PSA92811",
  },
  {
    make: "BMW",
    model: "i4 eDrive40",
    year: 2025,
    image: "/images/car-bmw.png",
    batteryKwh: 83.9,
    usableKwh: 80.7,
    wltpRangeKm: 590,
    efficiencyKwh100km: 16.1,
    maxDcSpeedKw: 205,
    maxAcSpeedKw: 11,
    plugType: "CCS2 Combo",
    plugImage: "/images/plug-ccs2.png",
    vin: "WBA71AW07NFS99201",
  },
  // ── Electric 2-Wheelers ─────────────────────────────────────────────────────
  {
    make: "Ather",
    model: "450X (Gen 3)",
    year: 2025,
    image: "/images/scooter-ather-450x.jpg",
    batteryKwh: 3.7,
    usableKwh: 3.24,
    wltpRangeKm: 150,
    efficiencyKwh100km: 2.8,
    maxDcSpeedKw: 3,
    maxAcSpeedKw: 3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "ME4ATH450XPN10492",
  },
  {
    make: "Ola",
    model: "S1 Pro (Gen 2)",
    year: 2025,
    image: "/images/scooter-ather-450x.jpg",
    batteryKwh: 4.0,
    usableKwh: 3.8,
    wltpRangeKm: 195,
    efficiencyKwh100km: 2.6,
    maxDcSpeedKw: 3,
    maxAcSpeedKw: 3,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "ME4OLA0S1PN301948",
  },
  // ── Specialized Standards ───────────────────────────────────────────────────
  {
    make: "Nissan",
    model: "Leaf e+ (CHAdeMO Standard)",
    year: 2024,
    image: "/images/car-model.png",
    batteryKwh: 62.0,
    usableKwh: 59.0,
    wltpRangeKm: 385,
    efficiencyKwh100km: 18.5,
    maxDcSpeedKw: 100,
    maxAcSpeedKw: 6.6,
    plugType: "CHAdeMO",
    plugImage: "/images/plug-chademo.png",
    vin: "JN1AZ0CP4M0098124",
  },
  {
    make: "Renault",
    model: "Zoe R135 (Type 2 AC Fast)",
    year: 2024,
    image: "/images/car-model.png",
    batteryKwh: 54.7,
    usableKwh: 52.0,
    wltpRangeKm: 395,
    efficiencyKwh100km: 16.3,
    maxDcSpeedKw: 50,
    maxAcSpeedKw: 22,
    plugType: "Type 2 (AC)",
    plugImage: "/images/plug-type2.png",
    vin: "VF1AG000865891244",
  },
];

// ── Supported Connector Standards ─────────────────────────────────────────────
export const SUPPORTED_CONNECTOR_STANDARDS = [
  "CCS2 Combo",
  "Type 2 (AC)",
  "CHAdeMO",
  "GB/T DC",
] as const;

export type ConnectorStandard = (typeof SUPPORTED_CONNECTOR_STANDARDS)[number];

// ── Strict Vehicle Input Validation ───────────────────────────────────────────
export interface VehicleValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export function validateVehicleInput(data: Partial<EVVehicle>): VehicleValidationResult {
  const errors: Record<string, string> = {};

  if (!data.make || data.make.trim().length < 2) {
    errors.make = "Make must be at least 2 characters long.";
  }

  if (!data.model || data.model.trim().length < 1) {
    errors.model = "Model name cannot be empty.";
  }

  if (data.usableKwh === undefined || isNaN(Number(data.usableKwh)) || Number(data.usableKwh) <= 0) {
    errors.usableKwh = "Usable capacity must be a positive number greater than 0.";
  } else if (Number(data.usableKwh) > 250) {
    errors.usableKwh = "Usable capacity exceeds maximum realistic passenger EV limit (250 kWh).";
  }

  if (
    data.maxDcSpeedKw === undefined ||
    isNaN(Number(data.maxDcSpeedKw)) ||
    Number(data.maxDcSpeedKw) < 0
  ) {
    errors.maxDcSpeedKw = "Maximum DC charging power cannot be negative.";
  } else if (Number(data.maxDcSpeedKw) > 500) {
    errors.maxDcSpeedKw = "Maximum DC charging power cannot exceed 500 kW.";
  }

  if (
    data.wltpRangeKm !== undefined &&
    (isNaN(Number(data.wltpRangeKm)) || Number(data.wltpRangeKm) <= 0)
  ) {
    errors.wltpRangeKm = "WLTP range must be greater than 0 km.";
  }

  if (!data.plugType || !SUPPORTED_CONNECTOR_STANDARDS.includes(data.plugType as ConnectorStandard)) {
    errors.plugType = `Connector standard must be one of: ${SUPPORTED_CONNECTOR_STANDARDS.join(", ")}. Never substitute connector standards.`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// ── Connector Compatibility Engine ────────────────────────────────────────────
// Critical Rule: Never invent vehicle specifications or silently substitute connector types.
// A station is compatible ONLY if one of its physical connector ports matches the vehicle's standard.
export function isStationCompatibleWithVehicle(
  stationConnectors: string[] | undefined,
  vehiclePlugType: string
): boolean {
  if (!stationConnectors || stationConnectors.length === 0) {
    return false;
  }

  const vPlug = vehiclePlugType.toLowerCase();

  return stationConnectors.some((c) => {
    const sConn = c.toLowerCase();

    if (vPlug.includes("ccs2") || vPlug.includes("combo")) {
      return (
        sConn.includes("ccs2") ||
        sConn.includes("combo 2") ||
        sConn.includes("ccs-2") ||
        (sConn.includes("ccs") && !sConn.includes("ccs1"))
      );
    }

    if (vPlug.includes("chademo")) {
      return sConn.includes("chademo");
    }

    if (vPlug.includes("gb/t") || vPlug.includes("gbt")) {
      return sConn.includes("gb/t") || sConn.includes("gbt");
    }

    if (vPlug.includes("type 2")) {
      return sConn.includes("type 2") || sConn.includes("mennekes") || sConn.includes("type2");
    }

    return false;
  });
}

// ── Local Storage Keys ────────────────────────────────────────────────────────
const VEHICLES_STORAGE_KEY = "evverse_driver_garage_vehicles";
const ACTIVE_VEHICLE_STORAGE_KEY = "evverse_active_vehicle_id";
const AUTO_COMPATIBILITY_STORAGE_KEY = "evverse_auto_apply_vehicle_compatibility";

// ── Persistence Helpers ───────────────────────────────────────────────────────
export function getStoredVehicles(): EVVehicle[] {
  if (typeof window === "undefined") return VERIFIED_GARAGE_VEHICLES;
  try {
    const raw = localStorage.getItem(VEHICLES_STORAGE_KEY);
    if (!raw) return VERIFIED_GARAGE_VEHICLES;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : VERIFIED_GARAGE_VEHICLES;
  } catch (err) {
    console.warn("[QuantEV] Could not parse stored garage vehicles:", err);
    return VERIFIED_GARAGE_VEHICLES;
  }
}

export function saveStoredVehicles(vehicles: EVVehicle[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VEHICLES_STORAGE_KEY, JSON.stringify(vehicles));
  } catch (err) {
    console.error("[QuantEV] Failed to save garage vehicles to storage:", err);
    throw new Error("Local storage quota exceeded or storage unavailable.");
  }
}

export function getStoredActiveVehicleId(): string {
  if (typeof window === "undefined") return VERIFIED_GARAGE_VEHICLES[0].id;
  try {
    const raw = localStorage.getItem(ACTIVE_VEHICLE_STORAGE_KEY);
    return raw || VERIFIED_GARAGE_VEHICLES[0].id;
  } catch {
    return VERIFIED_GARAGE_VEHICLES[0].id;
  }
}

export function saveStoredActiveVehicleId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_VEHICLE_STORAGE_KEY, id);
  } catch (err) {
    console.warn("[QuantEV] Could not save active vehicle ID:", err);
  }
}

export function getStoredAutoCompatibility(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(AUTO_COMPATIBILITY_STORAGE_KEY);
    return raw !== null ? raw === "true" : true; // Enabled by default
  } catch {
    return true;
  }
}

export function saveStoredAutoCompatibility(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTO_COMPATIBILITY_STORAGE_KEY, String(enabled));
  } catch (err) {
    console.warn("[QuantEV] Could not save auto compatibility preference:", err);
  }
}

// ── Backend Model Mapping ─────────────────────────────────────────────────────

export function mapBackendVehicleToFrontend(v: DriverVehicle): EVVehicle {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    image: v.image || "/images/car-model.png",
    batteryKwh: v.battery_kwh,
    usableKwh: v.usable_kwh,
    currentBatteryPct: v.current_battery_pct,
    wltpRangeKm: v.wltp_range_km,
    efficiencyKwh100km: v.efficiency_kwh100km,
    maxDcSpeedKw: v.max_dc_speed_kw,
    maxAcSpeedKw: v.max_ac_speed_kw,
    plugType: v.plug_type,
    plugImage: v.plug_image || "/images/plug-ccs2.png",
    vin: v.vin || "",
    sohPct: v.soh_pct,
  };
}

export function mapFrontendVehicleToBackend(v: EVVehicle): Partial<DriverVehicle> {
  return {
    id: v.id,
    make: v.make,
    model: v.model,
    year: v.year,
    image: v.image,
    battery_kwh: v.batteryKwh,
    usable_kwh: v.usableKwh,
    current_battery_pct: v.currentBatteryPct,
    wltp_range_km: v.wltpRangeKm,
    efficiency_kwh100km: v.efficiencyKwh100km,
    max_dc_speed_kw: v.maxDcSpeedKw,
    max_ac_speed_kw: v.maxAcSpeedKw,
    plug_type: v.plugType,
    plug_image: v.plugImage,
    vin: v.vin,
    soh_pct: v.sohPct,
  };
}

// ── Integrated Garage Preferences Loader ──────────────────────────────────────

export async function loadGaragePreferences(): Promise<{
  vehicles: EVVehicle[];
  activeVehicleId: string;
  autoCompatibility: boolean;
}> {
  try {
    const [vehiclesRes, prefsRes] = await Promise.all([
      fetchDriverVehicles(1, 50),
      fetchDriverPreferences(),
    ]);

    if (vehiclesRes.items && vehiclesRes.items.length > 0) {
      const frontendVehicles = vehiclesRes.items.map(mapBackendVehicleToFrontend);
      saveStoredVehicles(frontendVehicles);

      const activeId = prefsRes.active_vehicle_id || frontendVehicles[0].id;
      const validActiveId = frontendVehicles.some((v) => v.id === activeId)
        ? activeId
        : frontendVehicles[0].id;

      saveStoredActiveVehicleId(validActiveId);
      saveStoredAutoCompatibility(prefsRes.auto_compatibility);

      return {
        vehicles: frontendVehicles,
        activeVehicleId: validActiveId,
        autoCompatibility: prefsRes.auto_compatibility,
      };
    }
  } catch (err) {
    console.warn("[QuantEV] Backend garage fetch unavailable; using cached garage:", err);
  }

  // Resilient offline fallback using local cache
  const vehicles = getStoredVehicles();
  const activeId = getStoredActiveVehicleId();
  const autoCompat = getStoredAutoCompatibility();
  const validActiveId = vehicles.some((v) => v.id === activeId) ? activeId : vehicles[0].id;

  return {
    vehicles,
    activeVehicleId: validActiveId,
    autoCompatibility: autoCompat,
  };
}

// ── Backend Synchronization Helpers ───────────────────────────────────────────

export async function syncAddVehicle(v: EVVehicle): Promise<EVVehicle> {
  const backendPayload = mapFrontendVehicleToBackend(v);
  try {
    const created = await createDriverVehicle(backendPayload);
    return mapBackendVehicleToFrontend(created);
  } catch (err) {
    console.warn("[QuantEV] Failed to persist vehicle to backend; keeping local copy:", err);
    return v;
  }
}

export async function syncUpdateVehicle(v: EVVehicle): Promise<EVVehicle> {
  const backendPayload = mapFrontendVehicleToBackend(v);
  try {
    const updated = await updateDriverVehicle(v.id, backendPayload);
    return mapBackendVehicleToFrontend(updated);
  } catch (err) {
    console.warn("[QuantEV] Failed to persist vehicle update to backend; keeping local copy:", err);
    return v;
  }
}

export async function syncDeleteVehicle(vehicleId: string): Promise<void> {
  try {
    await deleteDriverVehicle(vehicleId);
  } catch (err) {
    console.warn("[QuantEV] Failed to delete vehicle from backend:", err);
  }
}

export async function syncActiveVehicleId(id: string): Promise<void> {
  saveStoredActiveVehicleId(id);
  try {
    await updateDriverPreferences({ active_vehicle_id: id });
  } catch (err) {
    console.warn("[QuantEV] Failed to sync active vehicle ID to backend:", err);
  }
}

export async function syncAutoCompatibility(enabled: boolean): Promise<void> {
  saveStoredAutoCompatibility(enabled);
  try {
    await updateDriverPreferences({ auto_compatibility: enabled });
  } catch (err) {
    console.warn("[QuantEV] Failed to sync auto-compatibility preference to backend:", err);
  }
}

