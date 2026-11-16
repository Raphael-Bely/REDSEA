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
  DoubleSide,
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

/** Marge (cm) au-dessus du niveau de remplissage, dans laquelle la surface peut monter en ballottant. */
const LIQUID_HEADROOM = 1.8;

/**
 * Absorption du bissap par centimètre traversé (rouge, vert, bleu ; loi de Beer-Lambert).
 * Le rouge passe, le vert et le bleu sont absorbés : rubis lumineux là où le liquide est mince
 * (col, bords), rouge profond au centre du corps, et on voit toujours le fond à travers.
 */
const LIQUID_ABSORPTION = [0.4, 1.9, 1.6] as const;

const COLORS = {
  /** Lumière diffusée à l'intérieur du liquide : l'empêche de virer au noir devant un fond sombre. */
  liquidGlow: 0x9c0d1a,
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
  /** Scène allégée (mobile) : pixel ratio plafonné, pas de condensation. */
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
  /** Gouttes de condensation (désactivées en mode allégé). */
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
    // Vernis : seconde couche de reflets nets, comme un verre poli.
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    // Reflets du studio (voir `createStudioEnvironment`) : des boîtes à lumière sur fond sombre,
    // donc des filets de lumière intenses sans voiler le liquide.
    envMapIntensity: 1.6,
  });
  const glass = new Mesh(new LatheGeometry(glassProfile(), 96), glassMaterial);
  glass.name = 'Glass';
  glass.renderOrder = 2;
  bottle.add(glass);

  // ---- Liquide : volume intérieur ----
  // Le maillage monte plus haut que le niveau réel : la surface libre est découpée dans le shader
  // (voir `createLiquidMaterial`), ce qui laisse de la marge pour qu'elle s'incline et ondule.
  const liquidTop = BOTTLE.fillLevel + LIQUID_HEADROOM;
  const liquidPoints = glassProfile(0.2, liquidTop).filter((p) => p.y <= liquidTop);
  const last = liquidPoints[liquidPoints.length - 1];
  liquidPoints.push(new Vector2(last.x, liquidTop), new Vector2(0.001, liquidTop));
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
  // Matériau propre à la capsule : même or, plus le moletage (stries verticales en relief).
  const capMaterial = goldMaterial.clone();
  capMaterial.bumpMap = createKnurlTexture();
  capMaterial.bumpScale = 3;
  const capMesh = new Mesh(new LatheGeometry(capPath.getPoints(16), 160), capMaterial);
  capMesh.name = 'Cap';
  bottle.add(capMesh);

  // Pas de vis : trois filets légèrement inclinés.
  const threadGeometry = new TorusGeometry(capR + 0.005, 0.05, 12, 160);
  for (let i = 0; i < 3; i++) {
    const thread = new Mesh(threadGeometry, goldMaterial);
    thread.name = 'CapThread';
    thread.rotation.x = Math.PI / 2 + 0.035;
    thread.rotation.z = i * 2.1;
    thread.position.y = 20.38 + i * 0.3;
    bottle.add(thread);
  }

  // Logo hibiscus sur le dessus.
  // Le logo est imprimé : l'encre rouge est mate, le fond doré reste du métal poli.
  const printMap = createCapPrintMap(cap);
  const capLogo = new Mesh(
    new CircleGeometry(capR - 0.14, 128),
    new MeshStandardMaterial({
      map: cap,
      metalness: 1,
      roughness: 1,
      metalnessMap: printMap,
      roughnessMap: printMap,
      envMapIntensity: 1.25,
    }),
  );
  capLogo.name = 'CapLogo';
  capLogo.rotation.x = -Math.PI / 2;
  capLogo.position.y = capTop + 0.004;
  bottle.add(capLogo);

  if (condensation) bottle.add(createCondensation(labelRadius, BOTTLE.labelBottom, BOTTLE.labelBottom + labelHeight));

  return bottle;
}

