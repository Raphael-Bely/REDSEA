/**
 * Bottle.ts — bouteille REDSEA 3D, générée procéduralement.
 * -----------------------------------------------------------------------------
 * Ce module est le SEUL à connaître Three.js. Il est chargé à la demande
 * (import dynamique) et expose un contrôleur minimal : pose pilotée par le
 * scroll, rotation au drag avec inertie, rotation idle, demi-tour au clic.
 *
 * Remplacer la bouteille procédurale par un fichier .glb :
 *   → ne toucher qu'à `loadBottleModel()` (voir le README, section « .glb »).
 *   Contrat du modèle : origine au centre de la base, axe Y vers le haut,
 *   hauteur ≈ BOTTLE.height (en centimètres), face avant orientée vers +Z.
 */
import {
  AmbientLight,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  InstancedMesh,
  LatheGeometry,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  type Object3D,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* -------------------------------------------------------------------------- */
/* Dimensions (cm) — bouteille 33 cl type limonade, relevées sur la photo      */
/* -------------------------------------------------------------------------- */
export const BOTTLE = {
  height: 21.7,
  bodyRadius: 3.0,
  neckRadius: 1.36,
  /** Niveau du liquide, sous le col. */
  fillLevel: 17.05,
  capRadius: 1.6,
  /** Position horizontale (0–1) du centre du logo sur l'étiquette déroulée : c'est la face avant. */
  labelFrontU: 0.272,
  /** Ratio largeur / hauteur de l'image d'étiquette (1368 × 624). Recalculé à partir de la texture. */
  labelAspect: 1368 / 624,
  /** Bas de l'étiquette sur le corps. */
  labelBottom: 2.7,
} as const;

const COLORS = {
  /**
   * Liquide : trois tons relevés sur la photo. Le bissap est translucide : sombre au centre
   * (grande épaisseur traversée), rubis sur les bords, presque lumineux là où la lumière
   * ressort (bords, fond, col).
   */
  liquidDeep: 0x4a060c,
  liquidMid: 0x980d19,
  liquidBright: 0xe42c35,
  /** Fond de page du hero : c'est lui que le verre réfracte (voir la boucle de rendu). */
  backdrop: 0xf3e2c4,
  gold: 0xc9a35c,
  glassTint: 0xfbf4ee,
  ink: '26, 13, 11',
} as const;

export interface BottlePose {
  /** Rotation Y imposée de l'extérieur (scroll), en radians. */
  spin: number;
  /** Décalage dans le viewport, en fraction de sa largeur / hauteur (0 = centré). */
  x: number;
  y: number;
  scale: number;
  /** Inclinaison vers la caméra (radians) : laisse voir le dessus de la capsule. */
  tiltX: number;
  tiltZ: number;
}

export interface BottleOptions {
  canvas: HTMLCanvasElement;
  labelUrl: string;
  capUrl: string;
  /** Scène allégée (mobile) : pixel ratio plafonné, pas de gouttes de condensation. */
  lowPower?: boolean;
  /** Progression réelle du chargement (0 → 1) : textures, compilation des shaders, première image. */
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
  /**
   * Couleur du fond de page derrière la bouteille (sRGB, 0–1). Le verre la réfracte : à mettre
   * à jour quand la section affichée change de couleur.
   */
  setBackdrop(r: number, g: number, b: number): void;
  dispose(): void;
}

interface BottleAssets {
  label: Texture;
  cap: Texture;
  /** Gouttes de condensation en relief (désactivées en mode allégé). */
  condensation: boolean;
}

/* -------------------------------------------------------------------------- */
/* Modèle                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Point d'extension : retourne l'objet 3D de la bouteille.
 * Pour utiliser un .glb, remplacer le corps de cette fonction par un
 * chargement GLTFLoader (exemple complet dans le README).
 */
export async function loadBottleModel(assets: BottleAssets): Promise<Object3D> {
  return buildProceduralBottle(assets);
}

/** Profil extérieur du verre : (rayon, hauteur), de la base au buvant. */
function glassProfile(inset = 0, topY: number = BOTTLE.height - 0.25): Vector2[] {
  const R = BOTTLE.bodyRadius - inset;
  const N = BOTTLE.neckRadius - inset;
  const path = new Path();
  path.moveTo(0.001, inset);
  path.lineTo(R - 0.75, inset);
  path.quadraticCurveTo(R - 0.08, inset + 0.05, R, inset + 0.85); // talon arrondi
  path.lineTo(R, 12.5); // corps cylindrique
  path.bezierCurveTo(R, 14.75, N + 0.2, 14.7, N + 0.07, 16.7); // épaule douce
  path.lineTo(N, 19.55); // col long
  if (inset === 0) {
    path.quadraticCurveTo(N + 0.02, 19.7, N + 0.16, 19.75); // bague
    path.lineTo(N + 0.16, 19.98);
    path.lineTo(N + 0.02, 20.05);
    path.lineTo(N + 0.02, topY);
  }
  const points = path.getPoints(22);
  return points.filter((p) => p.y <= topY + 1e-3);
}

function buildProceduralBottle({ label, cap, condensation }: BottleAssets): Group {
  const bottle = new Group();
  bottle.name = 'RedseaBottle';

  // ---- Verre ----
  const glassMaterial = new MeshPhysicalMaterial({
    color: COLORS.glassTint,
    // 1 et non 0.9 : la part non transmise est rendue comme un diffus blanc, qui voile le
    // liquide d'un gris laiteux dès qu'elle atteint quelques pour cent.
    transmission: 1,
    roughness: 0.05,
    metalness: 0,
    ior: 1.5,
    thickness: 0.35,
    attenuationColor: 0xf3ddd6,
    attenuationDistance: 9,
    specularIntensity: 1,
    // Reflets d'ambiance volontairement contenus : trop forts, ils blanchissent le rouge du liquide.
    envMapIntensity: 0.42,
  });
  const glass = new Mesh(new LatheGeometry(glassProfile(), 96), glassMaterial);
  glass.name = 'Glass';
  glass.renderOrder = 2;
  bottle.add(glass);

  // ---- Liquide : volume intérieur, niveau sous le col ----
  const liquidPoints = glassProfile(0.2, BOTTLE.fillLevel).filter((p) => p.y <= BOTTLE.fillLevel);
  const last = liquidPoints[liquidPoints.length - 1];
  liquidPoints.push(new Vector2(last.x, BOTTLE.fillLevel), new Vector2(0.001, BOTTLE.fillLevel)); // surface
  const liquid = new Mesh(new LatheGeometry(liquidPoints, 72), createLiquidMaterial());
  liquid.name = 'Liquid';
  bottle.add(liquid);

  // ---- Étiquette : enroulée sur 360°, ratio de l'image respecté ----
  const image = label.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : BOTTLE.labelAspect;
  const labelRadius = BOTTLE.bodyRadius + 0.025;
  const labelHeight = (2 * Math.PI * labelRadius) / aspect;
  const labelMesh = new Mesh(
    new CylinderGeometry(labelRadius, labelRadius, labelHeight, 128, 1, true),
    new MeshStandardMaterial({ map: label, roughness: 0.64, metalness: 0.02, envMapIntensity: 0.55 }),
  );
  labelMesh.name = 'Label';
  labelMesh.position.y = BOTTLE.labelBottom + labelHeight / 2;
  // u = 0 (jointure) est à +Z par défaut. On amène le logo (u = labelFrontU) face caméra :
  // la jointure se retrouve alors à l'arrière-côté, invisible de face.
  labelMesh.rotation.y = -BOTTLE.labelFrontU * Math.PI * 2;
  bottle.add(labelMesh);

  // ---- Capsule : métal doré à pas de vis ----
  const goldMaterial = new MeshStandardMaterial({
    color: COLORS.gold,
    metalness: 1,
    roughness: 0.32,
    envMapIntensity: 1.25,
  });
  const capR = BOTTLE.capRadius;
  const capTop = BOTTLE.height;
  const capPath = new Path();
  capPath.moveTo(capR - 0.02, 19.72);
  capPath.quadraticCurveTo(capR + 0.1, 19.78, capR + 0.06, 19.95); // jupe roulée
  capPath.lineTo(capR, 20.1);
  capPath.lineTo(capR, capTop - 0.5);
  capPath.lineTo(capR + 0.04, capTop - 0.46); // bandeau moleté
  capPath.lineTo(capR + 0.04, capTop - 0.16);
  capPath.quadraticCurveTo(capR + 0.03, capTop, capR - 0.14, capTop);
  capPath.lineTo(0.001, capTop);
  const capMesh = new Mesh(new LatheGeometry(capPath.getPoints(8), 72), goldMaterial);
  capMesh.name = 'Cap';
  bottle.add(capMesh);

  // Pas de vis : trois filets légèrement inclinés.
  const threadGeometry = new TorusGeometry(capR + 0.005, 0.05, 8, 72);
  for (let i = 0; i < 3; i++) {
    const thread = new Mesh(threadGeometry, goldMaterial);
    thread.rotation.x = Math.PI / 2 + 0.035;
    thread.rotation.z = i * 2.1;
    thread.position.y = 20.38 + i * 0.3;
    bottle.add(thread);
  }

  // Logo hibiscus sur le dessus.
  const capLogo = new Mesh(
    new CircleGeometry(capR - 0.14, 64),
    new MeshStandardMaterial({ map: cap, metalness: 0.75, roughness: 0.38, envMapIntensity: 1.1 }),
  );
  capLogo.name = 'CapLogo';
  capLogo.rotation.x = -Math.PI / 2;
  capLogo.position.y = capTop + 0.004;
  bottle.add(capLogo);

  if (condensation) bottle.add(createCondensation(labelRadius, BOTTLE.labelBottom, BOTTLE.labelBottom + labelHeight));

  return bottle;
}

/* -------------------------------------------------------------------------- */
/* Liquide, condensation, ombre                                               */
/* -------------------------------------------------------------------------- */

/**
 * Matériau du liquide. Un rouge uni éclairé ressemble à du plastique ; ici la couleur dépend de
 * l'épaisseur de liquide traversée par le regard : sombre de face, rubis puis lumineux vers les
 * bords (effet de rétro-éclairage), plus clair dans le col et au ras du fond. Le verre, rendu
 * par-dessus, apporte les reflets.
 */
function createLiquidMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uDeep: { value: new Color(COLORS.liquidDeep) },
      uMid: { value: new Color(COLORS.liquidMid) },
      uBright: { value: new Color(COLORS.liquidBright) },
      uFill: { value: BOTTLE.fillLevel },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        vHeight = position.y;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uBright;
      uniform float uFill;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float edge = 1.0 - facing;                                   // 0 de face, 1 en rasance
        float rim = smoothstep(0.12, 0.92, edge);
        float neck = smoothstep(uFill - 4.2, uFill - 0.3, vHeight);  // moins d'épaisseur dans le col
        float base = 1.0 - smoothstep(0.2, 2.4, vHeight);            // lumière qui ressort par le fond
        vec3 color = mix(uDeep, uMid, 0.22 + 0.78 * rim);
        float glow = clamp(rim * rim * 0.85 + neck * 0.3 + base * 0.45, 0.0, 0.92);
        color = mix(color, uBright, glow);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Rayon du verre et pente de la paroi à une hauteur donnée (pour poser les gouttes). */
function surfaceAt(profile: Vector2[], height: number): { radius: number; slope: number } {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1];
    const b = profile[i];
    if (height < a.y || height > b.y || b.y - a.y < 1e-4) continue;
    const t = (height - a.y) / (b.y - a.y);
    return { radius: a.x + (b.x - a.x) * t, slope: (b.x - a.x) / (b.y - a.y) };
  }
  return { radius: BOTTLE.neckRadius, slope: 0 };
}

