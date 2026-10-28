"use client";

import React, { useEffect, useRef } from "react";
import { Crosshair, Plus, Minus } from "lucide-react";
import type * as L from "leaflet";
import type { LiveStation } from "@/types/api";

interface DriverMobileMapProps {
  center: [number, number];
  zoom?: number;
  userLocation: [number, number];
  stations: LiveStation[];
  selectedStation: LiveStation | null;
  onStationSelect: (station: LiveStation) => void;
  navigationStation: LiveStation | null;
  isNavigating: boolean;
  navProgress: number; // 0 to 1
}

export default function DriverMobileMap({
  center,
  zoom = 13,
  userLocation,
  stations,
  selectedStation,
  onStationSelect,
  navigationStation,
  isNavigating,
  navProgress,
}: DriverMobileMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);

  // ── Initialize Leaflet Map ────────────────────────────────────────────────
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
        attributionControl: false,
      });

      // Clean Google Maps tiles (no watermark, crisp mobile navigation style)
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          subdomains: ["0", "1", "2", "3"],
        }
      ).addTo(map);

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

  // ── Update View on center change or navigation ───────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map) {
      if (isNavigating && navigationStation) {
        import("leaflet").then(({ default: L }) => {
          const bounds = L.latLngBounds([
            userLocation,
            [navigationStation.latitude, navigationStation.longitude],
          ]);
          map.fitBounds(bounds.pad(0.28), {
            animate: true,
            duration: 0.8,
          });
        });
      } else {
        map.setView(center, zoom, { animate: true, duration: 0.6 });
      }
    }
  }, [center[0], center[1], zoom, isNavigating, navigationStation]);

  // ── Render Markers ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    import("leaflet").then(({ default: L }) => {
      markersLayer.clearLayers();

      // 1. User Location Pulse Pin
      const userHtml = `
        <div style="position:relative;width:24px;height:24px;transform:translate(-12px,-12px);">
          <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(201,243,106,0.35);animation:pulse-1 2s infinite;"></div>
          <div style="position:absolute;inset:0;border-radius:50%;background:#151817;border:3px solid #C9F36A;box-shadow:0 3px 12px rgba(21,24,23,0.35);display:flex;align-items:center;justify-content:center;">
            <div style="width:6px;height:6px;border-radius:50%;background:#C9F36A;"></div>
          </div>
        </div>
      `;
      const userIcon = L.divIcon({ html: userHtml, className: "", iconSize: [0, 0] });
      L.marker(userLocation, { icon: userIcon, zIndexOffset: 1000 }).addTo(
        markersLayer
      );

      // 2. Station Markers
      stations.forEach((st) => {
        const isSelected = selectedStation?.station_id === st.station_id;
        const isTarget = navigationStation?.station_id === st.station_id;
        const isUltra = (st.power_kw ?? 0) >= 150;
        const isFast = (st.power_kw ?? 0) >= 50;

        let pinBg = "#151817";
        let pinBorder = "#E2E5DF";
        let boltColor = "#C9F36A";

        if (isTarget) {
          pinBg = "#151817";
          pinBorder = "#C9F36A";
          boltColor = "#C9F36A";
        } else if (isSelected) {
          pinBg = "#151817";
          pinBorder = "#C9F36A";
          boltColor = "#ffffff";
        } else if (isUltra) {
          pinBg = "#151817";
          pinBorder = "#C9F36A";
          boltColor = "#C9F36A";
        } else if (isFast) {
          pinBg = "#2A332C";
          pinBorder = "#E2E5DF";
          boltColor = "#A3D95B";
        } else {
          pinBg = "#ffffff";
          pinBorder = "#D0D5CC";
          boltColor = "#151817";
        }

        const size = isSelected || isTarget ? 34 : 28;
        const offset = size / 2;
        const scale = isSelected || isTarget ? "transform: scale(1.18);" : "";
        const glow =
          isSelected || isTarget
            ? "box-shadow: 0 0 16px rgba(201, 243, 106, 0.7), 0 4px 12px rgba(0,0,0,0.25);"
            : "box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12);";

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
          zIndexOffset: isSelected || isTarget ? 900 : 400,
        }).addTo(markersLayer);

        marker.on("click", () => {
          onStationSelect(st);
        });
      });
    });
  }, [stations, selectedStation?.station_id, navigationStation?.station_id, userLocation[0], userLocation[1]]);

  // ── Render Navigation Route ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;

    import("leaflet").then(({ default: L }) => {
      routeLayer.clearLayers();

      if (isNavigating && navigationStation) {
        const start = userLocation;
        const end: [number, number] = [navigationStation.latitude, navigationStation.longitude];

        // Smooth curved polyline
        const midLat = (start[0] + end[0]) / 2 + (end[1] - start[1]) * 0.12;
        const midLng = (start[1] + end[1]) / 2 - (end[0] - start[0]) * 0.12;

        // Route ambient glow
        L.polyline([start, [midLat, midLng], end], {
          color: "rgba(201, 243, 106, 0.35)",
          weight: 10,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routeLayer);

        // Core route dashed volt line
        L.polyline([start, [midLat, midLng], end], {
          color: "#151817",
          weight: 4.5,
          dashArray: "8, 6",
          lineCap: "round",
          lineJoin: "round",
        }).addTo(routeLayer);

        // Animated Vehicle Pin along route
        const currentLat = start[0] + (end[0] - start[0]) * navProgress;
        const currentLng = start[1] + (end[1] - start[1]) * navProgress;

        const carHtml = `
          <div style="position:relative;width:28px;height:28px;transform:translate(-14px,-14px);">
            <div style="width:28px;height:28px;border-radius:50%;background:#151817;border:2.5px solid #C9F36A;box-shadow:0 4px 14px rgba(21,24,23,0.4);display:flex;align-items:center;justify-content:center;">
              <div style="width:8px;height:8px;border-radius:50%;background:#C9F36A;"></div>
            </div>
          </div>
        `;
        const carIcon = L.divIcon({ html: carHtml, className: "", iconSize: [0, 0] });
        L.marker([currentLat, currentLng], { icon: carIcon, zIndexOffset: 1200 }).addTo(
          routeLayer
        );
      }
    });
  }, [isNavigating, navigationStation, userLocation, navProgress]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#F7F8F6",
        }}
      />

      {/* Floating Map Controls */}
      <div className="absolute right-3 bottom-24 z-30 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.setView(userLocation, 14, { animate: true, duration: 0.6 });
            }
          }}
          aria-label="Center map on my location"
          className="w-11 h-11 min-w-[44px] min-h-[44px] bg-white/95 backdrop-blur-md rounded-xl border border-[rgba(17,19,18,0.12)] shadow-md flex items-center justify-center text-[#111312] hover:bg-[#F3F2ED] active:scale-95 transition-all cursor-pointer"
        >
          <Crosshair size={18} />
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
