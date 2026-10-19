/**
 * WebGL renderer for the field: one draw call of soft points. All morphing
 * happens in the vertex shader; JavaScript only updates a few uniforms.
 */
import * as THREE from "three";
import worldDots from "@/data/world-dots.json";
import { buildFormations, computeLayout, placeOnMap, type FieldLayout, type Formations } from "./formations";
import { hexToRgb, rng } from "./math";

export type RegionKey = "europe" | "apac" | "northAmerica";

const VERT = /* glsl */ `
  attribute vec2 aP0;
  attribute vec2 aP1;
  attribute vec2 aP2;
  attribute vec2 aP3;
  attribute vec2 aP4;
  attribute vec2 aP5;
  attribute vec2 aP6;
  attribute vec3 aColor;
  attribute vec4 aRand;
  attribute vec2 aVis;

  uniform float uStage;
  uniform float uZoom;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  uniform float uPx;
  uniform float uSize;
  uniform float uDrift;
  uniform vec3 uInk;
  uniform float uInkAmt;
  uniform float uOpacity;

  varying vec3 vColor;
  varying float vAlpha;

  vec2 pick(float i) {
    if (i < 0.5) return aP0;
    if (i < 1.5) return aP1;
    if (i < 2.5) return aP2;
    if (i < 3.5) return aP3;
    if (i < 4.5) return aP4;
    return aP5;
  }

  float ease(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

  void main() {
    float s = clamp(uStage, 0.0, 5.0);
    float i0 = floor(min(s, 4.9999));
    float f = s - i0;
    float d = aRand.x * 0.42;
    float t = ease(clamp((f - d) / 0.58, 0.0, 1.0));
    vec2 p = mix(pick(i0), pick(i0 + 1.0), t);

    float atMap = smoothstep(4.6, 5.0, s);
    float zd = aRand.x * 0.3;
    float z = ease(clamp((uZoom - zd) / 0.7, 0.0, 1.0)) * atMap;
    p = mix(p, aP6, z);

    float ph = aRand.y * 6.28318;
    p += vec2(sin(uTime * 0.55 + ph), cos(uTime * 0.47 + ph * 1.3)) * uDrift * (0.6 + aRand.z);

    vec2 dv = p - uPointer;
    float dist = length(dv);
    float push = uPointerOn * (1.0 - smoothstep(0.0, 110.0, dist));
    p += (dv / max(dist, 0.001)) * push * push * 22.0;

    float visMap = mix(aVis.x, aVis.y, z);
    float a = mix(1.0, visMap, atMap);

    vColor = mix(aColor, uInk, uInkAmt);
    vAlpha = a * uOpacity;
    gl_Position = projectionMatrix * vec4(p, 0.0, 1.0);
    gl_PointSize = uSize * (0.8 + aRand.z * 0.45) * uPx;
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float edge = 1.0 - smoothstep(0.32, 0.5, r);
    if (edge * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vColor, edge * vAlpha);
  }
`;

/** Per-formation look: point size, ink amount (0 = data colours, 1 = ink), drift. */
const LOOK = [
  { size: 2.8, ink: 0.0, drift: 0.9 },
  { size: 2.1, ink: 0.62, drift: 2.2 },
  { size: 2.5, ink: 0.4, drift: 0.25 },
  { size: 2.6, ink: 0.0, drift: 0.7 },
  { size: 2.2, ink: 1.0, drift: 0.15 },
  { size: 2.5, ink: 0.92, drift: 0.12 },
];

