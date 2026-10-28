/**
 * EVverse Universal Ecosystem Store
 * =================================
 * Shared, reactive state store synchronizing:
 * 1. EV Drivers (/users/stations) -> Garage, Stall Bookings, Hardware Micro-Kiosk
 * 2. Station Owners (/station-owners) -> Live Bay Monitor, Smart Contactor Controls, Tariffs
 * 3. Infrastructure Investors (/investor) -> Capital Allocation, Community Hub Deployment, Dynamic ROI
 *
 * Automatically syncs across browser windows/routes via localStorage & custom events.
 */

export interface EcosystemSession {
  id: string;
  stationId: string;
  stationName: string;
  city: string;
  bayNumber: string;
  connectorType: string;
  vehicleName: string;
  vehicleId: string;
  vehicleBatteryPct: number;
  paymentRail: 'upi' | 'monad';
  paymentAmount: string;
  paymentRef: string; // UPI UTR or Monad TxHash
  pinCode: string;
  startTime: string;
  durationMinutes: number;
  status: 'reserved' | 'energized' | 'completed' | 'cancelled';
  activeKw: number;
  kwhDelivered: number;
  co2OffsetKg: number;
  hostPayoutInr: number;
  hostPayoutMon: number;
}

export interface DeployedCommunityStation {
  id: string;
  name: string;
  city: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  powerKw: number;
  bays: number;
  connectorTypes: string[];
  fundedBy: string;
  capexAmount: string;
  deployedAt: string;
  operator: string;
  ratePerKwh: number;
  parkingFeePerHour: number;
  rating: number;
  status: 'Online' | 'Maintenance' | 'Offline';
}

export interface StationTariff {
  stationId: string;
  ratePerKwh: number;
  parkingFeePerHour: number;
  solarOffPeakDiscountPct: number;
}

export interface EcosystemStats {
  totalSessions: number;
  totalKwhDelivered: number;
  totalRevenueInr: number;
  totalRevenueMon: number;
  totalCo2OffsetKg: number;
  activeBaysCount: number;
  totalBaysCount: number;
  fleetMix: {
    twoWheelers: number;
    threeWheelers: number;
    fourWheelers: number;
  };
}

// ── Storage Keys ─────────────────────────────────────────────────────────────
const STORAGE_SESSIONS = "evverse_ecosystem_sessions_v1";
const STORAGE_DEPLOYED = "evverse_ecosystem_deployed_stations_v1";
const STORAGE_TARIFFS = "evverse_ecosystem_tariffs_v1";
const ECOSYSTEM_EVENT = "evverse_ecosystem_sync_event";

// ── Initial Seed Data ────────────────────────────────────────────────────────
const INITIAL_DEPLOYED_STATIONS: DeployedCommunityStation[] = [
  {
    id: "STN-PUNE-KOTH-01",
    name: "Kothrud EV FastCharge Hub",
    city: "Pune",
    area: "Kothrud",
    address: "Opp. Vanaz Metro Station, Paud Road, Kothrud, Pune",
    lat: 18.5074,
    lng: 73.8077,
    powerKw: 60,
    bays: 4,
    connectorTypes: ["CCS2 Combo", "Type 2 (AC)"],
    fundedBy: "Pune Clean Mobility Consortium",
    capexAmount: "₹4,50,000",
    deployedAt: "2026-09-12",
    operator: "Kothrud Kirana & Mobility Host",
    ratePerKwh: 16.5,
    parkingFeePerHour: 40,
    rating: 4.9,
    status: "Online",
  },
  {
    id: "STN-PUNE-SWAR-02",
    name: "Swargate Junction Community Charger",
    city: "Pune",
    area: "Swargate",
    address: "Near Swargate Bus Rapid Transit Depot, Pune",
    lat: 18.5018,
    lng: 73.8585,
    powerKw: 22,
    bays: 3,
    connectorTypes: ["Type 2 (AC)", "IEC 60309 3-Pin"],
    fundedBy: "Mahindra 3W Fleet Angel Fund",
    capexAmount: "₹1,80,000",
    deployedAt: "2026-10-02",
    operator: "Swargate Auto Cooperative",
    ratePerKwh: 13.0,
    parkingFeePerHour: 25,
    rating: 4.8,
    status: "Online",
  },
  {
    id: "STN-PUNE-HINJ-03",
    name: "Hinjawadi Phase 3 Tech Corridors",
    city: "Pune",
    area: "Hinjawadi",
    address: "Qubix Business Park, Rajiv Gandhi Infotech Park, Hinjawadi",
    lat: 18.5913,
    lng: 73.7389,
    powerKw: 120,
    bays: 6,
    connectorTypes: ["CCS2 Combo", "Type 2 (AC)", "CHAdeMO"],
    fundedBy: "Monad Web3 Infrastructure DAO",
    capexAmount: "₹9,20,000",
    deployedAt: "2026-08-20",
    operator: "Tech Park Energy CPO",
    ratePerKwh: 18.0,
    parkingFeePerHour: 50,
    rating: 4.9,
    status: "Online",
  },
];

