"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Camera, RotateCw, Eye, Sun, Moon, Sparkles, Maximize2, Zap, RefreshCw } from "lucide-react";

export interface ThreeChargerHub3DProps {
  lighting: "day" | "dusk" | "night";
  baysCount?: number;
  powerKw?: number;
  tariffRate?: number;
  hasSolarCanopy?: boolean;
  batterySoc?: number; // 0 to 100
  chargingSessionNumber?: number;
  isSimulating?: boolean;
  mode?: "charge" | "v2g";
  onModeChange?: (mode: "charge" | "v2g") => void;
}

export function ThreeChargerHub3D({
  lighting = "day",
  powerKw = 150,
  tariffRate = 0.36,
  batterySoc = 78,
  chargingSessionNumber = 42,
  mode,
  onModeChange,
}: ThreeChargerHub3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isTurntableActive, setIsTurntableActive] = useState(false);
  const isTurntableRef = useRef(isTurntableActive);
  useEffect(() => {
    isTurntableRef.current = isTurntableActive;
  }, [isTurntableActive]);

  const [internalMode, setInternalMode] = useState<"charge" | "v2g">(mode || "charge");
  const isV2G = mode !== undefined ? mode === "v2g" : internalMode === "v2g";
  const isV2GRef = useRef(isV2G);
  useEffect(() => {
    isV2GRef.current = isV2G;
  }, [isV2G]);

  // Scene references for live updates
  const lightsRef = useRef<{
    ambient: THREE.AmbientLight;
    sun: THREE.DirectionalLight;
    fillLight: THREE.DirectionalLight;
    canopySpot1: THREE.SpotLight;
    canopySpot2: THREE.SpotLight;
    canopySpot3: THREE.SpotLight;
    canopySpot4: THREE.SpotLight;
  } | null>(null);

  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const energyParticlesRef = useRef<THREE.Group | null>(null);
  const cableCurveRef = useRef<THREE.CatmullRomCurve3 | null>(null);
  const greenCeilingMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  // ── Render crisp digital touchscreen UI on dispenser ────────────────────
  const updateScreenCanvas = (
    ctx: CanvasRenderingContext2D,
    kw: number,
    soc: number,
    tariff: number,
    session: number,
    v2gActive: boolean = false
  ) => {
    ctx.fillStyle = "#0a101d";
    ctx.fillRect(0, 0, 512, 1024);

    // Header Bar
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    if (v2gActive) {
      grad.addColorStop(0, "#0284c7");
      grad.addColorStop(1, "#0ea5e9");
    } else {
      grad.addColorStop(0, "#10b981");
      grad.addColorStop(1, "#059669");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 80);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(v2gActive ? "EV VERSE · V2G BIDIRECTIONAL" : "EV VERSE · FAST CHARGER", 256, 50);

    // Live Status Badge
    ctx.fillStyle = v2gActive ? "rgba(14, 165, 233, 0.22)" : "rgba(16, 185, 129, 0.16)";
    ctx.beginPath();
    ctx.roundRect(106, 115, 300, 44, 22);
    ctx.fill();
    ctx.fillStyle = v2gActive ? "#38bdf8" : "#34d399";
    ctx.font = "bold 20px -apple-system, sans-serif";
    ctx.fillText(v2gActive ? "● EXPORTING TO GRID" : "● CHARGING ACTIVE", 256, 144);

    // Power Delivery / Export Readout
    ctx.fillStyle = v2gActive ? "#38bdf8" : "#10b981";
    ctx.font = "bold 96px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(v2gActive ? "50" : `${kw}`, 256, 260);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 24px -apple-system, sans-serif";
    ctx.fillText(v2gActive ? "GRID EXPORT (kW)" : "CHARGING POWER (kW)", 256, 305);

    // Divider
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, 340);
    ctx.lineTo(472, 340);
    ctx.stroke();

    // Battery SoC %
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 88px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(`${soc}%`, 256, 455);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 24px -apple-system, sans-serif";
    ctx.fillText(v2gActive ? "PACK STATE OF CHARGE" : "BATTERY LEVEL", 256, 500);

    // Battery Progress Bar
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.roundRect(60, 530, 392, 40, 12);
    ctx.fill();

    const barGrad = ctx.createLinearGradient(60, 0, 452, 0);
    if (v2gActive) {
      barGrad.addColorStop(0, "#0284c7");
      barGrad.addColorStop(1, "#38bdf8");
    } else {
      barGrad.addColorStop(0, "#059669");
      barGrad.addColorStop(1, "#34d399");
    }
    ctx.fillStyle = barGrad;
    const filledW = Math.max(24, (392 * soc) / 100);
    ctx.beginPath();
    ctx.roundRect(60, 530, filledW, 40, 12);
    ctx.fill();

    // Clean 2-Box Summary Grid
    const drawCleanBox = (x: number, y: number, w: number, h: number, title: string, val: string) => {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 14);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 20px -apple-system, sans-serif";
      ctx.fillText(title, x + w / 2, y + 42);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "bold 32px -apple-system, sans-serif";
      ctx.fillText(val, x + w / 2, y + 88);
    };

    if (v2gActive) {
      drawCleanBox(60, 615, 185, 120, "SPOT RATE", "$0.48/kWh");
      drawCleanBox(267, 615, 185, 120, "EARNED", `+$${(session * 0.8 + 14.2).toFixed(1)}`);
    } else {
      drawCleanBox(60, 615, 185, 120, "RATE", `$${tariff.toFixed(2)}/kWh`);
      drawCleanBox(267, 615, 185, 120, "DELIVERED", `${((kw * 0.42) + 14).toFixed(1)} kWh`);
    }

    // Clean Footer
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 890, 512, 134);

    ctx.fillStyle = v2gActive ? "#38bdf8" : "#10b981";
    ctx.font = "bold 24px -apple-system, sans-serif";
    ctx.fillText(v2gActive ? "● SUBSTATION BALANCING ACTIVE" : "● HIGH POWER DC NETWORK", 256, 945);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "20px -apple-system, sans-serif";
    ctx.fillText(v2gActive ? "Reverse Energy Export · ISO 15118-20" : `Active Vehicle Connected · Session #${session}`, 256, 985);
  };

  // ── Procedural Photorealistic Studio HDRI Environment Map ─────────────────
  const createStudioEnvironment = (renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget => {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;

    // Clean Studio Background Horizon Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    skyGrad.addColorStop(0, "#f8fafc");
    skyGrad.addColorStop(0.3, "#f1f5f9");
    skyGrad.addColorStop(0.55, "#e2e8f0");
    skyGrad.addColorStop(0.8, "#cbd5e1");
    skyGrad.addColorStop(1, "#94a3b8");
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    // Studio Overhead Softbox Lights for Crisp Automotive Paint Highlights
    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.fillRect(200, 30, 260, 140);
    ctx.fillRect(680, 40, 220, 120);
    ctx.fillRect(480, 15, 120, 80);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;

    const envMap = pmremGenerator.fromEquirectangular(texture);
    pmremGenerator.dispose();
    return envMap;
  };

  // ── Main Scene Construction ───────────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 560;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xf4f6f8);

    // 2. Camera: Framing exactly matching reference image (3/4 rear-quarter hero shot)
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100);
    // Reference image view: positioned in front-right of the chargers and car
    camera.position.set(4.6, 2.7, 7.8);
    cameraRef.current = camera;

    // 3. Renderer with ACES Filmic tonemapping & soft shadows
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Environment
    const envRenderTarget = createStudioEnvironment(renderer);
    scene.environment = envRenderTarget.texture;

    // 5. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0.1, 1.25, 0.2);
    controls.minDistance = 3.0;
    controls.maxDistance = 18.0;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controlsRef.current = controls;

    // 6. Lighting (Studio 3-Point + Canopy Downward Spotlights)
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(9.0, 14.0, 8.0);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -7;
    sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7;
    sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0002;
    scene.add(sun);

    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 0.85);
    fillLight.position.set(-8.0, 7.0, -6.0);
    scene.add(fillLight);

    // 4 Canopy Downward Recessed Softbox Spotlights
    const createCanopySpot = (x: number, z: number) => {
      const spot = new THREE.SpotLight(0xffffff, 2.4, 8, Math.PI / 3.8, 0.45, 1.2);
      spot.position.set(x, 3.6, z);
      spot.target.position.set(x, 0, z);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;
      scene.add(spot);
      scene.add(spot.target);
      return spot;
    };

    const canopySpot1 = createCanopySpot(-2.2, 0);
    const canopySpot2 = createCanopySpot(-0.7, 0);
    const canopySpot3 = createCanopySpot(0.8, 0);
    const canopySpot4 = createCanopySpot(2.3, 0);

    lightsRef.current = {
      ambient,
      sun,
      fillLight,
      canopySpot1,
      canopySpot2,
      canopySpot3,
      canopySpot4,
    };

    // ── HYPERREALISTIC MATERIALS ───────────────────────────────────────────
    // Multi-coat Pure White Automotive Paint with Gloss Clearcoat
    const carPaintMat = new THREE.MeshPhysicalMaterial({
      color: 0xfdfdfd,
      roughness: 0.1,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      reflectivity: 0.95,
    });

    // Dark Tinted Automotive Glass with Specular Fresnel Reflection
    const carGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x050912,
      roughness: 0.04,
      metalness: 0.85,
      transmission: 0.76,
      transparent: true,
      opacity: 0.86,
      ior: 1.54,
    });

    // Chrome / Polished Aluminum
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.06,
    });

    // Satin Black Trim / Rubber
    const blackTrimMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.75,
      metalness: 0.1,
    });

    // Vibrant EV Apple Green Soffit Ceiling (Exact match to reference)
    const greenCeilingMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.42,
      roughness: 0.35,
      metalness: 0.08,
    });
    greenCeilingMatRef.current = greenCeilingMat;

    // Glowing Ceiling Luminaire Softbox Panels
    const softboxGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.8,
      roughness: 0.08,
    });

    // Architecture Concrete Plinth
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x272b34,
      roughness: 0.6,
      metalness: 0.12,
    });

    // Ground Studio Floor
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xebedf1,
      roughness: 0.85,
      metalness: 0.03,
    });

    // ── 7. STUDIO PLATFORM & GROUND ─────────────────────────────────────────
    // Studio Floor
    const groundFloor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), floorMat);
    groundFloor.rotation.x = -Math.PI / 2;
    groundFloor.receiveShadow = true;
    scene.add(groundFloor);

    // Beveled Charcoal Display Plinth (Extruded shape with rounded corners)
    const plinthShape = new THREE.Shape();
    const pw = 8.6;
    const pd = 4.4;
    const pr = 0.55;
    plinthShape.moveTo(-pw / 2 + pr, -pd / 2);
    plinthShape.lineTo(pw / 2 - pr, -pd / 2);
    plinthShape.absarc(pw / 2 - pr, -pd / 2 + pr, pr, -Math.PI / 2, 0, false);
    plinthShape.lineTo(pw / 2, pd / 2 - pr);
    plinthShape.absarc(pw / 2 - pr, pd / 2 - pr, pr, 0, Math.PI / 2, false);
    plinthShape.lineTo(-pw / 2 + pr, pd / 2);
    plinthShape.absarc(-pw / 2 + pr, pd / 2 - pr, pr, Math.PI / 2, Math.PI, false);
    plinthShape.lineTo(-pw / 2, -pd / 2 + pr);
    plinthShape.absarc(-pw / 2 + pr, -pd / 2 + pr, pr, Math.PI, Math.PI * 1.5, false);

    const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    plinthGeo.rotateX(-Math.PI / 2);
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.position.set(0, 0.01, 0);
    plinthMesh.receiveShadow = true;
    plinthMesh.castShadow = true;
    scene.add(plinthMesh);

    // Radial Ambient Occlusion Ground Contact Shadow beneath Plinth
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 512;
    shadowCanvas.height = 512;
    const sCtx = shadowCanvas.getContext("2d")!;
    const sGrad = sCtx.createRadialGradient(256, 256, 60, 256, 256, 250);
    sGrad.addColorStop(0, "rgba(0, 0, 0, 0.7)");
    sGrad.addColorStop(0.6, "rgba(0, 0, 0, 0.2)");
    sGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 512, 512);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.015, 0);
    scene.add(contactShadow);

    // ── 8. CANOPY ROOF ARCHITECTURE (IDENTICAL TO REFERENCE) ────────────────
    const canopyGroup = new THREE.Group();

    // White Top Fascia / Roof Shell
    const roofSlabGeo = new THREE.BoxGeometry(8.2, 0.36, 4.2);
    const roofSlab = new THREE.Mesh(roofSlabGeo, carPaintMat);
    roofSlab.position.set(0, 3.82, 0);
    roofSlab.castShadow = true;
    roofSlab.receiveShadow = true;
    canopyGroup.add(roofSlab);

    // Dark Perimeter Bevel Trim on Roof Top
    const roofTrim = new THREE.Mesh(
      new THREE.BoxGeometry(8.26, 0.05, 4.26),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.3 })
    );
    roofTrim.position.set(0, 4.01, 0);
    canopyGroup.add(roofTrim);

    // Solar PV Matrix on Canopy Top
    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.22,
      metalness: 0.85,
    });
    const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.03, 3.8), solarMat);
    solarPanel.position.set(0, 4.04, 0);
    canopyGroup.add(solarPanel);

    // Apple-Green Radiant Underside Soffit Ceiling
    const greenSoffit = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.06, 4.0), greenCeilingMat);
    greenSoffit.position.set(0, 3.62, 0);
    canopyGroup.add(greenSoffit);

    // 4 Flush Recessed Luminous Softbox Luminaires in the Ceiling
    const softboxXCoords = [-2.2, -0.7, 0.8, 2.3];
    softboxXCoords.forEach((sx) => {
      // Softbox glowing panel
      const lumGeo = new THREE.BoxGeometry(1.05, 0.02, 2.6);
      const lumMesh = new THREE.Mesh(lumGeo, softboxGlowMat);
      lumMesh.position.set(sx, 3.6, 0);
      canopyGroup.add(lumMesh);

      // White frame border
      const borderGeo = new THREE.BoxGeometry(1.11, 0.025, 2.66);
      const borderMesh = new THREE.Mesh(
        borderGeo,
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
      );
      borderMesh.position.set(sx, 3.605, 0);
      canopyGroup.add(borderMesh);
    });

    // Rear Slender Architectural Support Pillar (Back Left in reference image)
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.2,
      metalness: 0.2,
    });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.45, 0.28), pillarMat);
    pillar.position.set(-1.8, 2.05, -1.82);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    canopyGroup.add(pillar);

    scene.add(canopyGroup);

    // ── 9. DUAL ARCH PORTAL DISPENSERS (EXACT MATCH TO REFERENCE) ───────────
    const dispenserGroup = new THREE.Group();

    // Dispenser Live Digital Touchscreen Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 1024;
    screenCanvasRef.current = canvas;
    const sContext = canvas.getContext("2d")!;
    updateScreenCanvas(sContext, powerKw, batterySoc, tariffRate, chargingSessionNumber, isV2G);

    const screenTex = new THREE.CanvasTexture(canvas);
    screenTextureRef.current = screenTex;
    const screenMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissive: 0xffffff,
      emissiveMap: screenTex,
      emissiveIntensity: 1.0,
      roughness: 0.12,
    });

    // Helper to build the distinct Arch Portal Dispenser from the reference image
    const createArchDispenser = (posX: number, posZ: number, isActive: boolean) => {
      const unit = new THREE.Group();
      unit.position.set(posX, 0.27, posZ);

      // White body material
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.18,
        metalness: 0.08,
      });

      // Arch Portal: Extruded 2D shape with hollow rectangular center hole
      const archShape = new THREE.Shape();
      const aw = 0.95;
      const ah = 2.45;
      const ar = 0.12;

      // Outer boundary with rounded top corners
      archShape.moveTo(-aw / 2, 0);
      archShape.lineTo(aw / 2, 0);
      archShape.lineTo(aw / 2, ah - ar);
      archShape.absarc(aw / 2 - ar, ah - ar, ar, 0, Math.PI / 2, false);
      archShape.lineTo(-aw / 2 + ar, ah);
      archShape.absarc(-aw / 2 + ar, ah - ar, ar, Math.PI / 2, Math.PI, false);
      archShape.lineTo(-aw / 2, 0);

      // Inner hollow cutout window
      const holePath = new THREE.Path();
      const hw = 0.52;
      const hh = 1.62;
      const hy = 0.32;
      holePath.moveTo(-hw / 2, hy);
      holePath.lineTo(hw / 2, hy);
      holePath.lineTo(hw / 2, hy + hh);
      holePath.lineTo(-hw / 2, hy + hh);
      holePath.lineTo(-hw / 2, hy);
      archShape.holes.push(holePath);

      const archGeo = new THREE.ExtrudeGeometry(archShape, {
        depth: 0.44,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.03,
        bevelThickness: 0.03,
      });
      // Center the depth
      archGeo.translate(0, 0, -0.22);

      const archMesh = new THREE.Mesh(archGeo, bodyMat);
      archMesh.castShadow = true;
      archMesh.receiveShadow = true;
      unit.add(archMesh);

      // Top Fascia Green Brand Accent (Matching reference)
      const topAccentGeo = new THREE.BoxGeometry(0.96, 0.16, 0.46);
      const topAccent = new THREE.Mesh(topAccentGeo, greenCeilingMat);
      topAccent.position.set(0, 2.36, 0);
      unit.add(topAccent);

      // Center Inset Interactive Screen Column inside the arch
      const screenHousing = new THREE.Mesh(
        new THREE.BoxGeometry(0.51, 1.25, 0.38),
        new THREE.MeshStandardMaterial({ color: 0x090e17, roughness: 0.4 })
      );
      screenHousing.position.set(0, 1.15, 0);
      unit.add(screenHousing);

      // Touchscreen Glass Front
      const displayPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.46, 0.98),
        isActive ? screenMat : new THREE.MeshStandardMaterial({ color: 0x090e17, roughness: 0.2 })
      );
      displayPlane.position.set(0, 1.18, 0.195);
      unit.add(displayPlane);

      // Side Charging Holster Dock on Right Side
      const holster = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.32, 0.18),
        blackTrimMat
      );
      holster.position.set(aw / 2 + 0.04, 1.18, 0);
      unit.add(holster);

      return unit;
    };

    // Dispenser 1 (Left unit in front of car rear) and Dispenser 2 (Right unit)
    const disp1 = createArchDispenser(0.9, 0.95, true);
    const disp2 = createArchDispenser(2.6, 0.95, false);
    dispenserGroup.add(disp1);
    dispenserGroup.add(disp2);
    scene.add(dispenserGroup);

    // ── 10. HEAVY LIQUID-COOLED CHARGING CABLES ─────────────────────────────
    // Active cable connected to car charge port (CatmullRom Curve with natural gravity sag)
    const activeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.38, 1.45, 0.95),  // Dispenser 1 holster
      new THREE.Vector3(1.42, 0.72, 1.25),  // Sagging loop
      new THREE.Vector3(0.75, 0.32, 1.35),  // Ground level drape
      new THREE.Vector3(-0.15, 0.45, 1.15), // Ascending to car
      new THREE.Vector3(-0.48, 0.86, 0.88), // Connected into rear charge port!
    ]);
    cableCurveRef.current = activeCurve;

    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x121418,
      roughness: 0.6,
      metalness: 0.15,
    });

    const activeCableGeo = new THREE.TubeGeometry(activeCurve, 48, 0.03, 10, false);
    const activeCable = new THREE.Mesh(activeCableGeo, cableMat);
    activeCable.castShadow = true;
    scene.add(activeCable);

    // Handle Connector Plugged into Car
    const plugHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.18, 16), blackTrimMat);
    plugHandle.rotation.z = Math.PI / 3;
    plugHandle.position.set(-0.46, 0.85, 0.88);
    scene.add(plugHandle);

    // Dispenser 2: Neatly Docked Hanging Loop (Matching reference image)
    const dockedCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.08, 1.45, 0.95),
      new THREE.Vector3(3.14, 0.65, 1.15),
      new THREE.Vector3(3.05, 0.32, 1.05),
      new THREE.Vector3(2.85, 0.6, 0.9),
      new THREE.Vector3(3.02, 1.35, 0.95),
    ]);
    const dockedCable = new THREE.Mesh(
      new THREE.TubeGeometry(dockedCurve, 36, 0.028, 8, false),
      cableMat
    );
    dockedCable.castShadow = true;
    scene.add(dockedCable);

    // Pulsing Glowing Energy Electron Particles along Active Cable
    const particlesGroup = new THREE.Group();
    energyParticlesRef.current = particlesGroup;
    for (let p = 0; p < 6; p++) {
      const pSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.046, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0x34d399 })
      );
      particlesGroup.add(pSphere);
    }
    scene.add(particlesGroup);

    // ── 11. HYPERREALISTIC WHITE ELECTRIC FASTBACK LUXURY SEDAN ──────────────
    // (Sculpted to match the Tesla Model S / 3 silhouette in reference image)
    const carGroup = new THREE.Group();
    carGroup.position.set(-1.4, 0.27, 0.0);

    // 1. Lower Fuselage Chassis (Aerodynamic body with curved profile)
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(-2.2, 0.2);
    bodyShape.lineTo(1.8, 0.2);     // Rocker sill
    bodyShape.lineTo(2.2, 0.35);    // Front nosecone slope
    bodyShape.lineTo(2.15, 0.62);   // Front bumper fascia
    bodyShape.lineTo(1.2, 0.72);    // Front hood
    bodyShape.lineTo(-1.6, 0.76);   // Beltline
    bodyShape.lineTo(-2.2, 0.72);   // Rear trunk deck
    bodyShape.lineTo(-2.25, 0.38);  // Rear bumper
    bodyShape.lineTo(-2.2, 0.2);

    const bodyExtrude = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.84,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 2,
      bevelSize: 0.08,
      bevelThickness: 0.06,
    });
    bodyExtrude.translate(0, 0, -0.92);
    const carBody = new THREE.Mesh(bodyExtrude, carPaintMat);
    carBody.castShadow = true;
    carBody.receiveShadow = true;
    carGroup.add(carBody);

    // 2. Sculpted Front Aerodynamic Hood Wedge
    const hoodGeo = new THREE.BoxGeometry(1.25, 0.18, 1.76);
    const hood = new THREE.Mesh(hoodGeo, carPaintMat);
    hood.position.set(1.4, 0.66, 0);
    hood.rotation.z = -0.07;
    hood.castShadow = true;
    carGroup.add(hood);

    // 3. Front Lower Air Intake Splitter (Gloss Black)
    const frontSplitter = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 1.62),
      blackTrimMat
    );
    frontSplitter.position.set(2.22, 0.28, 0);
    carGroup.add(frontSplitter);

    // 4. Sleek Aerodynamic Greenhouse Glass Cockpit (Fastback rake)
    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.7, 0.72);  // Rear window base
    cabinShape.lineTo(-0.8, 1.34);  // Rear roofline arch
    cabinShape.lineTo(0.4, 1.35);   // Windshield header
    cabinShape.lineTo(1.2, 0.72);   // Windshield base / cowl
    cabinShape.lineTo(-1.7, 0.72);

    const cabinExtrude = new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.54,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.05,
      bevelThickness: 0.05,
    });
    cabinExtrude.translate(0, 0, -0.77);
    const carCabin = new THREE.Mesh(cabinExtrude, carGlassMat);
    carCabin.castShadow = true;
    carGroup.add(carCabin);

    // 5. White Roof Center Beam Spar
    const roofSpar = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.04, 1.48),
      carPaintMat
    );
    roofSpar.position.set(-0.2, 1.37, 0);
    carGroup.add(roofSpar);

    // 6. Gloss-Black Window Pillars (A, B, C pillars)
    const bPillarRight = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.55, 0.04),
      blackTrimMat
    );
    bPillarRight.position.set(-0.15, 1.05, 0.78);
    carGroup.add(bPillarRight);

    const bPillarLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.55, 0.04),
      blackTrimMat
    );
    bPillarLeft.position.set(-0.15, 1.05, -0.78);
    carGroup.add(bPillarLeft);

    // 7. Flush Aerodynamic Door Handles (Chrome)
    const createDoorHandle = (hx: number, hz: number) => {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.02), chromeMat);
      handle.position.set(hx, 0.7, hz);
      return handle;
    };
    carGroup.add(createDoorHandle(0.2, 0.94));
    carGroup.add(createDoorHandle(-0.6, 0.94));
    carGroup.add(createDoorHandle(0.2, -0.94));
    carGroup.add(createDoorHandle(-0.6, -0.94));

    // 8. Sleek Projector Matrix LED Headlights
    const hlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xecfeff,
      emissiveIntensity: 2.8,
      roughness: 0.1,
    });
    const headlightR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.38), hlMat);
    headlightR.position.set(2.18, 0.6, 0.62);
    headlightR.rotation.y = -0.15;
    carGroup.add(headlightR);

    const headlightL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.38), hlMat);
    headlightL.position.set(2.18, 0.6, -0.62);
    headlightL.rotation.y = 0.15;
    carGroup.add(headlightL);

    // 9. Full-Width Sculpted Red LED Taillight Blade (Visible in 3/4 rear reference shot)
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff1e1e,
      emissive: 0xff1e1e,
      emissiveIntensity: 2.2,
      roughness: 0.12,
    });
    const taillightBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 1.7), tailMat);
    taillightBlade.position.set(-2.26, 0.69, 0);
    carGroup.add(taillightBlade);

    // 10. Rear License Plate Inset with QuantEV branding
    const plateRecess = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.14, 0.44),
      blackTrimMat
    );
    plateRecess.position.set(-2.26, 0.52, 0);
    carGroup.add(plateRecess);

    const plateMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
    );
    plateMesh.rotation.y = -Math.PI / 2;
    plateMesh.position.set(-2.285, 0.52, 0);
    carGroup.add(plateMesh);

    // 11. Rear Charge Port (Illuminated Emerald Green Halo Ring where cable plugs in)
    const portRing = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.085, 24),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    portRing.rotation.y = Math.PI / 2;
    portRing.position.set(-0.92, 0.74, 0.94);
    carGroup.add(portRing);

    // 12. Aerodynamic Wing Mirrors
    const createMirror = (zSide: number) => {
      const m = new THREE.Group();
      m.position.set(0.65, 0.92, zSide * 0.94);

      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.14), carPaintMat);
      stalk.position.set(0, 0, zSide * 0.07);
      m.add(stalk);

      const housing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.08), carPaintMat);
      housing.position.set(0, 0.02, zSide * 0.15);
      m.add(housing);

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.08), chromeMat);
      glass.rotation.y = zSide > 0 ? -Math.PI / 2 : Math.PI / 2;
      glass.position.set(-0.01, 0.02, zSide * 0.19);
      m.add(glass);

      return m;
    };
    carGroup.add(createMirror(1));
    carGroup.add(createMirror(-1));

    // 13. High-Detail Multi-Spoke Turbine Sport Wheels
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.88,
      metalness: 0.1,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.14,
    });
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.22,
    });
    const caliperMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.2,
      metalness: 0.4,
    });

    const createDetailedTurbineWheel = (wx: number, wz: number) => {
      const wGroup = new THREE.Group();
      wGroup.position.set(wx, 0.36, wz);

      // Tire Tread Outer Cylinder
      const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 32);
      tireGeo.rotateX(Math.PI / 2);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      wGroup.add(tire);

      // Machined Alloy Turbine Face
      const rimBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.265, 24),
        rimMat
      );
      rimBarrel.rotation.x = Math.PI / 2;
      wGroup.add(rimBarrel);

      // 8 Turbine Aero Blades
      for (let s = 0; s < 8; s++) {
        const angle = (s * Math.PI) / 4;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.02), rimMat);
        spoke.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, wz > 0 ? 0.13 : -0.13);
        spoke.rotation.z = angle + 0.3;
        wGroup.add(spoke);
      }

      // Center Hub Cap with Emblem
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.27, 16),
        blackTrimMat
      );
      hub.rotation.x = Math.PI / 2;
      wGroup.add(hub);

      // Drilled Steel Brake Rotor Disc
      const rotor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.21, 0.04, 20),
        rotorMat
      );
      rotor.rotation.x = Math.PI / 2;
      wGroup.add(rotor);

      // Performance Green Caliper
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.08), caliperMat);
      caliper.position.set(0.12, 0.1, 0);
      wGroup.add(caliper);

      return wGroup;
    };

    // 4 Wheels
    carGroup.add(createDetailedTurbineWheel(1.35, 0.92));
    carGroup.add(createDetailedTurbineWheel(1.35, -0.92));
    carGroup.add(createDetailedTurbineWheel(-1.35, 0.92));
    carGroup.add(createDetailedTurbineWheel(-1.35, -0.92));

    // Vehicle Contact Shadow on Plinth
    const carShadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(4.8, 2.4),
      shadowMat
    );
    carShadowPlane.rotation.x = -Math.PI / 2;
    carShadowPlane.position.set(0, 0.005, 0);
    carGroup.add(carShadowPlane);

    scene.add(carGroup);

    // ── 12. ANIMATION LOOP ──────────────────────────────────────────────────
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth Turntable rotation
      if (isTurntableRef.current) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.0;
      } else {
        controls.autoRotate = false;
      }

      // Stream energy particles along active charging cable (Reversed in V2G mode)
      if (energyParticlesRef.current && cableCurveRef.current) {
        const particles = energyParticlesRef.current.children;
        particles.forEach((p, idx) => {
          const rawT = (elapsed * 0.7 + idx * 0.16) % 1.0;
          // In V2G mode, reverse the particle stream (1 - rawT) so energy flows from car back to grid!
          const t = isV2GRef.current ? (1.0 - rawT) : rawT;
          const point = cableCurveRef.current!.getPoint(t);
          p.position.copy(point);
          if (p instanceof THREE.Mesh && p.material instanceof THREE.MeshBasicMaterial) {
            p.material.color.setHex(isV2GRef.current ? 0x38bdf8 : 0x34d399);
          }
        });
      }

      // Subtle luminous breathe effect on canopy soffit
      if (greenCeilingMatRef.current) {
        greenCeilingMatRef.current.emissiveIntensity = 0.38 + Math.sin(elapsed * 2.4) * 0.08;
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // ── RESIZE HANDLER ───────────────────────────────────────────────────────
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    // ── CLEANUP ──────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      envRenderTarget.dispose();
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── LIGHTING CYCLES ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current || !lightsRef.current || !rendererRef.current) return;
    const { ambient, sun, fillLight, canopySpot1, canopySpot2, canopySpot3, canopySpot4 } = lightsRef.current;

    if (lighting === "night") {
      sceneRef.current.background = new THREE.Color(0x060911);
      ambient.color.setHex(0x0f172a);
      ambient.intensity = 0.3;
      sun.intensity = 0.08;
      fillLight.intensity = 0.05;
      canopySpot1.intensity = 5.2;
      canopySpot2.intensity = 5.2;
      canopySpot3.intensity = 5.2;
      canopySpot4.intensity = 5.2;
      rendererRef.current.toneMappingExposure = 1.35;
    } else if (lighting === "dusk") {
      sceneRef.current.background = new THREE.Color(0x181a24);
      ambient.color.setHex(0xf97316);
      ambient.intensity = 0.65;
      sun.color.setHex(0xfb923c);
      sun.intensity = 1.6;
      fillLight.intensity = 0.5;
      canopySpot1.intensity = 3.6;
      canopySpot2.intensity = 3.6;
      canopySpot3.intensity = 3.6;
      canopySpot4.intensity = 3.6;
      rendererRef.current.toneMappingExposure = 1.22;
    } else {
      // Day Studio Light (Exact match to reference image)
      sceneRef.current.background = new THREE.Color(0xf4f6f8);
      ambient.color.setHex(0xffffff);
      ambient.intensity = 0.9;
      sun.color.setHex(0xffffff);
      sun.intensity = 2.6;
      fillLight.intensity = 0.85;
      canopySpot1.intensity = 2.4;
      canopySpot2.intensity = 2.4;
      canopySpot3.intensity = 2.4;
      canopySpot4.intensity = 2.4;
      rendererRef.current.toneMappingExposure = 1.15;
    }
  }, [lighting]);

  // ── SCREEN UPDATE ON TIMESTEP & V2G MODE ADVANCEMENT ────────────────────
  useEffect(() => {
    if (!screenCanvasRef.current || !screenTextureRef.current) return;
    const ctx = screenCanvasRef.current.getContext("2d");
    if (!ctx) return;

    updateScreenCanvas(ctx, powerKw, batterySoc, tariffRate, chargingSessionNumber, isV2G);
    screenTextureRef.current.needsUpdate = true;
  }, [powerKw, batterySoc, tariffRate, chargingSessionNumber, isV2G]);

  // ── Camera Preset Controls ────────────────────────────────────────────────
  const setCameraPreset = (preset: "hero" | "dispensers" | "overhead") => {
    if (!cameraRef.current || !controlsRef.current) return;
    if (preset === "hero") {
      // Exact reference image framing (3/4 rear-quarter hero perspective)
      cameraRef.current.position.set(4.6, 2.7, 7.8);
      controlsRef.current.target.set(0.1, 1.25, 0.2);
    } else if (preset === "dispensers") {
      // Close up of arch dispensers and charge port
      cameraRef.current.position.set(2.2, 1.65, 3.4);
      controlsRef.current.target.set(1.4, 1.1, 0.95);
    } else if (preset === "overhead") {
      // Clean architectural top-down projection
      cameraRef.current.position.set(0.1, 11.0, 3.8);
      controlsRef.current.target.set(0, 1.0, 0);
    }
    controlsRef.current.update();
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        userSelect: "none",
        overflow: "hidden",
      }}
    >
      {/* Three.js Canvas Container */}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "100%",
          cursor: "grab",
        }}
      />

      {/* Floating Camera Presets & Turntable Toolbar (Bottom-Left Pill) */}
      <div
        style={{
          position: "absolute",
          bottom: "14px",
          left: "14px",
          zIndex: 15,
          display: "flex",
          gap: "6px",
        }}
      >
        <button
          onClick={() => setCameraPreset("hero")}
          style={{
            background: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e2e8f0",
            borderRadius: "7px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#0f172a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
          title="Hero shot matching reference"
        >
          <Camera size={13} className="text-emerald-600" />
          <span>Hero View</span>
        </button>

        <button
          onClick={() => setCameraPreset("dispensers")}
          style={{
            background: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e2e8f0",
            borderRadius: "7px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#0f172a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
          title="Close-up of arch dispensers and charge port"
        >
          <Eye size={13} className="text-emerald-600" />
          <span>Dispensers</span>
        </button>

        <button
          onClick={() => {
            const nextMode = isV2G ? "charge" : "v2g";
            setInternalMode(nextMode);
            onModeChange?.(nextMode);
          }}
          style={{
            background: isV2G ? "#0284c7" : "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(10px)",
            border: isV2G ? "1px solid #0284c7" : "1px solid #e2e8f0",
            borderRadius: "7px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: isV2G ? "#ffffff" : "#0f172a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
          title="Toggle V2G Bidirectional Backflow simulation"
        >
          {isV2G ? (
            <>
              <RefreshCw size={12} className="text-sky-600 animate-spin" />
              <span>V2G Active</span>
            </>
          ) : (
            <>
              <Zap size={12} className="text-emerald-600" />
              <span>Charge Flow</span>
            </>
          )}
        </button>

        <button
          onClick={() => setCameraPreset("overhead")}
          style={{
            background: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e2e8f0",
            borderRadius: "7px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#0f172a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
          title="Architectural overhead plan"
        >
          <Maximize2 size={13} className="text-slate-600" />
          <span>Overhead</span>
        </button>

        <button
          onClick={() => setIsTurntableActive(!isTurntableActive)}
          style={{
            background: isTurntableActive ? "#0f172a" : "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(10px)",
            border: "1px solid #e2e8f0",
            borderRadius: "7px",
            padding: "5px 10px",
            fontSize: "11px",
            fontWeight: 600,
            color: isTurntableActive ? "#ffffff" : "#0f172a",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
          }}
          title="Toggle 360° turntable presentation"
        >
          <RotateCw size={13} className={isTurntableActive ? "text-emerald-400" : "text-slate-600"} />
          <span>Turntable</span>
        </button>
      </div>
    </div>
  );
}