export class FieldRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.OrthographicCamera;
  private geometry = new THREE.BufferGeometry();
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private formations!: Formations;
  layout!: FieldLayout;
  private raf = 0;
  private running = false;
  private start = performance.now();
  private n: number;
  private region: RegionKey | null = null;
  private pointerTarget = { x: -9999, y: -9999, on: 0 };
  private pointer = { x: -9999, y: -9999, on: 0 };
  private stageTarget = 0;
  private stage = 0;
  private zoomTarget = 0;
  private zoom = 0;
  private reduced: boolean;
  private safeTop = 0;
  onFrame?: (stage: number, zoom: number) => void;

  constructor(private canvas: HTMLCanvasElement, opts: { reducedMotion: boolean }) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    const ink = hexToRgb("#16202b");
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uStage: { value: 0 },
        uZoom: { value: 0 },
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(-9999, -9999) },
        uPointerOn: { value: 0 },
        uPx: { value: 1 },
        uSize: { value: 2.4 },
        uDrift: { value: 1 },
        uInk: { value: new THREE.Vector3(ink[0], ink[1], ink[2]) },
        uInkAmt: { value: 0 },
        uOpacity: { value: 1 },
      },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.n = window.innerWidth < 900 ? 4600 : 9000;
    this.resize();
  }

  resize() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const px = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(px);
    this.renderer.setSize(W, H, false);
    this.camera.left = 0;
    this.camera.right = W;
    this.camera.top = 0;
    this.camera.bottom = H;
    this.camera.updateProjectionMatrix();
    this.material.uniforms.uPx!.value = px;
    this.layout = computeLayout(W, H, this.safeTop);
    this.formations = buildFormations(this.n, this.layout);
    const f = this.formations;
    const g = this.geometry;
    const pos = new Float32Array(this.n * 3);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    f.pos.forEach((arr, i) => g.setAttribute(`aP${i}`, new THREE.BufferAttribute(arr, 2)));
    g.setAttribute("aColor", new THREE.BufferAttribute(f.color, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(f.rand, 4));
    g.setAttribute("aVis", new THREE.BufferAttribute(f.vis, 2));
    if (this.region) this.buildRegion(this.region);
    this.renderOnce();
  }

  private buildRegion(key: RegionKey) {
    const reg = (worldDots.regions as Record<RegionKey, { box: number[]; dots: number[] }>)[key];
    const f = this.formations;
    placeOnMap(reg.dots, reg.box as [number, number, number, number], this.layout.map, f.pos[5]!, f.pos[6]!, f.vis, 1, this.n, rng(7).next);
    (this.geometry.getAttribute("aP6") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("aVis") as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Zoom the map into a region (or back out with null). */
  setRegion(key: RegionKey | null) {
    if (key === this.region) return;
    if (key) {
      this.region = key;
      this.buildRegion(key);
      this.zoom = 0;
      this.zoomTarget = 1;
    } else {
      this.zoomTarget = 0;
      // Keep the region geometry until the zoom-out finishes.
      window.setTimeout(() => {
        if (this.zoomTarget === 0) this.region = null;
      }, 1600);
    }
    this.kick();
  }

  /** Phones only: keep the hero triangle below this y position. */
  setSafeTop(y: number) {
    if (Math.abs(y - this.safeTop) < 4) return;
    this.safeTop = y;
    this.resize();
  }

  setStage(v: number, immediate = false) {
    this.stageTarget = v;
    if (immediate || this.reduced) this.stage = v;
    this.kick();
  }

  setPointer(x: number, y: number, on: boolean) {
    this.pointerTarget = { x, y, on: on && !this.reduced ? 1 : 0 };
    this.kick();
  }

  setOpacity(o: number) {
    this.material.uniforms.uOpacity!.value = o;
    this.kick();
  }

  private exitOffset = 0;
  private stickOffset = 0;

  /** Slide the whole canvas up, so the map leaves with its section. */
  setOffset(px: number) {
    this.exitOffset = px;
    this.applyOffset();
  }

  /** Phones: start the canvas lower, gliding into place over the first scroll. */
  setStick(scrollY: number) {
    this.stickOffset = Math.max(0, this.layout.stick - scrollY);
    this.applyOffset();
  }

  private applyOffset() {
    const y = this.stickOffset - this.exitOffset;
    this.canvas.style.transform = y ? `translate3d(0, ${y}px, 0)` : "";
  }

  private applyLook() {
    const s = Math.max(0, Math.min(5, this.stage));
    const i = Math.min(4, Math.floor(s));
    const t = s - i;
    const a = LOOK[i]!;
    const b = LOOK[Math.min(5, i + 1)]!;
    const u = this.material.uniforms;
    // The map packs thousands of dots into the page width: shrink them on small screens.
    const mapW = this.layout.map.x1 - this.layout.map.x0;
    const mapScale = Math.min(1, Math.max(0.55, mapW / 1150));
    const atMap = Math.max(0, Math.min(1, s - 4)) * (1 - this.zoom * 0.45);
    const sizeScale = (this.layout.mobile ? 0.92 : 1) * (1 - atMap * (1 - mapScale));
    u.uSize!.value = (a.size + (b.size - a.size) * t) * sizeScale;
    u.uInkAmt!.value = a.ink + (b.ink - a.ink) * t;
    u.uDrift!.value = this.reduced ? 0 : a.drift + (b.drift - a.drift) * t;
    u.uStage!.value = this.stage;
    u.uZoom!.value = this.zoom;
  }

  private kick() {
    if (!this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private lastTick = 0;

  private tick = (now: number) => {
    // Frame-rate independent easing: the same feel at 30, 60 or 120 fps.
    const dt = this.lastTick ? Math.min(0.25, (now - this.lastTick) / 1000) : 1 / 60;
    this.lastTick = now;
    const ease = (rate: number) => 1 - Math.exp(-rate * dt);
    this.stage += (this.stageTarget - this.stage) * ease(7);
    if (Math.abs(this.stageTarget - this.stage) < 0.0005) this.stage = this.stageTarget;
    this.zoom += (this.zoomTarget - this.zoom) * ease(2.8);
    if (Math.abs(this.zoomTarget - this.zoom) < 0.001) this.zoom = this.zoomTarget;
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * ease(12);
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * ease(12);
    this.pointer.on += (this.pointerTarget.on - this.pointer.on) * ease(5);
    const u = this.material.uniforms;
    (u.uPointer!.value as THREE.Vector2).set(this.pointer.x, this.pointer.y);
    u.uPointerOn!.value = this.pointer.on;
    u.uTime!.value = (performance.now() - this.start) / 1000;
    this.applyLook();
    this.renderer.render(this.scene, this.camera);
    this.onFrame?.(this.stage, this.zoom);
    const settled =
      this.stage === this.stageTarget && this.zoom === this.zoomTarget && Math.abs(this.pointer.on - this.pointerTarget.on) < 0.002;
    const drifting = !this.reduced && !document.hidden && u.uOpacity!.value > 0.01;
    if (settled && !drifting) {
      this.running = false;
      this.lastTick = 0;
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  renderOnce() {
    this.applyLook();
    this.renderer.render(this.scene, this.camera);
  }

  pause() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.lastTick = 0;
  }

  resume() {
    this.kick();
  }

  dispose() {
    this.pause();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