/* -------------------------------------------------------------------------- */
/* Liquide et ombre                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Matériau du liquide : un volume translucide plutôt qu'une matière rouge éclairée.
 *
 * - Transparence : la couleur est celle du fond de page filtré par l'épaisseur de liquide
 *   traversée (Beer-Lambert). Épaisseur ≈ corde du cylindre = 2 · rayon · cos(angle de vue).
 * - Lumière, comme sur la photo : une bouteille de liquide coloré agit comme une lentille. Les
 *   bords sont sombres (la lumière y est déviée ou réfléchie), une bande verticale s'illumine du
 *   côté opposé à la lumière principale, et le fond concentre la lumière en un éclat rubis.
 *   Des variations douces (repère caméra, donc fixes quand la bouteille tourne, comme de vraies
 *   réfractions) cassent l'aplat.
 * - Surface libre : calculée ici, pas dans la géométrie. Tout fragment au-dessus de la surface
 *   est jeté ; à travers le trou, on voit l'intérieur de la paroi arrière (faces arrière), coloré
 *   comme la surface. La surface peut ainsi s'incliner (gravité, inertie), se creuser quand le
 *   liquide tourne (vortex) et onduler, sans toucher au maillage.
 */
function createLiquidMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uBackdrop: { value: new Color(COLORS.backdrop) },
      uGlow: { value: new Color(COLORS.liquidGlow) },
      uAbsorption: { value: new Vector3(...LIQUID_ABSORPTION) },
      uFill: { value: BOTTLE.fillLevel },
      /** Pente de la surface (repère local de la bouteille, axes x et z). */
      uTilt: { value: new Vector2() },
      /** Creux du vortex : hauteur ajoutée proportionnelle à r². */
      uSwirl: { value: 0 },
      /** Onde de ballottement (mode à deux lobes) : amplitude et orientation. */
      uWave: { value: 0 },
      uWaveAngle: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vLocal = position;
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uBackdrop;
      uniform vec3 uGlow;
      uniform vec3 uAbsorption;
      uniform float uFill;
      uniform vec2 uTilt;
      uniform float uSwirl;
      uniform float uWave;
      uniform float uWaveAngle;
      varying vec3 vLocal;
      varying vec3 vNormal;
      varying vec3 vView;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      float surfaceHeight(vec2 p) {
        float r2 = dot(p, p);
        float lobes = sin(2.0 * atan(p.y, p.x) + uWaveAngle);
        return uFill + dot(p, uTilt) + uSwirl * (r2 - 0.7) + uWave * sqrt(r2) * lobes;
      }

      vec3 throughLiquid(float thickness) {
        vec3 transmitted = exp(-uAbsorption * thickness);
        // Fond filtré + un peu de lumière diffusée dans la masse.
        return uBackdrop * transmitted + uGlow * (1.0 - transmitted.r) * 0.22;
      }

      void main() {
        float level = surfaceHeight(vLocal.xz);
        if (vLocal.y > level) discard;

        float radius = length(vLocal.xz);
        vec3 color;
        if (gl_FrontFacing) {
          vec3 n = normalize(vNormal);
          float facing = clamp(abs(dot(n, normalize(vView))), 0.0, 1.0);
          // Même en rasance la lumière traverse un peu de liquide (réfraction) : épaisseur minimale.
          float thickness = 2.0 * radius * (0.32 + 0.68 * facing);
          vec3 transmitted = exp(-uAbsorption * thickness);
          vec3 body = uBackdrop * transmitted;

          // Bande de lumière transmise : la lumière principale vient de la gauche, elle ressort
          // à droite du centre. Doublée d'un reflet plus fin à gauche.
          float band = exp(-pow((n.x - 0.38) / 0.2, 2.0));
          float band2 = exp(-pow((n.x + 0.42) / 0.09, 2.0)) * 0.45;
          // Le fond plat concentre la lumière (éclat au ras de la base).
          float base = 1.0 - smoothstep(0.25, 2.8, vLocal.y);
          // Bords sombres : lumière déviée hors de l'axe du regard.
          float edge = smoothstep(0.04, 0.5, facing);
          // Variations lentes de densité optique (réfraction du décor) : jamais un aplat.
          float wobble = noise(vec2(n.x * 3.2 + 4.0, vLocal.y * 0.32)) * 0.6
                       + noise(vec2(n.x * 7.0 - 2.0, vLocal.y * 0.9)) * 0.4;

          float light = (0.5 + 0.45 * wobble) + 1.5 * band + band2 + base * (1.2 + band);
          color = body * light * mix(0.32, 1.0, edge);
          // Lumière diffusée dans la masse : rubis, plus forte là où la lumière traverse.
          color += uGlow * (1.0 - transmitted.r) * (0.03 + 0.2 * band + 0.3 * base) * edge;

          // Ménisque : liseré clair là où le liquide touche le verre.
          float meniscus = 1.0 - smoothstep(0.0, 0.08, level - vLocal.y);
          color = mix(color, uBackdrop * vec3(1.0, 0.62, 0.6), meniscus * 0.6);
        } else {
          // Vu à travers la surface libre : on regarde la colonne de liquide par le dessus.
          color = throughLiquid(1.7 * radius + 0.6);
          float sheen = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vView))), 0.0, 1.0), 3.0);
          color += vec3(0.06, 0.03, 0.025) * (0.4 + sheen);
        }
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Moletage de la capsule : 140 stries verticales régulières (carte de relief qui se répète
 * autour du bouchon, coordonnée u de la révolution).
 */
