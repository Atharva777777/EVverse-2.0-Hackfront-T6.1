"use client";

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import type * as L from "leaflet";
import type { ZoneDetail, LiveStation } from "@/types/api";
import { Building2 } from "lucide-react";

export interface ChargingMapHandle {
  setUserLocation: (lat: number, lng: number) => void;
  runOptimizationSequence: (zones: ZoneDetail[]) => Promise<void>;
  showResults: (zones: ZoneDetail[], selected: string[]) => void;
  showScenario: (zones: ZoneDetail[], selected: string[], k: number) => void;
  resetToIdle: () => void;
}

interface ChargingMapProps {
  onSequenceStep?: (step: number) => void;
  onReady?: () => void;
  liveStations?: LiveStation[];
  onStationClick?: (station: LiveStation) => void;
  selectedStationId?: string;
  showLiveStationsOverride?: boolean;
  hideInternalLayerControls?: boolean;
  is3DMode?: boolean;
  onToggle3D?: () => void;
  onOpen3DTwin?: (siteInfo: {
    label: string;
    name: string;
    lat: number;
    lng: number;
    demandKwh?: number;
    gapScore?: number;
    quboScore?: number;
  }) => void;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function demandColor(demand: number, maxDemand: number): string {
  const ratio = maxDemand > 0 ? demand / maxDemand : 0;
  if (ratio >= 0.7) return "rgba(10,22,40,0.55)";
  if (ratio >= 0.35) return "rgba(30,61,117,0.38)";
  if (ratio >= 0.15) return "rgba(64,114,184,0.25)";
  return "rgba(169,196,232,0.18)";
}

function demandBorder(demand: number, maxDemand: number): string {
  const ratio = maxDemand > 0 ? demand / maxDemand : 0;
  if (ratio >= 0.7) return "rgba(10,22,40,0.7)";
  if (ratio >= 0.35) return "rgba(30,61,117,0.55)";
  return "rgba(64,114,184,0.4)";
}

function formatDemand(kwh: number): string {
  return kwh >= 1000 ? `${(kwh / 1000).toFixed(1)} MWh/h` : `${Math.round(kwh)} kWh/h`;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const ChargingMap = forwardRef<ChargingMapHandle, ChargingMapProps>(
  ({ onSequenceStep, onReady, liveStations, onStationClick, selectedStationId, showLiveStationsOverride, hideInternalLayerControls, is3DMode, onToggle3D, onOpen3DTwin }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const userMarkerRef = useRef<L.Marker | null>(null);
    const customMarkerRef = useRef<L.Marker | null>(null);
    const layersRef = useRef<L.Layer[]>([]);
    const liveStationLayersRef = useRef<L.Layer[]>([]);
    const userLatLngRef = useRef<[number, number]>([37.8032, -122.4005]);

    const [isPlaceChargerActive, setIsPlaceChargerActive] = useState(false);

    const [showCoverage, setShowCoverage] = useState(true);
    const [showHeatmap, setShowHeatmap] = useState(false);
    const [showFleetFlow, setShowFleetFlow] = useState(true);
    const [showLiveStations, setShowLiveStations] = useState(true);
    const [showEnergyTransition, setShowEnergyTransition] = useState(true);
    const [transitionYear, setTransitionYear] = useState<2026 | 2028 | 2030 | 2032>(2028);
    const [hasResults, setHasResults] = useState(false);
    const lastResultsRef = useRef<{ zones: ZoneDetail[]; selected: string[] } | null>(null);

    const clearLayers = useCallback(() => {
      layersRef.current.forEach((l) => { try { l.remove(); } catch {} });
      layersRef.current = [];
    }, []);

    const clearLiveStationLayers = useCallback(() => {
      liveStationLayersRef.current.forEach((l) => { try { l.remove(); } catch {} });
      liveStationLayersRef.current = [];
    }, []);

    useEffect(() => {
      let cancelled = false;
      let ro: ResizeObserver | null = null;

      (async () => {
        const el = containerRef.current;
        if (!el) return;

        const L = (await import("leaflet")).default;

        // Guard: if this effect was cleaned up while we awaited the import,
        // or if another mount already initialised the map on this container,
        // bail out to avoid the "Map container is already initialized" error.
        if (cancelled || mapRef.current) return;
        if ((el as HTMLElement & { _leaflet_id?: number })._leaflet_id) return;

        el.style.width = "100%";
        el.style.height = "100%";

        const map = L.map(el, {
          center: [19.0467, 72.8911],
          zoom: 12,
          zoomControl: false,
          scrollWheelZoom: true,
          attributionControl: true,
        });

        // Base tile layers (English names prioritized)
        const googleEnglish = L.tileLayer(
          "https://mt{s}.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}",
          {
            attribution: '© Google Maps',
            subdomains: ["0", "1", "2", "3"],
            maxZoom: 20,
          }
        );

        const esriStreets = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: '© <a href="https://www.esri.com/">Esri</a>',
            maxZoom: 19,
          }
        );

        const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        });

        // Default to Google English map layer
        googleEnglish.addTo(map);

        // Layer switcher at bottom-right
        L.control.layers(
          {
            "English (Google)": googleEnglish,
            "English (Esri)": esriStreets,
            "OpenStreetMap (Local)": osm,
          },
          undefined,
          { position: "bottomright" }
        ).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);

        // Map click handler: allows investor to drop a charger anywhere in the city
        map.on("click", (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          if (customMarkerRef.current) {
            customMarkerRef.current.remove();
          }

          const customIcon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:56px;height:56px;transform:translate(-28px,-28px);cursor:pointer;">
              <div style="position:absolute;inset:0;border-radius:50%;background:#059669;opacity:0.25;animation:pulse-1 2s ease-out infinite;"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#0a1628;border:3px solid #10b981;box-shadow:0 4px 16px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
                <span style="font-size:14px;">⚡</span>
              </div>
            </div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const cm = L.marker([lat, lng], { icon: customIcon, zIndexOffset: 3000 }).addTo(map);
          customMarkerRef.current = cm;

          cm.bindPopup(
            L.popup({ closeButton: true, maxWidth: 300, offset: [0, -10] }).setContent(`
              <div style="font-family:'Times New Roman',serif;padding:16px 18px;min-width:250px;">
                <div style="display:inline-flex;align-items:center;gap:6px;background:#059669;color:white;font-size:10px;font-weight:700;letter-spacing:0.06em;padding:4px 10px;border-radius:99px;margin-bottom:10px;">
                  ★ Custom Investor Site
                </div>
                <div style="font-size:18px;font-weight:700;color:var(--color-ink);margin-bottom:4px;">
                  Candidate Installation
                </div>
                <div style="font-size:11.5px;color:var(--color-ink-3);margin-bottom:12px;">
                  ${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E
                </div>
                <button
                  onclick="window.__open3DTwin && window.__open3DTwin('Custom Candidate', 'Custom Location (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)', ${lat}, ${lng}, 520, 8.8, 0.91)"
                  style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--color-navy-900);color:white;font-family:'Times New Roman',serif;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(10,22,40,0.2);"
                >
                  <span>Launch 3D Digital Twin & Pro-Forma →</span>
                </button>
              </div>
            `)
          ).openPopup();
        });

        mapRef.current = map;
        requestAnimationFrame(() => map.invalidateSize());
        setTimeout(() => mapRef.current?.invalidateSize(), 300);
        onReady?.();

        if (el && typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
          ro.observe(el);
        }
      })();

