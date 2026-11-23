/**
 * Bottle.ts — bouteille REDSEA 3D du site.
 * -----------------------------------------------------------------------------
 * Point d'entrée du dossier src/three/, chargé à la demande (import dynamique). Il expose un
 * contrôleur minimal : pose pilotée par le scroll, rotation au drag avec inertie, rotation idle,
 * demi-tour au clic.
 *
 *   Bottle.ts     contrôleur : cadrage, rotation, boucle de rendu
 *   emulator.js   la bouteille elle-même, reprise à l'identique du simulateur Red Sea
 *                 (verre, liquide, capsule, étiquette, condensation qui coule)
 *
 * De jour (pose.night = 0), la bouteille n'a qu'UN degré de liberté : elle tourne sur son axe
 * vertical. Elle reste droite (`tiltX` / `tiltZ` de la pose sont ignorés) ; ses déplacements à
 * l'écran (scroll) sont un décalage de l'image, pas un mouvement de la bouteille : le liquide ne
 * ballotte donc que lorsqu'on la fait tourner.
 *
 * La nuit (pose.night = 1, scène « simulateur »), c'est le simulateur complet : même cadrage, sol
 * d'eau noire avec reflet et ronds des gouttes, et la bouteille se manipule librement (sphère
 * virtuelle pour la tourner dans tous les sens, déplacement, zoom). En quittant la nuit, elle se
 * redresse et revient au centre d'elle-même.
 */