const INITIAL_SESSIONS: EcosystemSession[] = [
  {
    id: "RES-7104-EV",
    stationId: "STN-PUNE-KOTH-01",
    stationName: "Kothrud EV FastCharge Hub",
    city: "Pune",
    bayNumber: "Bay 01",
    connectorType: "CCS2 Combo",
    vehicleName: "Tata Nexon EV Long Range",
    vehicleId: "tata-nexon-ev",
    vehicleBatteryPct: 68,
    paymentRail: "upi",
    paymentAmount: "₹49",
    paymentRef: "UPI-883719204912",
    pinCode: "4587",
    startTime: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    durationMinutes: 30,
    status: "energized",
    activeKw: 29.4,
    kwhDelivered: 6.85,
    co2OffsetKg: 5.61,
    hostPayoutInr: 49,
    hostPayoutMon: 0,
  },
  {
    id: "RES-9842-EV",
    stationId: "STN-PUNE-SWAR-02",
    stationName: "Swargate Junction Community Charger",
    city: "Pune",
    bayNumber: "Bay 02",
    connectorType: "Type 2 (AC)",
    vehicleName: "Ather 450X Gen 3",
    vehicleId: "ather-450x",
    vehicleBatteryPct: 84,
    paymentRail: "monad",
    paymentAmount: "0.025 MON",
    paymentRef: "0x7a39fcb18204b8d147820a45e9981245ffbc7189a02931bc789218d6e32a1014",
    pinCode: "8219",
    startTime: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    durationMinutes: 45,
    status: "completed",
    activeKw: 0,
    kwhDelivered: 2.95,
    co2OffsetKg: 2.42,
    hostPayoutInr: 0,
    hostPayoutMon: 0.025,
  },
];

// ── Dispatch Helpers ─────────────────────────────────────────────────────────
function notifyEcosystemChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ECOSYSTEM_EVENT));
  }
}

// ── Ecosystem Methods ────────────────────────────────────────────────────────

export function getEcosystemSessions(): EcosystemSession[] {
  if (typeof window === "undefined") return INITIAL_SESSIONS;
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(INITIAL_SESSIONS));
      return INITIAL_SESSIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_SESSIONS;
  }
}

export function saveEcosystemSessions(sessions: EcosystemSession[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_SESSIONS, JSON.stringify(sessions));
    notifyEcosystemChange();
  } catch (err) {
    console.warn("[EcosystemStore] Failed to save sessions:", err);
  }
}

export function registerDriverBooking(booking: {
  stationId: string;
  stationName: string;
  city?: string;
  bayNumber?: string;
  connectorType?: string;
  vehicleName?: string;
  vehicleId?: string;
  paymentRail?: 'upi' | 'monad';
  paymentAmount?: string;
  paymentRef?: string;
  pinCode?: string;
  durationMinutes?: number;
}): EcosystemSession {
  const sessions = getEcosystemSessions();
  const newSession: EcosystemSession = {
    id: `RES-${Math.floor(1000 + Math.random() * 9000)}-EV`,
    stationId: booking.stationId,
    stationName: booking.stationName,
    city: booking.city || "Pune",
    bayNumber: booking.bayNumber || "Bay 01",
    connectorType: booking.connectorType || "CCS2 Combo",
    vehicleName: booking.vehicleName || "Tata Nexon EV Long Range",
    vehicleId: booking.vehicleId || "tata-nexon-ev",
    vehicleBatteryPct: 45,
    paymentRail: booking.paymentRail || "upi",
    paymentAmount: booking.paymentAmount || "₹49",
    paymentRef: booking.paymentRef || (booking.paymentRail === "monad" ? "0x892a...10143" : "UPI-994821049381"),
    pinCode: booking.pinCode || `${Math.floor(1000 + Math.random() * 9000)}`,
    startTime: new Date().toISOString(),
    durationMinutes: booking.durationMinutes || 30,
    status: "energized",
    activeKw: booking.connectorType?.includes("CCS2") ? 29.5 : 7.2,
    kwhDelivered: 0.12,
    co2OffsetKg: 0.10,
    hostPayoutInr: booking.paymentRail === "upi" ? 49 : 0,
    hostPayoutMon: booking.paymentRail === "monad" ? 0.025 : 0,
  };

  const updated = [newSession, ...sessions.slice(0, 19)];
  saveEcosystemSessions(updated);
  return newSession;
}

export function updateSessionStatus(
  sessionId: string,
  status: EcosystemSession['status'],
  telemetry?: Partial<Pick<EcosystemSession, 'activeKw' | 'kwhDelivered' | 'co2OffsetKg' | 'vehicleBatteryPct'>>
): void {
  const sessions = getEcosystemSessions();
  const updated = sessions.map((s) => {
    if (s.id === sessionId) {
      return {
        ...s,
        status,
        ...(telemetry?.activeKw !== undefined ? { activeKw: telemetry.activeKw } : {}),
        ...(telemetry?.kwhDelivered !== undefined ? { kwhDelivered: telemetry.kwhDelivered } : {}),
        ...(telemetry?.co2OffsetKg !== undefined ? { co2OffsetKg: telemetry.co2OffsetKg } : {}),
        ...(telemetry?.vehicleBatteryPct !== undefined ? { vehicleBatteryPct: telemetry.vehicleBatteryPct } : {}),
      };
    }
    return s;
  });
  saveEcosystemSessions(updated);
}