/**
 * Condensation : de vraies gouttes en relief (une seule géométrie instanciée), posées sur le
 * verre et sur l'étiquette. Chaque goutte est une petite lentille d'eau : elle réfracte ce qu'il
 * y a derrière et accroche un point de lumière, comme sur la photo. Beaucoup de petites, quelques
 * grosses, un peu étirées par la gravité.
 */
function createCondensation(labelRadius: number, labelBottom: number, labelTop: number): InstancedMesh {
  const COUNT = 560;
  const profile = glassProfile();
  const geometry = new SphereGeometry(1, 14, 10);
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0,
    metalness: 0,
    ior: 1.33,
    thickness: 0.22,
    specularIntensity: 1,
    envMapIntensity: 0.55,
  });
  const drops = new InstancedMesh(geometry, material, COUNT);
  drops.name = 'Condensation';
  drops.renderOrder = 3; // après le verre

  // Générateur déterministe : mêmes gouttes à chaque visite.
  let seed = 20261116;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const matrix = new Matrix4();
  const normal = new Vector3();
  const around = new Vector3();
  const along = new Vector3();
  let placed = 0;
  let guard = 0;
  while (placed < COUNT && guard++ < COUNT * 40) {
    const height = 0.9 + rand() * 18.4;
    const onLabel = height > labelBottom && height < labelTop;
    const surface = surfaceAt(profile, height);
    const radius = onLabel ? labelRadius : surface.radius;
    // Densité : proportionnelle à la surface, plus clairsemée sur le papier de l'étiquette.
    const density = (radius / BOTTLE.bodyRadius) * (onLabel ? 0.42 : 1);
    if (rand() > density) continue;

    const angle = rand() * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const slope = onLabel ? 0 : surface.slope;
    normal.set(sin, -slope, cos).normalize(); // normale sortante de la paroi
    around.set(cos, 0, -sin); // tangente horizontale
    along.crossVectors(normal, around).normalize(); // tangente « verticale »

    // Taille : loi très asymétrique (rayon de 0,3 à 1,5 mm environ).
    const size = (0.03 + 0.125 * Math.pow(rand(), 3.2)) * (onLabel ? 0.85 : 1);
    const stretch = 1.05 + rand() * 0.3 + size * 2; // les grosses gouttes s'étirent vers le bas
    const bulge = 0.5 + rand() * 0.18;
    matrix.makeBasis(
      around.clone().multiplyScalar(size),
      along.clone().multiplyScalar(size * stretch),
      normal.clone().multiplyScalar(size * bulge),
    );
    matrix.setPosition(sin * radius, height, cos * radius);
    drops.setMatrixAt(placed++, matrix);
  }
  drops.count = placed;
  drops.instanceMatrix.needsUpdate = true;
  return drops;
}

