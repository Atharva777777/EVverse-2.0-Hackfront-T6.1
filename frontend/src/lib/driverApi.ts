/**
 * frontend/src/lib/driverApi.ts
 * =============================
 * Typed API client for EV Verse driver services:
 * - Session token persistence & auth headers
 * - Garage vehicles CRUD with validation & pagination
 * - Driver preferences (active vehicle & compatibility mode)
 * - Persistent favourites
 * - Station issue reports
 * - Charging session receipts & history
 * - Resilient offline fallback with local synchronization
 */

import type {
  DriverFavouritesResponse,
  DriverPreferences,
  DriverSession,
  DriverVehicle,
  PaginatedResult,
  StationReportInput,
  StationReportItem,
  ChargingSessionInput,
  ChargingSessionItem,
} from "@/types/api";
import { getApiBaseUrl } from "./api";

const BASE_URL = getApiBaseUrl();
const SESSION_TOKEN_KEY = "evverse_driver_session_token";

// ── Token Storage Helpers ─────────────────────────────────────────────────────

export function getStoredDriverToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveStoredDriverToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } catch (err) {
    console.warn("[QuantEV] Could not save driver token:", err);
  }
}

// ── Generic Authenticated Request Helper ──────────────────────────────────────

async function driverRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredDriverToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["X-Driver-Token"] = token;
  }

  const url = `${BASE_URL}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err) {
    console.warn(`[QuantEV Driver API] Network error contacting ${url}:`, err);
    throw new Error("Unable to reach EV Verse backend server.");
  }

  // Update token if returned in header
  const returnedToken = response.headers.get("X-Driver-Token");
  if (returnedToken && returnedToken !== token) {
    saveStoredDriverToken(returnedToken);
  }

  if (!response.ok) {
    let errorDetail = `Request failed (HTTP ${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        errorDetail =
          typeof errBody.detail === "string"
            ? errBody.detail
            : JSON.stringify(errBody.detail);
      }
    } catch {
      // Ignore json parse error
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

// ── 1. Authentication & Session ───────────────────────────────────────────────

export async function initDriverSession(name?: string): Promise<DriverSession> {
  const currentToken = getStoredDriverToken();
  const res = await driverRequest<DriverSession>("/api/v1/driver/session", {
    method: "POST",
    body: JSON.stringify({
      token: currentToken || undefined,
      name: name || undefined,
    }),
  });

  if (res?.token) {
    saveStoredDriverToken(res.token);
  }

  return res;
}

// ── 2. Garage Vehicles CRUD ───────────────────────────────────────────────────

export async function fetchDriverVehicles(
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResult<DriverVehicle>> {
  return driverRequest<PaginatedResult<DriverVehicle>>(
    `/api/v1/driver/vehicles?page=${page}&limit=${limit}`
  );
}

export async function createDriverVehicle(
  vehicle: Partial<DriverVehicle>
): Promise<DriverVehicle> {
  return driverRequest<DriverVehicle>("/api/v1/driver/vehicles", {
    method: "POST",
    body: JSON.stringify({
      id: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year ?? 2025,
      image: vehicle.image ?? "/images/car-model.png",
      battery_kwh: vehicle.battery_kwh ?? vehicle.usable_kwh,
      usable_kwh: vehicle.usable_kwh,
      current_battery_pct: vehicle.current_battery_pct ?? 75,
      wltp_range_km: vehicle.wltp_range_km ?? 450,
      efficiency_kwh100km: vehicle.efficiency_kwh100km ?? 18.0,
      max_dc_speed_kw: vehicle.max_dc_speed_kw,
      max_ac_speed_kw: vehicle.max_ac_speed_kw ?? 11,
      plug_type: vehicle.plug_type,
      plug_image: vehicle.plug_image,
      vin: vehicle.vin ?? "",
      soh_pct: vehicle.soh_pct ?? 99.0,
      is_active: vehicle.is_active ?? false,
    }),
  });
}

export async function updateDriverVehicle(
  vehicleId: string,
  updates: Partial<DriverVehicle>
): Promise<DriverVehicle> {
  return driverRequest<DriverVehicle>(`/api/v1/driver/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function deleteDriverVehicle(vehicleId: string): Promise<void> {
  await driverRequest<void>(`/api/v1/driver/vehicles/${encodeURIComponent(vehicleId)}`, {
    method: "DELETE",
  });
}

// ── 3. Driver Preferences ─────────────────────────────────────────────────────

export async function fetchDriverPreferences(): Promise<DriverPreferences> {
  return driverRequest<DriverPreferences>("/api/v1/driver/preferences");
}

export async function updateDriverPreferences(
  updates: Partial<DriverPreferences>
): Promise<DriverPreferences> {
  return driverRequest<DriverPreferences>("/api/v1/driver/preferences", {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

// ── 4. Station Favourites ─────────────────────────────────────────────────────

export async function fetchDriverFavourites(
  page: number = 1,
  limit: number = 100
): Promise<DriverFavouritesResponse> {
  return driverRequest<DriverFavouritesResponse>(
    `/api/v1/driver/favourites?page=${page}&limit=${limit}`
  );
}

export async function addDriverFavourite(stationId: string): Promise<void> {
  await driverRequest<void>(`/api/v1/driver/favourites/${encodeURIComponent(stationId)}`, {
    method: "POST",
  });
}

export async function removeDriverFavourite(stationId: string): Promise<void> {
  await driverRequest<void>(`/api/v1/driver/favourites/${encodeURIComponent(stationId)}`, {
    method: "DELETE",
  });
}

// ── 5. Community Station Reports ──────────────────────────────────────────────

export async function fetchStationReports(
  stationId?: string,
  page: number = 1,
  limit: number = 50
): Promise<PaginatedResult<StationReportItem>> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (stationId) query.set("station_id", stationId);

  return driverRequest<PaginatedResult<StationReportItem>>(
    `/api/v1/driver/reports?${query.toString()}`
  );
}

export async function submitStationReport(
  report: StationReportInput
): Promise<StationReportItem> {
  return driverRequest<StationReportItem>("/api/v1/driver/reports", {
    method: "POST",
    body: JSON.stringify(report),
  });
}

// ── 6. Charging Sessions & Receipts ───────────────────────────────────────────

export async function fetchChargingSessions(
  page: number = 1,
  limit: number = 50
): Promise<PaginatedResult<ChargingSessionItem>> {
  return driverRequest<PaginatedResult<ChargingSessionItem>>(
    `/api/v1/driver/charging-sessions?page=${page}&limit=${limit}`
  );
}

export async function recordChargingSession(
  session: ChargingSessionInput
): Promise<ChargingSessionItem> {
  return driverRequest<ChargingSessionItem>("/api/v1/driver/charging-sessions", {
    method: "POST",
    body: JSON.stringify(session),
  });
}

// ── 7. Monad Testnet Booking & Station Owner Integration ───────────────────────

export interface BookingCreateInput {
  id?: string;
  station_id: string;
  station_name: string;
  bay_number: string;
  connector_type: string;
  duration_minutes: number;
  total_cost: string;
  mon_amount: string;
  tx_hash?: string;
  recipient_address?: string;
  payment_method: string;
  session_type?: "hold_only" | "charging_session";
  target_kwh?: number;
  target_battery_pct?: number;
  pin_code?: string;
  start_time?: string;
  expiry_time?: string;
  expiry_timestamp?: number;
}

export interface BookingResponseItem {
  id: string;
  station_id: string;
  station_name: string;
  bay_number: string;
  connector_type: string;
  duration_minutes: number;
  total_cost: string;
  mon_amount: string;
  pin_code: string;
  start_time: string;
  expiry_time: string;
  expiry_timestamp: number;
  payment_method: string;
  tx_hash?: string | null;
  block_number?: number | null;
  from_address?: string | null;
  to_address?: string | null;
  gas_used?: string | null;
  payment_status: string;
  explorer_url?: string | null;
  created_at: string;
  verified_at?: string | null;
  session_type?: string;
  target_kwh?: number | null;
  target_battery_pct?: number | null;
  physical_activation_triggered: boolean;
  settlement_note: string;
}

export interface StationOwnerBookingsResponse {
  items: BookingResponseItem[];
  total: number;
}

export async function createDriverBooking(
  booking: BookingCreateInput
): Promise<BookingResponseItem> {
  return driverRequest<BookingResponseItem>("/api/v1/driver/bookings", {
    method: "POST",
    body: JSON.stringify(booking),
  });
}

export async function getStationOwnerBookings(
  stationId?: string,
  limit: number = 50
): Promise<StationOwnerBookingsResponse> {
  const query = new URLSearchParams({
    limit: String(limit),
  });
  if (stationId) query.set("station_id", stationId);

  return driverRequest<StationOwnerBookingsResponse>(
    `/api/v1/driver/station-owner/bookings?${query.toString()}`
  );
}