// ── Deployed Community Stations ──────────────────────────────────────────────

export function getDeployedStations(): DeployedCommunityStation[] {
  if (typeof window === "undefined") return INITIAL_DEPLOYED_STATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_DEPLOYED);
    if (!raw) {
      localStorage.setItem(STORAGE_DEPLOYED, JSON.stringify(INITIAL_DEPLOYED_STATIONS));
      return INITIAL_DEPLOYED_STATIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_DEPLOYED_STATIONS;
  }
}

export function deployNewCommunityStation(params: {
  name: string;
  city: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  powerKw: number;
  bays: number;
  connectorTypes: string[];
  fundedBy: string;
  capexAmount: string;
  operator: string;
  ratePerKwh?: number;
  parkingFeePerHour?: number;
}): DeployedCommunityStation {
  const current = getDeployedStations();
  const newStation: DeployedCommunityStation = {
    id: `STN-${params.city.slice(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`,
    name: params.name,
    city: params.city,
    area: params.area,
    address: params.address,
    lat: params.lat,
    lng: params.lng,
    powerKw: params.powerKw,
    bays: params.bays,
    connectorTypes: params.connectorTypes,
    fundedBy: params.fundedBy,
    capexAmount: params.capexAmount,
    deployedAt: new Date().toISOString().split("T")[0],
    operator: params.operator,
    ratePerKwh: params.ratePerKwh || 16.0,
    parkingFeePerHour: params.parkingFeePerHour || 40,
    rating: 5.0,
    status: "Online",
  };

  const updated = [newStation, ...current];
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_DEPLOYED, JSON.stringify(updated));
    notifyEcosystemChange();
  }
  return newStation;
}

// ── Tariffs ──────────────────────────────────────────────────────────────────

export function getStationTariffs(): Record<string, StationTariff> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_TARIFFS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function updateStationTariff(stationId: string, tariff: Partial<StationTariff>): void {
  const current = getStationTariffs();
  const existing = current[stationId] || {
    stationId,
    ratePerKwh: 16.5,
    parkingFeePerHour: 40,
    solarOffPeakDiscountPct: 20,
  };
  current[stationId] = { ...existing, ...tariff };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_TARIFFS, JSON.stringify(current));
    notifyEcosystemChange();
  }
}

// ── Aggregated Network Telemetry & KPIs ──────────────────────────────────────

export function getAggregatedEcosystemStats(): EcosystemStats {
  const sessions = getEcosystemSessions();
  const deployed = getDeployedStations();

  const totalBays = deployed.reduce((acc, s) => acc + s.bays, 0) + 12; // baseline bays
  const activeBays = sessions.filter((s) => s.status === "energized" || s.status === "reserved").length;

  let totalKwh = 1248.5; // baseline historical
  let totalInr = 34500;
  let totalMon = 0.85;
  let totalCo2 = 1023.7;

  let twoW = 12;
  let threeW = 8;
  let fourW = 28;

  sessions.forEach((s) => {
    totalKwh += s.kwhDelivered || 0;
    totalCo2 += s.co2OffsetKg || (s.kwhDelivered * 0.82);
    if (s.paymentRail === "upi") {
      totalInr += 49;
    } else {
      totalMon += 0.025;
    }

    if (s.vehicleName.toLowerCase().includes("ather") || s.vehicleName.toLowerCase().includes("scooter")) {
      twoW += 1;
    } else if (s.vehicleName.toLowerCase().includes("treo") || s.vehicleName.toLowerCase().includes("auto")) {
      threeW += 1;
    } else {
      fourW += 1;
    }
  });

  return {
    totalSessions: sessions.length + 42,
    totalKwhDelivered: Math.round(totalKwh * 10) / 10,
    totalRevenueInr: totalInr,
    totalRevenueMon: Math.round(totalMon * 1000) / 1000,
    totalCo2OffsetKg: Math.round(totalCo2 * 10) / 10,
    activeBaysCount: Math.min(activeBays + 4, totalBays),
    totalBaysCount: totalBays,
    fleetMix: {
      twoWheelers: twoW,
      threeWheelers: threeW,
      fourWheelers: fourW,
    },
  };
}

// ── React Hook / Event Subscriber ────────────────────────────────────────────

export function subscribeToEcosystem(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_SESSIONS ||
      e.key === STORAGE_DEPLOYED ||
      e.key === STORAGE_TARIFFS
    ) {
      callback();
    }
  };

  window.addEventListener(ECOSYSTEM_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(ECOSYSTEM_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