function createKnurlTexture(): CanvasTexture {
  const width = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const ridges = 140;
  for (let x = 0; x < width; x++) {
    const v = 0.5 + 0.5 * Math.cos((x / width) * ridges * Math.PI * 2);
    const level = Math.round(255 * Math.pow(v, 0.6));
    ctx.fillStyle = `rgb(${level},${level},${level})`;
    ctx.fillRect(x, 0, 1, 4);
  }
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

/**
 * Carte « impression » du dessus de la capsule, dérivée de sa texture : canal vert = rugosité,
 * bleu = métal (convention Three.js). Encre rouge mate et non métallique, or poli ailleurs.
 */
function createCapPrintMap(cap: Texture): CanvasTexture {
  const image = cap.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    // Encre : R nettement au-dessus de G (rouge ≈ 112, or ≈ 38).
    const ink = Math.min(1, Math.max(0, (data[i] - data[i + 1] - 50) / 50));
    data[i] = 0;
    data[i + 1] = Math.round(255 * (0.26 + 0.34 * ink)); // rugosité
    data[i + 2] = Math.round(255 * (1 - 0.85 * ink)); // métal
    data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
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
 * verre et sur l'étiquette. Chaque goutte est une petite lentille d'eau : elle réfracte le liquide
 * derrière elle et accroche les boîtes à lumière du studio (point blanc net), comme sur la photo.
 * Distribution réaliste : une nuée de très petites gouttes, des moyennes, quelques grosses
 * étirées par la gravité, plus serrées sur le verre froid que sur le papier.
 */
function createCondensation(labelRadius: number, labelBottom: number, labelTop: number): InstancedMesh {
  const COUNT = 1100;
  const profile = glassProfile();
  const geometry = new SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); // dôme
  geometry.rotateX(Math.PI / 2); // dôme tourné vers +Z (normale de la paroi après mise en place)
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 1,
    roughness: 0,
    metalness: 0,
    ior: 1.33,
    thickness: 0.25,
    specularIntensity: 1,
    envMapIntensity: 1.8,
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
    const height = 0.7 + rand() * 18.7;
    const onLabel = height > labelBottom && height < labelTop;
    const surface = surfaceAt(profile, height);
    const radius = (onLabel ? labelRadius : surface.radius) + 0.004;
    // Densité : proportionnelle à la surface, plus clairsemée sur le papier, un peu moins sur le col.
    const density = (radius / BOTTLE.bodyRadius) * (onLabel ? 0.38 : 1) * (height > 16.5 ? 0.75 : 1);
    if (rand() > density) continue;

    const angle = rand() * Math.PI * 2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const slope = onLabel ? 0 : surface.slope;
    normal.set(sin, -slope, cos).normalize(); // normale sortante de la paroi
    around.set(cos, 0, -sin); // tangente horizontale
    along.crossVectors(normal, around).normalize(); // tangente « verticale »

    // Taille : loi très asymétrique (rayon de 0,2 à 1,8 mm environ).
    const size = (0.02 + 0.16 * Math.pow(rand(), 4)) * (onLabel ? 0.8 : 1);
    const stretch = 1 + rand() * 0.25 + size * 3; // les grosses gouttes s'étirent vers le bas
    const bulge = 0.42 + rand() * 0.2;
    matrix.makeBasis(
      around.clone().multiplyScalar(size),
      along.clone().multiplyScalar(size * stretch),
      normal.clone().multiplyScalar(size * bulge),
    );
    // Centre légèrement abaissé : la goutte pend sous son point d'accroche.
    matrix.setPosition(sin * radius, height - size * (stretch - 1) * 0.5, cos * radius);
    drops.setMatrixAt(placed++, matrix);
  }
  drops.count = placed;
  drops.instanceMatrix.needsUpdate = true;
  return drops;
}