      return () => {
        cancelled = true;
        ro?.disconnect();
        if (mapRef.current) {
          try { mapRef.current.remove(); } catch {}
          mapRef.current = null;
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Bind global popup click handler for 3D digital twin launch
    useEffect(() => {
      (window as unknown as Record<string, unknown>).__open3DTwin = (
        label: string,
        name: string,
        lat: number,
        lng: number,
        demandKwh?: number,
        gapScore?: number,
        quboScore?: number
      ) => {
        onOpen3DTwin?.({ label, name, lat, lng, demandKwh, gapScore, quboScore });
      };
      return () => {
        delete (window as unknown as Record<string, unknown>).__open3DTwin;
      };
    }, [onOpen3DTwin]);

    const renderOverlayLayers = useCallback(
      (zones: ZoneDetail[], selected: string[], isNew: boolean = false) => {
        import("leaflet").then(({ default: L }) => {
          const map = mapRef.current;
          if (!map) return;
          clearLayers();

          const selectedSet = new Set(selected);
          const maxDemand = Math.max(...zones.map((z) => z.predicted_demand_kwh_h), 1);
          const [uLat, uLng] = userLatLngRef.current;
          const selZones = zones.filter((z) => selectedSet.has(z.label));

          // 1. Demand Heatmap Layer (if active)
          if (showHeatmap) {
            zones.forEach((z) => {
              const ratio = z.predicted_demand_kwh_h / maxDemand;
              const color = ratio > 0.6 ? "#e11d48" : ratio > 0.3 ? "#f59e0b" : "#3b82f6";
              const heatCircle = L.circle([z.latitude, z.longitude], {
                radius: Math.max(900, ratio * 2400),
                color: "transparent",
                fillColor: color,
                fillOpacity: 0.16,
              }).addTo(map);
              layersRef.current.push(heatCircle);
            });
          }

          // 2. Grid Equilibrium Ripples (Pillar 2: City-Scale Spatial Transition)
          if (showEnergyTransition && selZones.length > 0) {
            const config = {
              2026: { radius: 1300, color: "#10b981", opacity: 0.16, weight: 1.5 },
              2028: { radius: 1900, color: "#0ea5e9", opacity: 0.20, weight: 1.8 },
              2030: { radius: 2500, color: "#f59e0b", opacity: 0.24, weight: 2.0 },
              2032: { radius: 3200, color: "#6366f1", opacity: 0.28, weight: 2.2 },
            }[transitionYear];

            selZones.forEach((sz) => {
              const eqCircle = L.circle([sz.latitude, sz.longitude], {
                radius: config.radius,
                color: config.color,
                weight: config.weight,
                dashArray: "6 5",
                fillColor: config.color,
                fillOpacity: config.opacity,
              }).addTo(map);
              layersRef.current.push(eqCircle);
            });
          }

          // 3. Fleet Dispatch Flow Rays (if active)
          if (showFleetFlow && selZones.length > 0) {
            zones.filter((z) => !selectedSet.has(z.label)).forEach((unsel) => {
              let nearest = selZones[0];
              let minDist = haversine(unsel.latitude, unsel.longitude, nearest.latitude, nearest.longitude);
              for (const s of selZones) {
                const d = haversine(unsel.latitude, unsel.longitude, s.latitude, s.longitude);
                if (d < minDist) {
                  minDist = d;
                  nearest = s;
                }
              }
              const ray = L.polyline(
                [[unsel.latitude, unsel.longitude], [nearest.latitude, nearest.longitude]],
                { color: "#1e3d75", weight: 1.5, dashArray: "4 6", opacity: 0.45 }
              ).addTo(map);
              layersRef.current.push(ray);
            });
          }

          // 3. Candidate site markers (non-selected)
          zones.filter((z) => !selectedSet.has(z.label)).forEach((z) => {
            const icon = L.divIcon({
              className: "",
              html: `<div style="width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,0.95);border:1.5px solid rgba(10,22,40,0.25);box-shadow:0 1px 4px rgba(10,22,40,0.1);transform:translate(-7px,-7px);"></div>`,
              iconSize: [0, 0], iconAnchor: [0, 0],
            });
            const dist = haversine(uLat, uLng, z.latitude, z.longitude);
            const m = L.marker([z.latitude, z.longitude], { icon, zIndexOffset: 600 }).addTo(map);
            m.bindPopup(L.popup({ closeButton: true, maxWidth: 220, offset: [0, -5] }).setContent(`
              <div style="font-family:Times New Roman,serif;padding:16px 18px;min-width:180px;">
                <div style="display:inline-block;background:var(--color-grey-100);color:var(--color-ink-3);font-size:10px;letter-spacing:0.08em;padding:3px 8px;border-radius:4px;margin-bottom:10px;">Candidate Zone</div>
                <div style="font-size:20px;color:var(--color-ink);letter-spacing:-0.02em;margin-bottom:10px;">${z.name_primary || `Site ${z.label}`}</div>
                <div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--color-border);padding-top:10px;font-size:12px;">
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Predicted demand</span><span style="color:var(--color-ink);font-weight:600;">${formatDemand(z.predicted_demand_kwh_h)}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">QUBO score</span><span>${z.qubo_c_value.toFixed(3)}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Distance from area</span><span>${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}</span></div>
                </div>
              </div>`));
            layersRef.current.push(m);
          });

          // 4. Selected stations: Ranked #1, #2, #3 matching recommendation.selected_zones
          const rankedSelZones = [...selZones].sort(
            (a, b) => selected.indexOf(a.label) - selected.indexOf(b.label)
          );

          rankedSelZones.forEach((z, idx) => {
            const rank = selected.indexOf(z.label) + 1;
            const rankColor = rank === 1 ? "#D97706" : rank === 2 ? "#2563EB" : "#059669";
            const rankTitle = rank === 1 ? "Rank #1 · Primary Deployment Site" : rank === 2 ? "Rank #2 · Strategic Network Hub" : "Rank #3 · Grid-Balanced Site";
            const defaultKeyReason = rank === 1
              ? "Highest direct localized charging capture with maximum daily turnaround efficiency."
              : rank === 2
              ? "Optimal 3km proximity spillover servicing adjacent traffic corridors without duplication."
              : "Fills critical charging deficit while maintaining balanced power distribution across the grid.";
            const keyReason = z.key_reason || defaultKeyReason;

            if (showCoverage) {
              // 3km mathematical boundary
              const cov3k = L.circle([z.latitude, z.longitude], {
                radius: 3000,
                color: rankColor,
                fillColor: rankColor,
                fillOpacity: 0.05,
                weight: 1.5,
                dashArray: "4 8",
              }).addTo(map);

              // 1.2km core service radius
              const covCore = L.circle([z.latitude, z.longitude], {
                radius: 1200,
                color: rankColor,
                fillColor: rankColor,
                fillOpacity: 0.12,
                weight: 1.5,
              }).addTo(map);

              layersRef.current.push(cov3k, covCore);
            }

            const dist = haversine(uLat, uLng, z.latitude, z.longitude);
            const icon = L.divIcon({
              className: "",
              html: `<div style="position:relative;width:64px;height:64px;transform:translate(-32px,-32px);cursor:pointer;">
                <div style="position:absolute;inset:0;border-radius:50%;background:${rankColor};opacity:0.22;animation:pulse-1 2.2s ease-out infinite;"></div>
                <div style="position:absolute;inset:6px;border-radius:50%;background:${rankColor};opacity:0.15;animation:pulse-2 2.2s ease-out 0.6s infinite;"></div>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:var(--color-navy-900);border:3px solid ${rankColor};box-shadow:0 6px 20px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
                  <span style="color:white;font-family:'Times New Roman',serif;font-weight:700;font-size:13px;letter-spacing:-0.02em;">#${rank}</span>
                </div>
              </div>`,
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            });

            const m = L.marker([z.latitude, z.longitude], { icon, zIndexOffset: 2000 - idx * 100 }).addTo(map);
            m.bindPopup(L.popup({ closeButton: true, maxWidth: 320, offset: [0, -10] }).setContent(`
              <div style="font-family:'Times New Roman',serif;padding:18px 20px;min-width:270px;">
                <div style="display:inline-flex;align-items:center;gap:6px;background:${rankColor};color:white;font-size:10.5px;font-weight:700;letter-spacing:0.06em;padding:4px 10px;border-radius:99px;margin-bottom:12px;">
                  ★ ${rankTitle}
                </div>
                <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:var(--color-ink);margin-bottom:2px;">
                  ${z.name_primary || `Site ${z.label}`}
                </div>
                <div style="font-size:12px;color:var(--color-ink-3);margin-bottom:12px;">
                  ${z.latitude.toFixed(4)}°, ${z.longitude.toFixed(4)}°
                </div>
                <div style="background:rgba(10,22,40,0.04);border-left:3px solid ${rankColor};border-radius:4px;padding:8px 10px;margin-bottom:12px;font-size:12px;line-height:1.4;color:var(--color-ink-2);">
                  <strong>Key Reason:</strong> ${keyReason}
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--color-border);padding-top:10px;font-size:12px;">
                  <div style="display:flex;justify-content:space-between;padding-bottom:4px;border-bottom:1px dashed var(--color-border-subtle);"><span style="color:var(--color-ink-4);">Existing Station</span><span style="font-weight:700;color:${(z.has_existing_station || (z.existing_station_count ?? 0) > 0) ? 'var(--color-navy-800)' : 'var(--color-ink-3)'};">${(z.has_existing_station || (z.existing_station_count ?? 0) > 0) ? `⚡ Yes (${z.existing_station_count} Bays Operational)` : '🟢 None (Greenfield)'}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Predicted Demand</span><span style="font-weight:600;color:var(--color-ink);">${formatDemand(z.predicted_demand_kwh_h)}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Infrastructure Gap</span><span style="font-weight:700;color:var(--color-negative);">${z.infrastructure_gap_score ? `${z.infrastructure_gap_score}/10` : "High Deficit"}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Predicted CapEx</span><span style="font-weight:600;">${z.predicted_cost_usd ? `$${Math.round(z.predicted_cost_usd / 1000)}k USD` : "$120k"}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Est. Payback</span><span style="font-weight:700;color:var(--color-positive);">${z.predicted_roi_years ? `~${z.predicted_roi_years} Years` : "~2.0 Years"}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Demand Confidence</span><span style="font-weight:600;color:var(--color-positive);">Top Tier (High Margin)</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Distance from Center</span><span>${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}</span></div>
                </div>
                <button
                  onclick="window.__open3DTwin && window.__open3DTwin('${z.label}', '${(z.name_primary || `Site ${z.label}`).replace(/'/g, "\\'")}', ${z.latitude}, ${z.longitude}, ${z.predicted_demand_kwh_h}, ${z.infrastructure_gap_score || 8.4}, ${z.qubo_c_value})"
                  style="width:100%;margin-top:12px;padding:10px;border-radius:8px;border:none;background:var(--color-navy-900);color:white;font-family:'Times New Roman',serif;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;box-shadow:0 2px 8px rgba(10,22,40,0.2);"
                >
                  <span>View 3D Station & Investment Pro-Forma →</span>
                </button>
              </div>`));
            layersRef.current.push(m);

            if (isNew && idx === 0) {
              setTimeout(() => m.openPopup(), 600);
            }
          });

          if (isNew && selZones.length > 0) {
            const pts: [number, number][] = [
              ...selZones.map((z) => [z.latitude, z.longitude] as [number, number]),
              userLatLngRef.current,
            ];
            map.flyToBounds(L.latLngBounds(pts).pad(0.25), {
              duration: 0.9, easeLinearity: 0.22,
            });
          }
        });
      },
      [clearLayers, showCoverage, showHeatmap, showFleetFlow, showEnergyTransition, transitionYear]
    );

    // Re-render when toggling layers
    useEffect(() => {
      if (lastResultsRef.current && mapRef.current) {
        renderOverlayLayers(lastResultsRef.current.zones, lastResultsRef.current.selected, false);
      }
    }, [showCoverage, showHeatmap, showFleetFlow, showEnergyTransition, transitionYear, renderOverlayLayers]);

    // Render nearby live/baseline stations on the map
    const renderLiveStationLayers = useCallback(() => {
      import("leaflet").then(({ default: L }) => {
        const map = mapRef.current;
        if (!map) return;
        clearLiveStationLayers();

        const effectiveShowLiveStations = showLiveStationsOverride ?? showLiveStations;
        if (!effectiveShowLiveStations || !liveStations || liveStations.length === 0) return;

        liveStations.forEach((s) => {
          const isOcm = s.source === "open_charge_map";
          const isSelected = selectedStationId === s.station_id;
          const markerColor = isSelected ? "#e11d48" : (isOcm ? "#059669" : "#2563eb");
          const size = isSelected ? 20 : 14;
          const innerSize = isSelected ? 6 : 4;
          const offset = size / 2;

          const icon = L.divIcon({
            className: "",
            html: `<div style="
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              background: ${markerColor};
              border: 2px solid white;
              box-shadow: 0 1px 5px rgba(0,0,0,0.28);
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              transform: translate(-${offset}px, -${offset}px);
              ${isSelected ? 'box-shadow: 0 0 0 4px rgba(225,29,72,0.3);' : ''}
            ">
              <div style="width: ${innerSize}px; height: ${innerSize}px; border-radius: 50%; background: white;"></div>
            </div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          });

          const m = L.marker([s.latitude, s.longitude], { icon, zIndexOffset: 350 }).addTo(map);
          m.bindPopup(
            L.popup({ closeButton: true, maxWidth: 280, offset: [0, -6] }).setContent(`
              <div style="font-family:Times New Roman,serif;padding:14px 16px;min-width:220px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <span style="font-size:10px;letter-spacing:0.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:${isOcm ? 'rgba(5,150,105,0.1)' : 'rgba(37,99,235,0.1)'};color:${markerColor};font-weight:700;">
                    ${isOcm ? '⚡ Live Station (OCM)' : '⚡ Baseline Station'}
                  </span>
                  <span style="font-size:11px;color:${s.is_operational ? '#059669' : '#dc2626'};font-weight:600;">
                    ${s.status}
                  </span>
                </div>
                <div style="font-size:15px;font-weight:700;color:var(--color-ink);letter-spacing:-0.01em;margin-bottom:4px;line-height:1.3;">
                  ${s.name}
                </div>
                ${s.address ? `<div style="font-size:11px;color:var(--color-ink-3);margin-bottom:8px;">${s.address}</div>` : ''}
                <div style="display:flex;flex-direction:column;gap:4px;border-top:1px solid var(--color-border);padding-top:8px;font-size:11.5px;">
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Operator</span><span style="font-weight:600;">${s.operator || 'Independent'}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Capacity / Power</span><span style="font-weight:600;">${s.power_kw ? `${s.power_kw} kW` : 'Standard AC/DC'}</span></div>
                  <div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Charging Bays</span><span style="font-weight:600;">${s.bays} bays</span></div>
                  ${s.connector_types && s.connector_types.length > 0 ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Plugs</span><span>${s.connector_types.slice(0, 2).join(', ')}</span></div>` : ''}
                  ${s.usage_cost ? `<div style="display:flex;justify-content:space-between;"><span style="color:var(--color-ink-4);">Tariff</span><span>${s.usage_cost}</span></div>` : ''}
                  <div style="display:flex;justify-content:space-between;margin-top:2px;padding-top:4px;border-top:1px dashed var(--color-border-subtle);"><span style="color:var(--color-ink-4);">Source</span><span style="color:var(--color-ink-3);font-size:10.5px;">${isOcm ? 'Open Charge Map API' : 'Kaggle Global EV Dataset'}</span></div>
                </div>
              </div>
            `)
          );
          m.on("click", () => {
            if (onStationClick) {
              onStationClick(s);
            }
          });
          liveStationLayersRef.current.push(m);
        });
      });
    }, [clearLiveStationLayers, liveStations, showLiveStations, showLiveStationsOverride, onStationClick, selectedStationId]);

    // Re-render live stations when toggled or when liveStations data updates
    useEffect(() => {
      renderLiveStationLayers();
    }, [renderLiveStationLayers]);

    useImperativeHandle(ref, () => ({

      setUserLocation(lat: number, lng: number) {
        if (!mapRef.current) return;
        clearLayers();
        lastResultsRef.current = null;
        setHasResults(false);
        import("leaflet").then(({ default: L }) => {
          const map = mapRef.current;
          if (!map) return;
          userLatLngRef.current = [lat, lng];
          if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
          const icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:48px;height:48px;transform:translate(-24px,-24px);">
              <div style="position:absolute;inset:0;border-radius:50%;background:rgba(10,22,40,0.12);animation:pulse-1 2s ease-out infinite;"></div>
              <div style="position:absolute;inset:0;border-radius:50%;background:rgba(10,22,40,0.07);animation:pulse-2 2s ease-out 0.6s infinite;"></div>
              <div style="position:absolute;inset:0;border-radius:50%;background:rgba(10,22,40,0.04);animation:pulse-3 2s ease-out 1.2s infinite;"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px;border-radius:50%;background:var(--color-navy-900);border:3px solid white;box-shadow:0 4px 16px rgba(10,22,40,0.35);animation:drop-in 0.5s cubic-bezier(0.22,1,0.36,1) both;"></div>
            </div>`,
            iconSize: [0, 0], iconAnchor: [0, 0],
          });
          userMarkerRef.current = L.marker([lat, lng], { icon, zIndexOffset: 2000 }).addTo(map);
          map.flyTo([lat, lng], 12.5, { duration: 1.0, easeLinearity: 0.25 });
        });
      },

      async runOptimizationSequence(zones: ZoneDetail[]) {
        const L = (await import("leaflet")).default;
        const map = mapRef.current;
        if (!map) return;

        clearLayers();
        const maxDemand = Math.max(...zones.map((z) => z.predicted_demand_kwh_h), 1);
        const [uLat, uLng] = userLatLngRef.current;

        // ── Step 0: Fit map to show candidate zones ──────────────────────
        const bounds = L.latLngBounds(zones.map((z) => [z.latitude, z.longitude] as [number, number])).pad(0.22);
        map.flyToBounds(bounds, { duration: 0.7, easeLinearity: 0.25 });
        await delay(350);

        // ── Step 1: Demand heatmap — zones pulse in with fill intensity ───
        onSequenceStep?.(0);
        const heatLayers: L.Path[] = [];
        for (let i = 0; i < zones.length; i++) {
          const z = zones[i];
          const ratio = z.predicted_demand_kwh_h / maxDemand;
          const r = 700 + ratio * 1400; // radius proportional to demand
          const circle = L.circle([z.latitude, z.longitude], {
            radius: r,
            color: demandBorder(z.predicted_demand_kwh_h, maxDemand),
            fillColor: demandColor(z.predicted_demand_kwh_h, maxDemand),
            fillOpacity: 0.82,
            weight: 1.5,
          }).addTo(map);
          heatLayers.push(circle);
          layersRef.current.push(circle);

          // Demand label
          const label = L.divIcon({
            className: "",
            html: `<div style="
              background:rgba(255,255,255,0.92);
              border:1px solid rgba(10,22,40,0.12);
              border-radius:8px;
              padding:3px 8px;
              font-family:'Times New Roman',serif;
              font-size:11px;
              color:var(--color-ink-2);
              white-space:nowrap;
              box-shadow:0 2px 8px rgba(10,22,40,0.08);
              transform:translate(-50%,-50%);
            ">
              <span style="font-weight:600;color:var(--color-navy-700)">${z.name_primary || `Site ${z.label}`}</span>
              <span style="margin-left:4px;color:var(--color-ink-3)">${formatDemand(z.predicted_demand_kwh_h)}</span>
            </div>`,
            iconSize: [0, 0], iconAnchor: [0, 0],
          });
          const lm = L.marker([z.latitude, z.longitude], { icon: label, zIndexOffset: 500 }).addTo(map);
          layersRef.current.push(lm);
        }
        await delay(400);

        // ── Step 2: Coverage gap scan — smooth radial sweeps ──────────────
        onSequenceStep?.(1);
        const sweep1 = L.circle([uLat, uLng], {
          radius: 2500,
          color: "rgba(10,22,40,0.15)",
          fillColor: "rgba(10,22,40,0.03)",
          fillOpacity: 1,
          weight: 1.5,
          dashArray: "3 5",
        }).addTo(map);
        const sweep2 = L.circle([uLat, uLng], {
          radius: 5000,
          color: "rgba(10,22,40,0.10)",
          fillColor: "rgba(10,22,40,0.015)",
          fillOpacity: 1,
          weight: 1.5,
          dashArray: "3 5",
        }).addTo(map);
        layersRef.current.push(sweep1, sweep2);
        await delay(350);

        // ── Step 3: Candidate evaluation & QAOA quantum superposition ─────
        onSequenceStep?.(2);
        const pulseMarkers: L.Path[] = [];
        for (const z of zones) {
          const ring = L.circleMarker([z.latitude, z.longitude], {
            radius: 8,
            color: "rgba(64,114,184,0.9)",
            fillColor: "rgba(64,114,184,0.45)",
            fillOpacity: 0.8,
            weight: 2,
          }).addTo(map);
          pulseMarkers.push(ring);
          layersRef.current.push(ring);
        }
        await delay(350);

        // ── Step 4: QAOA solver convergence ──────────────────────────────
        onSequenceStep?.(3);
        pulseMarkers.forEach((r) => {
          try { r.setStyle({ color: "rgba(10,22,40,0.2)", fillOpacity: 0.1 }); } catch {}
        });
        await delay(300);

        // ── Step 5: Clear intermediate layers, fade heatmap ───────────────
        onSequenceStep?.(4);
        heatLayers.forEach((c) => {
          try {
            c.setStyle({ fillOpacity: 0.15, weight: 0.5, opacity: 0.25 });
          } catch {}
        });
        await delay(150);
      },

      showResults(zones: ZoneDetail[], selected: string[]) {
        lastResultsRef.current = { zones, selected };
        setHasResults(true);
        renderOverlayLayers(zones, selected, true);
      },

      showScenario(zones: ZoneDetail[], selected: string[], k: number) {
        lastResultsRef.current = { zones, selected };
        setHasResults(true);
        renderOverlayLayers(zones, selected, false);
      },

      resetToIdle() {
        if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
        clearLayers();
        lastResultsRef.current = null;
        setHasResults(false);
        userLatLngRef.current = [19.0467, 72.8911];
        if (mapRef.current) {
          mapRef.current.flyTo([19.0467, 72.8911], 12, { duration: 1.0, easeLinearity: 0.25 });
        }
      },
    }));

    return (
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <div
          ref={containerRef}
          style={{
            position: "absolute",
            inset: 0,
            background: "#e8edf4",
          }}
        />



        {/* GIS Map Layer & Station Digital Twin Controls */}
        {!hideInternalLayerControls && (
          <div
            className="anim-fade-in glass"
            style={{
              position: "absolute",
              top: "70px",
              right: "20px",
              zIndex: 35,
              borderRadius: "12px",
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 4px 20px rgba(10,22,40,0.12)",
              border: "1px solid rgba(255,255,255,0.8)",
            }}
          >
            {/* Direct 3D Digital Twin Pro-Forma quick launch button */}
            <button
              onClick={() => {
                const [uLat, uLng] = userLatLngRef.current;
                onOpen3DTwin?.({
                  label: "Candidate Area",
                  name: `Selected Deployment Zone (${uLat.toFixed(3)}°, ${uLng.toFixed(3)}°)`,
                  lat: uLat,
                  lng: uLng,
                  demandKwh: 480,
                  gapScore: 8.4,
                  quboScore: 0.892,
                });
              }}
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                border: "1px solid var(--color-navy-200)",
                background: "var(--color-navy-50)",
                color: "var(--color-navy-900)",
                fontFamily: "Times New Roman, serif",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
              title="View 3D Station Model & Financial Pro-Forma"
            >
              <Building2 size={13} />
              <span>3D Station</span>
            </button>

            {(hasResults || (liveStations && liveStations.length > 0)) && (
              <>
                <div style={{ width: "1px", height: "14px", background: "var(--color-border-subtle)", margin: "0 2px" }} />
                <span style={{ fontFamily: "Times New Roman, serif", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-ink-4)", marginRight: "2px" }}>
                  Layers:
                </span>
              </>
            )}
            {hasResults && (
              <>
                <button
                  onClick={() => setShowCoverage((prev: boolean) => !prev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: showCoverage ? "var(--color-navy-900)" : "var(--color-grey-100)",
                    color: showCoverage ? "white" : "var(--color-ink-3)",
                    fontFamily: "Times New Roman, serif",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Toggle 3km adjacency coverage reach"
                >
                  {showCoverage ? "✓ " : ""}3km Reach
                </button>
                <button
                  onClick={() => setShowHeatmap((prev: boolean) => !prev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: showHeatmap ? "var(--color-navy-900)" : "var(--color-grey-100)",
                    color: showHeatmap ? "white" : "var(--color-ink-3)",
                    fontFamily: "Times New Roman, serif",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Toggle predicted EV demand intensity heat circles"
                >
                  {showHeatmap ? "✓ " : ""}Demand Heatmap
                </button>
                <button
                  onClick={() => setShowFleetFlow((prev: boolean) => !prev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: showFleetFlow ? "var(--color-navy-900)" : "var(--color-grey-100)",
                    color: showFleetFlow ? "white" : "var(--color-ink-3)",
                    fontFamily: "Times New Roman, serif",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Toggle commercial fleet dispatch vectors to nearest charging hubs"
                >
                  {showFleetFlow ? "✓ " : ""}Fleet Dispatch
                </button>
                <button
                  onClick={() => setShowEnergyTransition((prev: boolean) => !prev)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    background: showEnergyTransition ? "var(--color-navy-900)" : "var(--color-grey-100)",
                    color: showEnergyTransition ? "white" : "var(--color-ink-3)",
                    fontFamily: "Times New Roman, serif",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  title="Toggle dynamic grid equilibrium simulation & carbon offset"
                >
                  {showEnergyTransition ? "✓ " : ""}Grid Equilibrium
                </button>
              </>
            )}
            {liveStations && liveStations.length > 0 && (
              <button
                onClick={() => setShowLiveStations((prev: boolean) => !prev)}
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: showLiveStations ? "var(--color-navy-900)" : "var(--color-grey-100)",
                  color: showLiveStations ? "white" : "var(--color-ink-3)",
                  fontFamily: "Times New Roman, serif",
                  fontSize: "12px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Toggle nearby live/baseline charging station pins on the map"
              >
                {showLiveStations ? "✓ " : ""}Stations ({liveStations.length})
              </button>
            )}
          </div>
        )}

        {/* Floating City Transition Simulation HUD (Pillar 2) */}
        {hasResults && showEnergyTransition && (
          <div
            className="anim-fade-up"
            style={{
              position: "absolute",
              top: "14px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid #e2e8f0",
              borderRadius: "10px",
              padding: "6px 14px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              boxShadow: "0 4px 20px rgba(10,22,40,0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  fontFamily: "Times New Roman, serif",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
              >
                Horizon:
              </span>
              <div style={{ display: "flex", gap: "3px" }}>
                {([2026, 2028, 2030, 2032] as const).map((yr) => {
                  const isSel = transitionYear === yr;
                  const adoptionPct = yr === 2026 ? "8%" : yr === 2028 ? "18%" : yr === 2030 ? "34%" : "52%";
                  return (
                    <button
                      key={yr}
                      onClick={() => setTransitionYear(yr)}
                      style={{
                        padding: "3px 7px",
                        borderRadius: "5px",
                        border: isSel ? "1px solid #0f172a" : "1px solid #e2e8f0",
                        background: isSel ? "#0f172a" : "#f8fafc",
                        color: isSel ? "#ffffff" : "#475569",
                        fontSize: "10.5px",
                        fontWeight: isSel ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      title={`${yr} EV Adoption: ${adoptionPct}`}
                    >
                      {yr} ({adoptionPct})
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ width: "1px", height: "16px", background: "#e2e8f0" }} />

            <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: "#64748b" }}>Grid Stability:</span>
                <span style={{ fontWeight: 700, color: "#059669" }}>
                  {transitionYear === 2026 ? "99.4%" : transitionYear === 2028 ? "98.7%" : transitionYear === 2030 ? "97.9%" : "99.2% (V2G Active)"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: "#64748b" }}>CO₂ Averted:</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                  {transitionYear === 2026 ? "3.4k" : transitionYear === 2028 ? "8.9k" : transitionYear === 2030 ? "19.5k" : "42.0k"} t/yr
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

ChargingMap.displayName = "ChargingMap";
export default ChargingMap;