/** Ombre de contact douce : simple dégradé radial, sans shadow map. */
function createContactShadow(): Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${COLORS.ink}, 0.5)`);
  g.addColorStop(0.35, `rgba(${COLORS.ink}, 0.26)`);
  g.addColorStop(1, `rgba(${COLORS.ink}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  const shadow = new Mesh(
    new PlaneGeometry(13, 13),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.name = 'ContactShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  return shadow;
}

/* -------------------------------------------------------------------------- */
/* Contrôleur                                                                 */
/* -------------------------------------------------------------------------- */

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function createBottle(options: BottleOptions): Promise<BottleController> {
  const { canvas, lowPower = false, onProgress } = options;
  const STEPS = 5;
  let step = 0;
  const advance = () => onProgress?.(++step / STEPS);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Le canvas reste transparent (le titre passe derrière la bouteille), mais on efface à la main :
  // voir `draw()` plus bas.
  renderer.autoClear = false;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxPixelRatio = lowPower ? 1.5 : 2;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.03);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();
  advance(); // 1 — moteur + éclairage studio

  const camera = new PerspectiveCamera(24, 1, 1, 400);

  const key = new DirectionalLight(0xfff4e6, 1.7);
  key.position.set(-18, 26, 40);
  scene.add(key);
  const rim = new DirectionalLight(0xffe2c8, 0.9);
  rim.position.set(30, 8, -22);
  scene.add(rim);
  scene.add(new AmbientLight(0xffffff, 0.25));

  // ---- Textures ----
  const loader = new TextureLoader();
  const [label, cap] = await Promise.all([
    loader.loadAsync(options.labelUrl).then((t) => (advance(), t)), // 2
    loader.loadAsync(options.capUrl).then((t) => (advance(), t)), // 3
  ]);
  label.colorSpace = SRGBColorSpace;
  label.anisotropy = renderer.capabilities.getMaxAnisotropy(); // reste nette en gros plan et en rasance
  cap.colorSpace = SRGBColorSpace;
  cap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---- Assemblage : rig (position, échelle, inclinaison) > spin (rotation Y) > modèle ----
  const rig = new Group();
  const spin = new Group();
  const model = await loadBottleModel({ label, cap, condensation: !lowPower });
  model.position.y = -BOTTLE.height / 2; // rotation autour du centre de la bouteille
  spin.add(model);
  rig.add(spin);
  const shadow = createContactShadow();
  shadow.position.y = -BOTTLE.height / 2 - 0.03;
  rig.add(shadow);
  scene.add(rig);

  const pose: BottlePose = { spin: 0, x: 0, y: 0, scale: 1, tiltX: 0.1, tiltZ: 0 };

  // ---- Cadrage ----
  let cssWidth = 1;
  let cssHeight = 1;
  let visibleW = 1;
  let visibleH = 1;
  const resize = () => {
    cssWidth = Math.max(1, canvas.clientWidth);
    cssHeight = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(cssWidth, cssHeight, false);
    camera.aspect = cssWidth / cssHeight;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    // La bouteille occupe au plus 86 % de la hauteur et 46 % de la largeur du viewport.
    const distH = BOTTLE.height / (0.86 * 2 * tan);
    const distW = (BOTTLE.bodyRadius * 2) / (0.46 * 2 * tan * camera.aspect);
    const dist = Math.max(distH, distW);
    camera.position.set(0, 0, dist);
    camera.updateProjectionMatrix();
    visibleH = 2 * dist * tan;
    visibleW = visibleH * camera.aspect;
  };
  resize();

  // ---- État d'interaction ----
  let userRot = 0;
  let velocity = 0;
  let dragging = false;
  let lastDragTime = 0;
  let idleRot = 0;
  let idlePhase = 0;
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
    // Rotation idle : un léger balancement qui reprend en douceur après ~2 s d'inactivité.
    // (Un balancement plutôt qu'une rotation continue : la face choisie par le scroll reste lisible.)
    const idleTarget = !dragging && now - lastActive > 2200 ? 1 : 0;
    idleBlend += (idleTarget - idleBlend) * Math.min(1, dt * 1.6);
    idlePhase += dt * idleBlend;
    idleRot = Math.sin(idlePhase * 0.6) * 0.32;

    spin.rotation.y = pose.spin + userRot + idleRot;
    rig.rotation.x = pose.tiltX;
    rig.rotation.z = pose.tiltZ;
    rig.scale.setScalar(pose.scale);
    rig.position.set(pose.x * visibleW, pose.y * visibleH, 0);
  };

  /**
   * Rendu d'une image. Avec un canvas transparent, Three.js remplit le fond de la passe de
   * transmission en blanc à 50 %, ce qui délave le verre. On efface donc le canvas en
   * transparent nous-mêmes, puis on déclare un fond opaque de la couleur de la page : la passe
   * de transmission (qui, elle, efface sa cible) réfracte ce fond, comme un vrai verre devant
   * le mur de la section en cours (voir `setBackdrop`).
   */
  const backdrop = new Color(COLORS.backdrop);
  const draw = () => {
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setClearColor(backdrop, 1);
    renderer.render(scene, camera);
  };

  // ---- Boucle de rendu (uniquement quand la scène est visible) ----
  let raf = 0;
  let running = false;
  let previous = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - previous) / 1000 || 0.016);
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
    rig.updateMatrixWorld();
    const r = BOTTLE.bodyRadius + 0.1;
    const hh = BOTTLE.height / 2;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sx of [-r, r]) {
      for (const sy of [-hh, hh]) {
        for (const sz of [-r, r]) {
          corner.set(sx, sy, sz).applyMatrix4(rig.matrixWorld).project(camera);
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
    const rect = { left, top, width: right - left, height: bottom - top };
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
  await renderer.compileAsync(scene, camera);
  advance(); // 4
  draw();
  advance(); // 5

  return {
    pose,
    start,
    stop,
    resize,
    getScreenRect,
    setBackdrop(r, g, b) {
      backdrop.setRGB(r, g, b, SRGBColorSpace);
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
    dispose() {
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
      label.dispose();
      cap.dispose();
      envTarget.dispose();
      renderer.dispose();
    },
  };
}