/**
 * Studio photo pour les reflets du verre et de la capsule : fond brun très sombre, deux grandes
 * boîtes à lumière verticales (gauche, intense ; droite, plus étroite), un plafond diffus et un
 * sol crème. Sur un cylindre, chaque boîte devient un long filet de lumière vertical, comme
 * sur la photo de la bouteille. L'étiquette garde l'éclairage d'ambiance de la scène.
 */
function createStudioEnvironment(renderer: WebGLRenderer): Texture {
  const studio = new Scene();
  studio.background = new Color(0x120a08);
  const panel = (w: number, h: number, intensity: number, position: [number, number, number], tint = 0xfff6ec) => {
    const material = new MeshBasicMaterial({ color: new Color(tint).multiplyScalar(intensity), side: DoubleSide });
    const mesh = new Mesh(new PlaneGeometry(w, h), material);
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    studio.add(mesh);
  };
  panel(7, 30, 9, [-15, 3, 9]); // boîte principale, avant-gauche
  panel(3.2, 28, 6, [15, 1, 3]); // filet de contre-jour, droite
  panel(2, 24, 3.5, [-6, 0, -16], 0xffe2cc); // contre-jour chaud, arrière
  panel(18, 8, 1.6, [0, 18, 2]); // plafond diffus
  panel(40, 40, 0.35, [0, -14, 0], 0xf3e2c4); // sol crème (rebond)
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(studio, 0.015);
  pmrem.dispose();
  studio.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    (mesh.material as MeshBasicMaterial | undefined)?.dispose();
  });
  return target.texture;
}

/**
 * Lumière rouge projetée sur la table : la bouteille, éclairée, agit comme une lentille et
 * dépose une tache rubis à côté de son ombre (visible sur la photo).
 */