import {
  CanvasTexture,
  DirectionalLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { createEmulatorScene } from './emulator.js';

/** Position horizontale (0–1) du centre du logo sur l'étiquette déroulée : c'est la face avant. */
const LABEL_FRONT_U = 0.272;

export interface BottlePose {
  /** Rotation Y imposée de l'extérieur (scroll), en radians. */
  spin: number;
  /** Décalage dans le viewport, en fraction de sa largeur / hauteur (0 = centré). */
  x: number;
  y: number;
  scale: number;
  /** Ignorés : la bouteille reste droite (un seul degré de liberté). Gardés pour main.ts. */
  tiltX: number;
  tiltZ: number;
  /** 0 = page de jour ; 1 = simulateur complet (cadrage, sol d'eau, manipulation libre). */
  night: number;
}

export interface BottleOptions {
  canvas: HTMLCanvasElement;
  /** Étiquette à plat, limitée aux 189 mm visibles (sans le recouvrement). */
  labelUrl: string;
  /** Plus utilisés : la capsule du simulateur est en métal brossé, sans logo imprimé. */
  capUrl?: string;
  capInk?: number;
  /** Scène allégée (mobile) : pixel ratio plafonné, moins de gouttes. */
  lowPower?: boolean;
  /** Progression réelle du chargement (0 → 1). */
  onProgress?: (ratio: number) => void;
  /** Contexte WebGL perdu : l'appelant peut basculer sur l'image de secours. */
  onContextLost?: () => void;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BottleController {
  /** Objet mutable : animer ses propriétés (GSAP) suffit, la boucle de rendu les lit. */
  readonly pose: BottlePose;
  start(): void;
  stop(): void;
  resize(): void;
  /** Demi-tour animé vers la face suivante (recto ↔ verso). */
  flip(): void;
  /** Rotation manuelle (clavier). */
  nudge(radians: number): void;
  dragStart(): void;
  /** `deltaX` en pixels CSS depuis le dernier événement. */
  dragMove(deltaX: number): void;
  dragEnd(): void;
  /** Boîte englobante de la bouteille à l'écran, relative au canvas (px CSS). */
  getScreenRect(): ScreenRect | null;
  /** Couleur du fond de page derrière la bouteille (sRGB, 0–1) : vue à travers le verre et le liquide. */
  setBackdrop(r: number, g: number, b: number): void;
  /** Vrai quand la bouteille se manipule librement (nuit complète, bouteille centrée). */
  isFree(): boolean;
  /** Manipulation libre, comme dans le simulateur. `x`, `y` : position dans le canvas (px CSS). */
  freeDown(id: number, x: number, y: number, pan: boolean): void;
  freeMove(id: number, x: number, y: number): void;
  freeUp(id: number): void;
  /** Zoom (facteur > 1 : on recule) vers le point visé. */
  freeZoom(factor: number, x?: number, y?: number): void;
  /** Impulsion de rotation autour d'un axe de l'écran (clavier). */
  freeKick(x: number, y: number, z: number): void;
  /** Rotation automatique sur l'axe de la bouteille. */
  setSpinning(on: boolean): void;
  /** Bouteille redressée, recentrée, liquide au repos. */
  recenter(): void;
  dispose(): void;
}

/** Ombre de contact douce sous la bouteille : simple dégradé radial (mm). */
function createContactShadow(): Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(26, 13, 11, 0.5)');
  g.addColorStop(0.35, 'rgba(26, 13, 11, 0.26)');
  g.addColorStop(1, 'rgba(26, 13, 11, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  const shadow = new Mesh(
    new PlaneGeometry(150, 150),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.name = 'ContactShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -2;
  return shadow;
}

/** Lumière rouge déposée sur la table par le liquide, à côté de l'ombre. */
function createCaustic(): Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(214, 24, 34, 0.5)');
  g.addColorStop(0.4, 'rgba(190, 14, 26, 0.22)');
  g.addColorStop(1, 'rgba(160, 10, 20, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const caustic = new Mesh(
    new PlaneGeometry(78, 46),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  caustic.name = 'Caustic';
  caustic.rotation.x = -Math.PI / 2;
  caustic.rotation.z = -0.35;
  caustic.renderOrder = -1;
  return caustic;
}

/** Vitesse de la rotation idle (rad/s) : un tour en ~15 s. */
const IDLE_SPEED = 0.42;
/** Légère plongée de la caméra (radians) : laisse voir le dessus de la capsule. */
const CAMERA_PITCH = 0.085;
/** Cadrage du simulateur (la nuit) : objectif, plongée, distance et point visé. */
const DAY_FOV = 24;
const NIGHT_FOV = 32;
const NIGHT_PITCH = (8 * Math.PI) / 180;
const NIGHT_DIST = 640;
const NIGHT_LOOK_Y = -27;
/** Rayon (mm) de la sphère virtuelle qui sert à tourner la bouteille. */
const ARC_MM = 135;
const clampDist = (d: number) => Math.min(1200, Math.max(170, d));

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function createBottle(options: BottleOptions): Promise<BottleController> {
  const { canvas, lowPower = false, onProgress } = options;
  const STEPS = 4;
  let step = 0;
  const advance = () => onProgress?.(++step / STEPS);

  const emu = createEmulatorScene({ canvas, lowPower });
  const { renderer, camera, pivot } = emu;
  const maxPixelRatio = lowPower ? 1.25 : 2;
  /** Hauteur totale (mm), capsule comprise, et demi-hauteur autour du pivot. */
  const HEIGHT = emu.HTOP + 1.6;
  advance(); // 1 — moteur, studio, géométrie

  const shadow = createContactShadow();
  shadow.position.y = -emu.CY - 0.4;
  emu.scene.add(shadow);
  const caustic = createCaustic();
  caustic.position.set(28, -emu.CY - 0.3, 12);
  emu.scene.add(caustic);

  // Le studio du simulateur éclaire à contre-jour, sur fond noir. Sur une page claire, l'étiquette
  // a besoin d'une lumière de face pour garder ses vraies couleurs.
  const FRONT_LIGHT = 2.3;
  const shadowMat = shadow.material as MeshBasicMaterial;
  const causticMat = caustic.material as MeshBasicMaterial;
  const front = new DirectionalLight(0xfff6ea, FRONT_LIGHT);
  front.position.set(120, 260, 900);
  emu.scene.add(front);

  await emu.setLabel(options.labelUrl, LABEL_FRONT_U, true);
  advance(); // 2 — étiquette

  const pose: BottlePose = { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0, tiltZ: 0, night: 0 };

  // ---- Cadrage : la caméra ne bouge pas ; l'échelle et le déplacement sont un zoom / décalage de l'image ----
  let cssWidth = 1;
  let cssHeight = 1;
  let baseDist = 1000;
  // Cadrage de nuit : celui du simulateur ; sur un écran en hauteur (téléphone), on recule et on vise plus
  // haut, pour que la bouteille tienne sous le texte.
  const LOOK0 = new Vector3(0, NIGHT_LOOK_Y, 0);
  let nightDist0 = NIGHT_DIST;
  const resize = () => {
    cssWidth = Math.max(1, canvas.clientWidth);
    cssHeight = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    emu.resize(cssWidth, cssHeight);
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    // La bouteille occupe au plus 86 % de la hauteur et 46 % de la largeur du viewport.
    const distH = HEIGHT / (0.86 * 2 * tan);
    const distW = (emu.R * 2) / (0.46 * 2 * tan * camera.aspect);
    baseDist = Math.max(distH, distW);
    const tall = camera.aspect < 0.8;
    nightDist0 = tall ? 880 : NIGHT_DIST;
    LOOK0.y = tall ? 36 : NIGHT_LOOK_Y;
  };
  resize();
  // ---- Nuit : cadrage du simulateur + manipulation libre ----
  const look = LOOK0.clone();
  const lookNow = new Vector3();
  let nightDist = nightDist0;
  let nightK = 0;
  let free = false;
  let spinning = false;
  let dist = baseDist;
  const freeQ = new Quaternion();
  const yawQ = new Quaternion();
  const tmpQ = new Quaternion();
  const IDENTITY = new Quaternion();
  const UP = new Vector3(0, 1, 0);
  const angVel = new Vector3();
  const va = new Vector3();
  const vb = new Vector3();
  const pointers = new Map<number, { x: number; y: number }>();
  type FreeDrag =
    | { mode: 'rot'; p: { x: number; y: number }; v: Vector3; t: number }
    | { mode: 'pan'; p: { x: number; y: number } }
    | { mode: 'multi'; cx: number; cy: number; d: number; a: number };
  let freeDrag: FreeDrag | null = null;

  const frameCamera = () => {
    const k = nightK;
    const fov = DAY_FOV + (NIGHT_FOV - DAY_FOV) * k;
    const pitch = CAMERA_PITCH + (NIGHT_PITCH - CAMERA_PITCH) * k;
    // On interpole la taille apparente (et non la distance) : la bouteille ne « pompe » pas quand l'objectif change.
    const halfDay = (baseDist / Math.max(0.05, pose.scale)) * Math.tan((DAY_FOV * Math.PI) / 360);
    const halfNight = nightDist * Math.tan((NIGHT_FOV * Math.PI) / 360);
    dist = (halfDay + (halfNight - halfDay) * k) / Math.tan((fov * Math.PI) / 360);
    lookNow.copy(look).multiplyScalar(k);
    camera.fov = fov;
    camera.position.set(lookNow.x, lookNow.y + dist * Math.sin(pitch), lookNow.z + dist * Math.cos(pitch));
    camera.lookAt(lookNow);
    // Décalage de l'image (comme un objectif à décentrement) : la bouteille glisse à l'écran sans bouger.
    camera.setViewOffset(cssWidth, cssHeight, -pose.x * cssWidth, pose.y * cssHeight, cssWidth, cssHeight);
    camera.updateMatrixWorld();
  };
  const mmPerPx = () => (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / cssHeight;
  /** Point de l'écran → sphère virtuelle centrée sur la bouteille. */
  const arcVec = (p: { x: number; y: number }) => {
    const c = va.copy(pivot.position).project(camera);
    const rad = ARC_MM / mmPerPx();
    const x = (p.x - (c.x * 0.5 + 0.5) * cssWidth) / rad;
    const y = -(p.y - (-c.y * 0.5 + 0.5) * cssHeight) / rad;
    const d2 = x * x + y * y;
    return new Vector3(x, y, d2 <= 0.5 ? Math.sqrt(1 - d2) : 0.5 / Math.sqrt(d2)).normalize();
  };
  /** Tourne la bouteille autour d'un axe donné dans le repère de la caméra ; renvoie l'axe dans le monde. */
  const rotateBy = (axisCam: Vector3, angle: number) => {
    const axis = axisCam.clone().applyQuaternion(camera.quaternion).normalize();
    freeQ.premultiply(tmpQ.setFromAxisAngle(axis, angle)).normalize();
    return axis;
  };
  const pan = (dx: number, dy: number) => {
    pivot.position
      .addScaledVector(va.set(1, 0, 0).applyQuaternion(camera.quaternion), dx)
      .addScaledVector(vb.set(0, 1, 0).applyQuaternion(camera.quaternion), dy);
    pivot.position.clampLength(0, 200);
  };
  /** Zoom : on s'approche du point visé ; en reculant, on revient au cadrage d'origine. */
  const zoomAt = (factor: number, px?: number, py?: number) => {
    const next = clampDist(nightDist * factor);
    const f = next / nightDist;
    if (f < 1 && px !== undefined && py !== undefined) {
      const hh = nightDist * Math.tan((NIGHT_FOV * Math.PI) / 360);
      const hw = hh * camera.aspect;
      const cx = (px / cssWidth) * 2 - 1;
      const cy = 1 - (py / cssHeight) * 2;
      look
        .addScaledVector(va.set(1, 0, 0).applyQuaternion(camera.quaternion), cx * hw * (1 - f))
        .addScaledVector(vb.set(0, 1, 0).applyQuaternion(camera.quaternion), cy * hh * (1 - f));
    } else if (f > 1) look.lerp(LOOK0, Math.min(1, (f - 1) * 1.6));
    nightDist = next;
    look.x = Math.min(260, Math.max(-260, look.x));
    look.z = Math.min(260, Math.max(-260, look.z));
    look.y = Math.min(210, Math.max(emu.FLOOR_Y + 8 - nightDist * Math.sin(NIGHT_PITCH), look.y));
  };
  const multi = () => {
    const [a, b] = [...pointers.values()];
    return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const endFree = () => {
    pointers.clear();
    freeDrag = null;
  };

  // ---- État d'interaction ----
  let userRot = 0;
  let velocity = 0;
  let dragging = false;
  let lastDragTime = 0;
  let idleRot = 0;
  let idleBlend = 0;
  let lastActive = performance.now();
  let lastSpin = pose.spin;
  let flipping: { from: number; to: number; t: number } | null = null;
  let pxToRad = 0.008;

  const update = (dt: number, now: number) => {
    if (Math.abs(pose.spin - lastSpin) > 1e-4) {
      lastSpin = pose.spin;
      lastActive = now;
    }
    if (flipping) {
      flipping.t = Math.min(1, flipping.t + dt / 0.95);
      userRot = flipping.from + (flipping.to - flipping.from) * easeInOutCubic(flipping.t);
      if (flipping.t >= 1) flipping = null;
      lastActive = now;
    } else if (!dragging && Math.abs(velocity) > 1e-3) {
      // Inertie amortie après le relâchement.
      userRot += velocity * dt;
      velocity *= Math.exp(-3.4 * dt);
      lastActive = now;
    }
    // ---- Nuit : fondu vers le simulateur, puis manipulation libre ----
    const n = Math.min(1, Math.max(0, pose.night));
    nightK = n * n * (3 - 2 * n);
    emu.setNight(nightK);
    front.intensity = FRONT_LIGHT * (1 - nightK);
    shadowMat.opacity = causticMat.opacity = 1 - nightK;
    shadow.visible = caustic.visible = nightK < 1;
    const wasFree = free;
    free = n >= 0.999 && Math.abs(pose.x) < 0.002 && Math.abs(pose.y) < 0.002;
    if (free) {
      // Inertie de rotation après le lâcher, rotation automatique sur l'axe de la bouteille.
      if (!freeDrag || freeDrag.mode !== 'rot') {
        const s = angVel.length();
        if (s > 1e-3) {
          freeQ.premultiply(tmpQ.setFromAxisAngle(va.copy(angVel).multiplyScalar(1 / s), s * dt)).normalize();
          angVel.multiplyScalar(Math.exp(-dt * 2.4));
        }
      }
      if (spinning) userRot += dt * 0.5;
      lastActive = now;
    } else {
      // Hors de la nuit : la bouteille se redresse et revient au centre, le cadrage libre est oublié.
      if (wasFree) endFree();
      const back = 1 - Math.exp(-dt * 5);
      freeQ.slerp(IDENTITY, back);
      pivot.position.multiplyScalar(1 - back);
      look.lerp(LOOK0, back);
      nightDist += (nightDist0 - nightDist) * back;
      angVel.set(0, 0, 0);
    }
    // Rotation idle : quand on ne scrolle plus (≈ 1,5 s), la bouteille se remet à tourner lentement.
    // Dès qu'on scrolle ou qu'on la saisit, elle finit son tour jusqu'au multiple de 2π le plus proche.
    const idleTarget = !free && n < 0.5 && !dragging && now - lastActive > 1500 ? 1 : 0;
    idleBlend += (idleTarget - idleBlend) * Math.min(1, dt * (idleTarget ? 0.9 : 3));
    if (idleTarget) {
      idleRot += IDLE_SPEED * idleBlend * dt;
    } else {
      const rest = Math.round(idleRot / (Math.PI * 2)) * Math.PI * 2;
      idleRot += (rest - idleRot) * Math.min(1, dt * 2.4);
    }
    // De jour, un seul degré de liberté : la rotation sur l'axe vertical (freeQ vaut l'identité).
    yawQ.setFromAxisAngle(UP, pose.spin + userRot + idleRot);
    pivot.quaternion.copy(freeQ).multiply(yawQ);
    frameCamera();
    if (dt > 0) emu.step(dt);
  };

  const draw = () => emu.render();

  // ---- Boucle de rendu (uniquement quand la scène est visible) ----
  let raf = 0;
  let running = false;
  let previous = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - previous) / 1000 || 0.016));
    previous = now;
    update(dt, now);
    draw();
  };
  const start = () => {
    if (running) return;
    running = true;
    previous = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };

  // ---- Boîte englobante à l'écran (zone de drag + curseur) ----
  const corner = new Vector3();
  const getScreenRect = (): ScreenRect | null => {
    const r = emu.R + 1;
    // Bouteille penchée ou déplacée (nuit) : la zone suit sa vraie position, avec un peu de marge.
    const moved = nightK > 0 && (Math.abs(freeQ.w) < 0.99999 || pivot.position.lengthSq() > 0.01);
    const pad = free ? 28 : 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sx of [-r, r]) {
      for (const sy of [-emu.CY, HEIGHT - emu.CY]) {
        for (const sz of [-r, r]) {
          corner.set(sx, sy, sz);
          if (moved) corner.applyQuaternion(freeQ).add(pivot.position);
          corner.project(camera);
          minX = Math.min(minX, corner.x);
          maxX = Math.max(maxX, corner.x);
          minY = Math.min(minY, corner.y);
          maxY = Math.max(maxY, corner.y);
        }
      }
    }
    if (!Number.isFinite(minX)) return null;
    const left = ((minX + 1) / 2) * cssWidth;
    const right = ((maxX + 1) / 2) * cssWidth;
    const top = ((1 - maxY) / 2) * cssHeight;
    const bottom = ((1 - minY) / 2) * cssHeight;
    const rect = { left: left - pad, top: top - pad, width: right - left + pad * 2, height: bottom - top + pad * 2 };
    pxToRad = Math.PI / Math.max(120, rect.width); // traverser la bouteille = un demi-tour
    return rect;
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    stop();
    options.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  // ---- Compilation des shaders + première image avant de rendre la main ----
  update(0, performance.now());
  emu.step(1 / 60);
  await emu.compile();
  advance(); // 3
  draw();
  advance(); // 4

  return {
    pose,
    start,
    stop,
    resize,
    getScreenRect,
    setBackdrop(r, g, b) {
      emu.setBackdrop(r, g, b);
    },
    flip() {
      const total = pose.spin + userRot + idleRot;
      const goal = (Math.round(total / Math.PI) + 1) * Math.PI;
      velocity = 0;
      flipping = { from: userRot, to: userRot + (goal - total), t: 0 };
    },
    nudge(radians) {
      flipping = null;
      velocity = radians * 3.4; // l'inertie amortie parcourt ≈ `radians`
      lastActive = performance.now();
    },
    dragStart() {
      dragging = true;
      flipping = null;
      velocity = 0;
      lastDragTime = performance.now();
      lastActive = lastDragTime;
    },
    dragMove(deltaX) {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(0.008, (now - lastDragTime) / 1000);
      const delta = deltaX * pxToRad;
      userRot += delta;
      velocity = velocity * 0.4 + (delta / dt) * 0.6;
      lastDragTime = now;
      lastActive = now;
    },
    dragEnd() {
      if (!dragging) return;
      dragging = false;
      // Relâché après une pause : pas d'élan.
      if (performance.now() - lastDragTime > 90) velocity = 0;
      velocity = Math.max(-9, Math.min(9, velocity));
      lastActive = performance.now();
    },
    isFree: () => free,
    freeDown(id, x, y, panMode) {
      if (!free) return;
      pointers.set(id, { x, y });
      if (pointers.size === 1) {
        const p = { x, y };
        freeDrag = panMode ? { mode: 'pan', p } : { mode: 'rot', p, v: arcVec(p), t: performance.now() };
        angVel.set(0, 0, 0);
      } else if (pointers.size === 2) {
        freeDrag = { mode: 'multi', ...multi() };
        angVel.set(0, 0, 0);
      }
    },
    freeMove(id, x, y) {
      if (!free || !freeDrag || !pointers.has(id)) return;
      pointers.set(id, { x, y });
      const p = { x, y };
      if (freeDrag.mode === 'rot') {
        const v = arcVec(p);
        const axis = new Vector3().crossVectors(freeDrag.v, v);
        const s = axis.length();
        if (s > 1e-7) {
          const angle = Math.atan2(s, freeDrag.v.dot(v));
          const world = rotateBy(axis, angle);
          const now = performance.now();
          const dt = Math.max((now - freeDrag.t) / 1000, 1 / 240);
          angVel.lerp(world.multiplyScalar(Math.min(angle / dt, 22)), 0.5);
          freeDrag.t = now;
        }
        freeDrag.p = p;
        freeDrag.v = v;
      } else if (freeDrag.mode === 'pan') {
        const k = mmPerPx();
        pan((p.x - freeDrag.p.x) * k, -(p.y - freeDrag.p.y) * k);
        freeDrag.p = p;
      } else if (pointers.size >= 2) {
        const m = multi();
        const k = mmPerPx();
        pan((m.cx - freeDrag.cx) * k, -(m.cy - freeDrag.cy) * k);
        zoomAt(freeDrag.d / Math.max(m.d, 1), m.cx, m.cy);
        let da = m.a - freeDrag.a;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        rotateBy(new Vector3(0, 0, 1), -da);
        Object.assign(freeDrag, m);
      }
    },
    freeUp(id) {
      if (!pointers.delete(id)) return;
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        freeDrag = { mode: 'rot', p, v: arcVec(p), t: performance.now() };
      } else if (pointers.size === 0) {
        if (!freeDrag || freeDrag.mode !== 'rot' || performance.now() - freeDrag.t > 90) angVel.set(0, 0, 0);
        freeDrag = null;
      }
    },
    freeZoom(factor, x, y) {
      if (free) zoomAt(factor, x, y);
    },
    freeKick(x, y, z) {
      if (free) angVel.addScaledVector(va.set(x, y, z).applyQuaternion(camera.quaternion), 1.6);
    },
    setSpinning(on) {
      spinning = on;
    },
    recenter() {
      freeQ.identity();
      pivot.position.set(0, 0, 0);
      look.copy(LOOK0);
      nightDist = nightDist0;
      angVel.set(0, 0, 0);
      endFree();
      emu.rest();
    },
    dispose() {
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      emu.dispose();
    },
  };
}
