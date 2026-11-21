"use client";

import React, { useEffect, useRef } from "react";
import { Crosshair, Plus, Minus, AlertTriangle, RefreshCw } from "lucide-react";
import type * as L from "leaflet";
import type { LiveStation } from "@/types/api";
import type { RoadRoute } from "@/lib/routeService";

interface DriverMobileMapProps {
  center: [number, number];
  zoom?: number;
  userLocation: [number, number];
  deviceLocation?: [number, number] | null;
  deviceAccuracy?: number | null;
  locationStatus?: string;
  onAcquireLocation?: () => void;
  stations: LiveStation[];
  selectedStation: LiveStation | null;
  onStationSelect: (station: LiveStation) => void;
  // Real road route integration
  activeRoute?: RoadRoute | null;
  activeLegIndex?: number;
  driverLocation?: [number, number] | null;
  driverHeading?: number | null;
  isNavigating: boolean;
  routeError?: string | null;
  onRetryRoute?: () => void;
}

export default function DriverMobileMap({
  center,
  zoom = 13,
  userLocation,
  deviceLocation,
  deviceAccuracy,
  locationStatus,
  onAcquireLocation,
  stations,
  selectedStation,
  onStationSelect,
  activeRoute,
  activeLegIndex = 0,
  driverLocation,
  driverHeading,
  isNavigating,
  routeError,
  onRetryRoute,
}: DriverMobileMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  const activeDevicePos = driverLocation || deviceLocation;

  // ── Initialize Leaflet Map with CartoDB Voyager Legal Open Tiles ───────────
  useEffect(() => {
    let map: L.Map | null = null;
    let isMounted = true;

    async function init() {
      if (!mapContainerRef.current) return;
      const L = (await import("leaflet")).default;
      if (!isMounted || mapInstanceRef.current) return;

      map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: true,
      });

      // OpenStreetMap standard tile layer — clean, free, keyless, and policy-compliant
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
    }

    init();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ── Update Viewport on center change or active route ───────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (isNavigating && activeRoute && activeRoute.success && activeRoute.allCoordinates.length > 0) {
      import("leaflet").then(({ default: L }) => {
        const bounds = L.latLngBounds(activeRoute.allCoordinates);
        map.fitBounds(bounds.pad(0.18), {
          animate: true,
          duration: 0.8,
        });
      });
    } else if (!isNavigating) {
      map.setView(center, zoom, { animate: true, duration: 0.6 });
    }
  }, [center[0], center[1], zoom, isNavigating, activeRoute]);

  // ── Render Station and Driver Markers ─────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    import("leaflet").then(({ default: L }) => {
      markersLayer.clearLayers();

      // 1. Driver / User Location Marker (rendered only when genuine GPS position is acquired)
      if (activeDevicePos) {
        const hasHeading = typeof driverHeading === "number" && !isNaN(driverHeading);
        const headingRotation = hasHeading ? `transform: rotate(${driverHeading}deg);` : "";

        const userHtml = `
          <div style="position:relative;width:30px;height:30px;transform:translate(-15px,-15px);">
            <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(2,132,199,0.3);animation:pulse-1 2s infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#0284C7;border:3px solid #FFFFFF;box-shadow:0 3px 12px rgba(2,132,199,0.5);display:flex;align-items:center;justify-content:center;${headingRotation}">
              ${
                hasHeading
                  ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="2"><polygon points="12 2 19 21 12 17 5 21 12 2"></polygon></svg>`
                  : `<div style="width:8px;height:8px;border-radius:50%;background:#FFFFFF;"></div>`
              }
            </div>
          </div>
        `;
        const userIcon = L.divIcon({ html: userHtml, className: "", iconSize: [0, 0] });
        L.marker(activeDevicePos, { icon: userIcon, zIndexOffset: 1200 }).addTo(markersLayer);
      }

      // 2. Station Markers (Rendered when browsing or selecting)
      stations.forEach((st) => {
        const isSelected = selectedStation?.station_id === st.station_id;
        const isChargingWaypoint =
          activeRoute?.chargingWaypointName === st.name ||
          (activeRoute?.chargingWaypointCoords &&
            Math.abs(st.latitude - activeRoute.chargingWaypointCoords[0]) < 0.001 &&
            Math.abs(st.longitude - activeRoute.chargingWaypointCoords[1]) < 0.001);

        const isUltra = (st.power_kw ?? 0) >= 150;
        const isFast = (st.power_kw ?? 0) >= 50;

        let pinBg = "#0F172A";
        let pinBorder = "#E2E8F0";
        let boltColor = "#16A34A";

        if (isChargingWaypoint) {
          pinBg = "#0284C7";
          pinBorder = "#FFFFFF";
          boltColor = "#FFFFFF";
        } else if (isSelected) {
          pinBg = "#0284C7";
          pinBorder = "#FFFFFF";
          boltColor = "#FFFFFF";
        } else if (isUltra) {
          pinBg = "#0F172A";
          pinBorder = "#16A34A";
          boltColor = "#16A34A";
        } else if (isFast) {
          pinBg = "#1E293B";
          pinBorder = "#38BDF8";
          boltColor = "#38BDF8";
        } else {
          pinBg = "#ffffff";
          pinBorder = "#D0D5CC";
          boltColor = "#111312";
        }

        const size = isSelected || isChargingWaypoint ? 34 : 28;
        const offset = size / 2;
        const scale = isSelected || isChargingWaypoint ? "transform: scale(1.15);" : "";
        const glow =
          isSelected || isChargingWaypoint
            ? "box-shadow: 0 0 16px rgba(200, 243, 105, 0.7), 0 4px 12px rgba(0,0,0,0.3);"
            : "box-shadow: 0 3px 10px rgba(0, 0, 0, 0.15);";

        const pinHtml = `
          <div style="position:relative;width:${size}px;height:${size}px;transform:translate(-${offset}px,-${offset}px);cursor:pointer;transition:all 0.2s ease;">
            <div style="width:${size}px;height:${size}px;border-radius:50%;background:${pinBg};border:2.5px solid ${pinBorder};${glow}${scale}display:flex;align-items:center;justify-content:center;">
              <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="${boltColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
          </div>
        `;

        const icon = L.divIcon({ html: pinHtml, className: "", iconSize: [0, 0] });
        const marker = L.marker([st.latitude, st.longitude], {
          icon,
          zIndexOffset: isSelected || isChargingWaypoint ? 950 : 400,
        }).addTo(markersLayer);

        marker.on("click", () => {
          onStationSelect(st);
        });
      });
    });
  }, [
    stations,
    selectedStation?.station_id,
    activeRoute?.chargingWaypointCoords,
    activeDevicePos ? activeDevicePos[0] : null,
    activeDevicePos ? activeDevicePos[1] : null,
    driverHeading,
  ]);

  // ── Render Real Road Route Geometry ───────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    import("leaflet").then(({ default: L }) => {
      routeLayer.clearLayers();

      if (!isNavigating || !activeRoute || !activeRoute.success) {
        return;
      }

      // 1. Render Each Real Road Leg Polyline
      activeRoute.legs.forEach((leg, index) => {
        const isCurrentLeg = index === activeLegIndex;

        if (isCurrentLeg) {
          // Current active leg: High visibility volt glow & core polyline
          L.polyline(leg.coordinates, {
            color: "rgba(200, 243, 105, 0.45)",
            weight: 9,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(routeLayer);

          L.polyline(leg.coordinates, {
            color: "#111312",
            weight: 4.5,
            lineCap: "round",
            lineJoin: "round",
          }).addTo(routeLayer);
        } else {
          // Subsequent leg (e.g. from Charging Stop to Final Destination):
          // Dashed green highway path
          L.polyline(leg.coordinates, {
            color: "#16A34A",
            weight: 4,
            dashArray: "7, 6",
            lineCap: "round",
            lineJoin: "round",
          }).addTo(routeLayer);
        }
      });

      // 2. Charging Waypoint Marker (if present)
      if (activeRoute.hasChargingWaypoint && activeRoute.chargingWaypointCoords) {
        const wpCoords = activeRoute.chargingWaypointCoords;
        const waypointHtml = `
          <div style="position:relative;width:34px;height:34px;transform:translate(-17px,-17px);cursor:pointer;">
            <div style="width:34px;height:34px;border-radius:50%;background:#0284C7;border:2.5px solid #FFFFFF;box-shadow:0 0 16px rgba(2,132,199,0.7);display:flex;align-items:center;justify-content:center;">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
            <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#0F172A;color:#38BDF8;font-family:monospace;font-size:9.5px;font-weight:bold;padding:2px 6px;border-radius:6px;border:1px solid rgba(56,189,248,0.4);box-shadow:0 2px 8px rgba(0,0,0,0.3);">
              CHARGER STOP
            </div>
          </div>
        `;
        const waypointIcon = L.divIcon({ html: waypointHtml, className: "", iconSize: [0, 0] });
        L.marker(wpCoords, { icon: waypointIcon, zIndexOffset: 1100 }).addTo(routeLayer);
      }

      // 3. Final Destination Checkered Flag Marker
      const destCoords = activeRoute.destinationCoords;
      const destHtml = `
        <div style="position:relative;width:34px;height:34px;transform:translate(-17px,-17px);cursor:pointer;">
          <div style="width:34px;height:34px;border-radius:50%;background:#111312;border:2.5px solid #FFFFFF;box-shadow:0 4px 14px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
              <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
          </div>
          <div style="position:absolute;top:36px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#111312;color:#FFFFFF;font-family:sans-serif;font-size:10px;font-weight:bold;padding:2px 7px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            ${activeRoute.destinationName}
          </div>
        </div>
      `;
      const destIcon = L.divIcon({ html: destHtml, className: "", iconSize: [0, 0] });
      L.marker(destCoords, { icon: destIcon, zIndexOffset: 1050 }).addTo(routeLayer);
    });
  }, [isNavigating, activeRoute, activeLegIndex]);

  return (
    <div className="relative w-full h-full isolate overflow-hidden z-0">
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#F7F8F6",
        }}
      />

      {/* Route Error Notification on Map */}
      {routeError && (
        <div className="absolute top-4 left-4 right-4 z-20 bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] p-3 rounded-2xl shadow-xl flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#DC2626] shrink-0" />
            <span className="font-medium">{routeError}</span>
          </div>
          {onRetryRoute && (
            <button
              type="button"
              onClick={onRetryRoute}
              className="px-2.5 py-1 bg-white border border-[#FECACA] rounded-lg text-[#991B1B] font-bold text-[11px] flex items-center gap-1 hover:bg-[#FEE2E2] cursor-pointer shrink-0 ml-2"
            >
              <RefreshCw size={11} />
              Retry
            </button>
          )}
        </div>
      )}

      {/* Floating Map Controls */}
      <div className="absolute right-3 bottom-24 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            if (activeDevicePos && mapInstanceRef.current) {
              mapInstanceRef.current.setView(activeDevicePos, 15, {
                animate: true,
                duration: 0.6,
              });
            } else if (onAcquireLocation) {
              onAcquireLocation();
            } else if (mapInstanceRef.current) {
              mapInstanceRef.current.setView(center, zoom, {
                animate: true,
                duration: 0.6,
              });
            }
          }}
          aria-label="Center map on my location"
          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-white/95 backdrop-blur-md rounded-xl border border-[rgba(17,19,18,0.12)] shadow-md flex items-center justify-center text-[#111312] hover:bg-[#F3F2ED] active:scale-95 transition-all cursor-pointer"
        >
          <Crosshair size={18} className={activeDevicePos ? "text-[#111312]" : "text-[#767D78]"} />
        </button>
        <div className="flex flex-col rounded-xl overflow-hidden border border-[rgba(17,19,18,0.12)] shadow-md bg-white/95 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
            }}
            aria-label="Zoom in"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#111312] hover:bg-[#F3F2ED] active:scale-95 transition-all border-b border-[rgba(17,19,18,0.08)] cursor-pointer"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
            }}
            aria-label="Zoom out"
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#111312] hover:bg-[#F3F2ED] active:scale-95 transition-all cursor-pointer"
          >
            <Minus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