function createCaustic(): Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(214, 24, 34, 0.55)');
  g.addColorStop(0.4, 'rgba(190, 14, 26, 0.24)');
  g.addColorStop(1, 'rgba(160, 10, 20, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const caustic = new Mesh(
    new PlaneGeometry(7, 4.2),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  caustic.name = 'Caustic';
  caustic.rotation.x = -Math.PI / 2;
  caustic.rotation.z = -0.35;
  caustic.renderOrder = -1;
  return caustic;
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

/** Vitesse de la rotation idle (rad/s) : un tour en ~15 s. */
const IDLE_SPEED = 0.42;

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

  const key = new DirectionalLight(0xfff4e6, 2.1);
  key.position.set(-18, 26, 40);
  scene.add(key);
  const rim = new DirectionalLight(0xffe2c8, 1.4);
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
  cap.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // ---- Assemblage : rig (position, échelle, inclinaison) > spin (rotation Y) > modèle ----
  const rig = new Group();
  const spin = new Group();
  const model = await loadBottleModel({ label, cap, condensation: !lowPower });
  model.position.y = -BOTTLE.height / 2; // rotation autour du centre de la bouteille
  // Verre et métal reflètent le studio ; l'étiquette reste sous l'éclairage d'ambiance.
  const studio = createStudioEnvironment(renderer);
  const studioMeshes = new Set(['Glass', 'Cap', 'CapThread', 'CapLogo', 'Condensation']);
  model.traverse((object) => {
    const material = (object as Mesh).material as MeshStandardMaterial | undefined;
    if (!material || !studioMeshes.has(object.name)) return;
    material.envMap = studio;
    material.needsUpdate = true;
  });
  spin.add(model);
  rig.add(spin);
  const shadow = createContactShadow();
  shadow.position.y = -BOTTLE.height / 2 - 0.03;
  rig.add(shadow);
  const caustic = createCaustic();
  caustic.position.set(2.6, -BOTTLE.height / 2 - 0.02, 1.2);
  rig.add(caustic);
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
    // Rotation idle : quand on ne scrolle plus (≈ 1,5 s), la bouteille se remet à tourner
    // lentement sur elle-même, en accélérant en douceur. Dès qu'on scrolle ou qu'on la saisit,
    // elle ralentit et finit son tour jusqu'au multiple de 2π le plus proche : la face choisie
    // par le scroll (arguments) reste celle prévue.
    const idleTarget = !dragging && now - lastActive > 1500 ? 1 : 0;
    idleBlend += (idleTarget - idleBlend) * Math.min(1, dt * (idleTarget ? 0.9 : 3));
    if (idleTarget) {
      idleRot += IDLE_SPEED * idleBlend * dt;
    } else {
      const rest = Math.round(idleRot / (Math.PI * 2)) * Math.PI * 2;
      idleRot += (rest - idleRot) * Math.min(1, dt * 2.4);
    }

    spin.rotation.y = pose.spin + userRot + idleRot;
    rig.rotation.x = pose.tiltX;
    rig.rotation.z = pose.tiltZ;
    rig.scale.setScalar(pose.scale);
    rig.position.set(pose.x * visibleW, pose.y * visibleH, 0);
    updateLiquid(dt);
  };

  /*
   * Ballottement du liquide. La surface obéit à la gravité, pas à la bouteille :
   * - inclinaison : elle cherche à rester perpendiculaire à la gravité apparente (bouteille
   *   penchée, accélérations quand elle traverse l'écran), via un ressort amorti → elle déborde
   *   un peu, revient et oscille avant de se poser ;
   * - vortex : le liquide se met à tourner en retard sur la bouteille et ralentit en retard
   *   aussi ; tant qu'il tourne, la surface se creuse au centre ;
   * - onde : les à-coups de rotation (départ, arrêt, demi-tour) lancent une onde qui s'amortit.
   * Effets exagérés par rapport à la physique réelle (quelques millimètres) pour rester lisibles.
   */
  const liquidMesh = model.getObjectByName('Liquid') as Mesh | undefined;
  const liquidUniforms = (liquidMesh?.material as ShaderMaterial | undefined)?.uniforms;
  const slosh = {
    primed: false,
    angle: 0,
    x: 0,
    y: 0,
    omega: 0,
    liquidOmega: 0,
    vx: 0,
    vy: 0,
    tiltX: 0,
    tiltZ: 0,
    rateX: 0,
    rateZ: 0,
    wave: 0,
    waveTime: 0,
    relAngle: 0,
  };
  const SPRING = 70; // ≈ 1,3 oscillation par seconde
  const DAMPING = 3.4;
  const GRAVITY = 260; // cm/s², volontairement faible : rend les accélérations visibles
  const smooth = (dt: number, rate: number) => 1 - Math.exp(-dt * rate);
  function updateLiquid(dt: number) {
    if (!liquidUniforms) return;
    const angle = spin.rotation.y;
    const x = rig.position.x;
    const y = rig.position.y;
    if (!slosh.primed || dt <= 0) {
      Object.assign(slosh, { primed: true, angle, x, y });
      return;
    }
    let dAngle = angle - slosh.angle;
    let dx = x - slosh.x;
    let dy = y - slosh.y;
    Object.assign(slosh, { angle, x, y });
    // Saut instantané (redimensionnement, lien vers le devis) : pas de secousse.
    if (Math.abs(dAngle) > 1.2) dAngle = 0;
    if (Math.abs(dx) > visibleW * 0.2 || Math.abs(dy) > visibleH * 0.2) dx = dy = 0;

    // Vitesses lissées (le scroll arrive par à-coups) puis accélérations.
    const omega = Math.max(-14, Math.min(14, dAngle / dt));
    const prevOmega = slosh.omega;
    slosh.omega += (omega - slosh.omega) * smooth(dt, 12);
    const alpha = (slosh.omega - prevOmega) / dt;
    const prevVx = slosh.vx;
    const prevVy = slosh.vy;
    slosh.vx += (dx / dt - slosh.vx) * smooth(dt, 12);
    slosh.vy += (dy / dt - slosh.vy) * smooth(dt, 12);
    const ax = (slosh.vx - prevVx) / dt;
    const ay = (slosh.vy - prevVy) / dt;

    // Inclinaison visée, dans le repère de la bouteille avant rotation : surface horizontale
    // malgré la bouteille penchée, déportée par l'accélération (et un peu par les à-coups de rotation).
    const g = Math.max(GRAVITY * 0.4, GRAVITY + ay);
    const targetX = -Math.tan(pose.tiltZ) - ax / g - alpha * 0.009;
    const targetZ = alpha * 0.005;
    slosh.rateX += (SPRING * (targetX - slosh.tiltX) - DAMPING * slosh.rateX) * dt;
    slosh.rateZ += (SPRING * (targetZ - slosh.tiltZ) - DAMPING * slosh.rateZ) * dt;
    slosh.tiltX = Math.max(-0.6, Math.min(0.6, slosh.tiltX + slosh.rateX * dt));
    slosh.tiltZ = Math.max(-0.6, Math.min(0.6, slosh.tiltZ + slosh.rateZ * dt));

    // Le liquide rattrape la rotation de la bouteille avec retard.
    slosh.liquidOmega += (slosh.omega - slosh.liquidOmega) * smooth(dt, 1.6);
    const swirl = Math.min(0.9, slosh.liquidOmega * slosh.liquidOmega * 0.03);
    slosh.relAngle += (slosh.liquidOmega - slosh.omega) * dt;

    // Onde : relancée par les à-coups, amortie en ~2 s.
    slosh.wave = Math.max(slosh.wave * Math.exp(-dt * 1.3), Math.min(0.38, Math.abs(alpha) * 0.012));
    slosh.waveTime += dt;

    // Passage dans le repère local du maillage (qui tourne avec la bouteille).
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    liquidUniforms.uTilt.value.set(
      slosh.tiltX * cos - slosh.tiltZ * sin,
      slosh.tiltX * sin + slosh.tiltZ * cos,
    );
    liquidUniforms.uSwirl.value = swirl;
    liquidUniforms.uWave.value = slosh.wave * Math.cos(slosh.waveTime * 7.5);
    liquidUniforms.uWaveAngle.value = 2 * slosh.relAngle;
  }

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
      // Le liquide est translucide : il laisse voir (et filtre) ce même fond.
      liquidUniforms?.uBackdrop.value.copy(backdrop);
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
      studio.dispose();
      envTarget.dispose();
      renderer.dispose();
    },
  };
}
