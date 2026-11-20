/**
 * cap.ts — capsule à vis en aluminium doré, modélisée d'après la photo de la bouteille.
 * -----------------------------------------------------------------------------
 * Une vraie capsule à vis n'est pas un cylindre strié : de bas en haut, on trouve
 *   1. un bourrelet roulé qui rentre sous la bague du verre ;
 *   2. la bague d'inviolabilité, lisse, séparée du reste par une ligne de rupture (pontets) ;
 *   3. le filetage : l'aluminium est roulé sur le pas de vis du verre, ce qui donne deux gros
 *      bourrelets arrondis, légèrement en hélice ;
 *   4. le moletage, uniquement sur le bandeau du haut (prise des doigts) ;
 *   5. un angle arrondi et le dessus, plat, où le logo est imprimé.
 *
 * Tout est en relief réel (géométrie), pas en texture : les reflets du studio accrochent
 * chaque strie et chaque filet. La surface est décrite par une fonction (angle, hauteur) →
 * point ; chaque zone choisit sa finesse de maillage (le moletage en demande beaucoup, la
 * bague lisse très peu) et les normales sont calculées sur la fonction, donc sans couture.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';

/** Dimensions de la capsule (cm) : 32 mm de diamètre pour 15 mm de haut, comme sur la photo. */
export const CAP = {
  radius: 1.6,
  height: 1.5,
} as const;

/** Or laqué de la capsule (sRGB) et encre rouge du logo imprimé sur le dessus. */
const CAP_GOLD = 0xecc673;
const CAP_INK = 0xb21620;

/** Hauteurs des zones, mesurées depuis le bas de la capsule (cm). */
const ZONE = {
  lip: 0.09,
  score: 0.34,
  thread: 0.42,
  threadEnd: 1.0,
  knurl: 1.06,
  knurlEnd: 1.4,
} as const;
const CORNER = CAP.height - ZONE.knurlEnd; // rayon de l'angle arrondi
const KNURLS = 90;
const BRIDGES = 12;
const THREAD_TURNS = 2;
/** Rayon de la partie plane du dessus (zone imprimée). */
const TOP_RADIUS = CAP.radius + 0.015 - CORNER;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rayon nominal du flanc à une hauteur donnée, sans le relief. */
function baseRadius(y: number): number {
  const R = CAP.radius;
  if (y < ZONE.lip) return R - 0.07 + 0.125 * Math.pow(Math.sin((y / ZONE.lip) * (Math.PI / 2)), 0.8);
  if (y < ZONE.score) return lerp(R + 0.055, R + 0.03, (y - ZONE.lip) / (ZONE.score - ZONE.lip));
  if (y < ZONE.thread) return lerp(R + 0.03, R + 0.01, (y - ZONE.score) / (ZONE.thread - ZONE.score));
  if (y < ZONE.threadEnd) return lerp(R + 0.01, R, (y - ZONE.thread) / (ZONE.threadEnd - ZONE.thread));
  if (y < ZONE.knurl) return lerp(R, R + 0.015, (y - ZONE.threadEnd) / (ZONE.knurl - ZONE.threadEnd));
  return R + 0.015;
}

/** Relief du flanc : écart radial (cm) et « creux » (0–1, sert à assombrir le fond des gorges). */
const relief = { offset: 0, cavity: 0 };
function sideRelief(theta: number, y: number): typeof relief {
  let offset = 0;
  let cavity = 0;

  // Ligne de rupture de la bague d'inviolabilité : une gorge interrompue par des pontets.
  const notch = Math.exp(-Math.pow((y - (ZONE.score + ZONE.thread) / 2) / 0.016, 2));
  if (notch > 1e-3) {
    const open = 1 - smoothstep(0.55, 0.9, Math.cos(BRIDGES * theta));
    offset -= 0.035 * notch * open;
    cavity += notch * open;
  }

  // Filetage roulé : un bourrelet en hélice, qui monte en tournant.
  if (y > ZONE.thread && y < ZONE.threadEnd) {
    const fade = smoothstep(ZONE.thread, ZONE.thread + 0.08, y) * (1 - smoothstep(ZONE.threadEnd - 0.08, ZONE.threadEnd, y));
    const pitch = (ZONE.threadEnd - ZONE.thread) / THREAD_TURNS;
    const phase = (y - ZONE.thread) / pitch - theta / (Math.PI * 2);
    const bump = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    offset += fade * (0.062 * bump - 0.012);
    cavity += fade * (1 - bump) * 0.55;
  }

  // Petite gorge entre le filetage et le moletage.
  if (y > ZONE.threadEnd && y < ZONE.knurl) {
    const dip = Math.sin(((y - ZONE.threadEnd) / (ZONE.knurl - ZONE.threadEnd)) * Math.PI);
    offset -= 0.02 * dip;
    cavity += 0.5 * dip;
  }

  // Moletage : stries verticales, crêtes arrondies et gorges étroites.
  if (y > ZONE.knurl && y < ZONE.knurlEnd) {
    const fade = smoothstep(ZONE.knurl, ZONE.knurl + 0.05, y) * (1 - smoothstep(ZONE.knurlEnd - 0.05, ZONE.knurlEnd, y));
    const groove = 1 - Math.pow(0.5 + 0.5 * Math.cos(KNURLS * theta), 0.75);
    offset -= 0.032 * fade * groove;
    cavity += fade * groove;
  }

  relief.offset = offset;
  relief.cavity = Math.min(1, cavity);
  return relief;
}

/** Une zone de la capsule : (angle, t ∈ [0, 1]) → point, et la valeur de creux en retour. */
type SurfaceFn = (theta: number, t: number, out: Vector3) => number;
interface Band {
  rows: number;
  cols: number;
  surface: SurfaceFn;
  /** Zone imprimée (dessus) : second matériau, UV planaires. */
  print?: boolean;
}

const side =
  (from: number, to: number): SurfaceFn =>
  (theta, t, out) => {
    const y = lerp(from, to, t);
    const { offset, cavity } = sideRelief(theta, y);
    const radius = baseRadius(y) + offset;
    out.set(radius * Math.cos(theta), y, radius * Math.sin(theta));
    return cavity;
  };

const corner: SurfaceFn = (theta, t, out) => {
  const angle = t * (Math.PI / 2);
  const radius = TOP_RADIUS + CORNER * Math.cos(angle);
  out.set(radius * Math.cos(theta), ZONE.knurlEnd + CORNER * Math.sin(angle), radius * Math.sin(theta));
  return 0;
};

const top: SurfaceFn = (theta, t, out) => {
  const radius = TOP_RADIUS * (1 - t);
  // Jonc embouti près du bord : une fine gorge circulaire, comme sur les capsules imprimées.
  const ring = Math.exp(-Math.pow((radius - (TOP_RADIUS - 0.07)) / 0.022, 2));
  out.set(radius * Math.cos(theta), CAP.height - 0.01 * ring, radius * Math.sin(theta));
  return 0;
};

function createCapGeometry(lowPower: boolean): BufferGeometry {
  const plain = lowPower ? 64 : 96;
  const bands: Band[] = [
    { rows: 6, cols: plain, surface: side(0, ZONE.lip) },
    { rows: 2, cols: plain, surface: side(ZONE.lip, ZONE.score) },
    { rows: 8, cols: BRIDGES * (lowPower ? 12 : 20), surface: side(ZONE.score, ZONE.thread) },
    { rows: lowPower ? 28 : 44, cols: lowPower ? 96 : 144, surface: side(ZONE.thread, ZONE.threadEnd) },
    { rows: 4, cols: plain, surface: side(ZONE.threadEnd, ZONE.knurl) },
    { rows: 10, cols: KNURLS * (lowPower ? 4 : 8), surface: side(ZONE.knurl, ZONE.knurlEnd) },
    { rows: 8, cols: plain, surface: corner },
    { rows: 8, cols: plain, surface: top, print: true },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let printStart = 0;

  const point = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const du = new Vector3();
  const dv = new Vector3();
  const normal = new Vector3();
  const inside = new Vector3(0, CAP.height * 0.4, 0);
  const STEP_THETA = 0.0015;
  const STEP_T = 0.004;

  for (const band of bands) {
    const base = positions.length / 3;
    if (band.print) printStart = indices.length;
    for (let j = 0; j <= band.rows; j++) {
      const t = j / band.rows;
      for (let i = 0; i <= band.cols; i++) {
        const theta = (i / band.cols) * Math.PI * 2;
        const cavity = band.surface(theta, t, point);

        // Normale : produit vectoriel des deux tangentes, prises sur la fonction elle-même.
        band.surface(theta + STEP_THETA, t, a);
        band.surface(theta - STEP_THETA, t, b);
        du.subVectors(a, b);
        band.surface(theta, Math.min(1, t + STEP_T), a);
        band.surface(theta, Math.max(0, t - STEP_T), b);
        dv.subVectors(a, b);
        normal.crossVectors(dv, du);
        if (normal.lengthSq() < 1e-16) normal.set(0, 1, 0); // centre du dessus
        normal.normalize();
        if (normal.dot(a.subVectors(point, inside)) < 0) normal.negate(); // toujours vers l'extérieur

        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        const shade = 1 - 0.6 * cavity; // fond des gorges plus sombre (occlusion)
        colors.push(shade, shade, shade);
        if (band.print) uvs.push(0.5 + point.x / (2 * TOP_RADIUS), 0.5 - point.z / (2 * TOP_RADIUS));
        else uvs.push(i / band.cols, t);
      }
    }
    const stride = band.cols + 1;
    for (let j = 0; j < band.rows; j++) {
      for (let i = 0; i < band.cols; i++) {
        const p0 = base + j * stride + i;
        const p1 = p0 + 1;
        const p2 = p0 + stride;
        const p3 = p2 + 1;
        // t monte, l'angle tourne de +x vers +z : cet ordre met la face avant à l'extérieur.
        indices.push(p0, p2, p1, p1, p2, p3);
      }
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(0, printStart, 0);
  geometry.addGroup(printStart, indices.length - printStart, 1);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Textures du dessus imprimé, dérivées de l'image du logo (qui ne sert que de masque d'encre) :
 * - couleur : or de la capsule, encre rouge, et un fin cercle rouge autour de la fleur ;
 * - surface : canal vert = rugosité, bleu = métal (convention Three.js). L'encre est mate et
 *   non métallique, l'or reste du métal laqué.
 */
function createPrintTextures(
  logo: Texture,
  roughness: number,
  ink: number,
): { map: CanvasTexture; surface: CanvasTexture } {
  const image = logo.image as CanvasImageSource & { width: number; height: number };
  const size = Math.min(1024, image.width);
  const read = document.createElement('canvas');
  read.width = read.height = size;
  const ctx = read.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, size, size);
  const source = ctx.getImageData(0, 0, size, size).data;

  const colorCanvas = document.createElement('canvas');
  const surfaceCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = surfaceCanvas.width = surfaceCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d')!;
  const surfaceCtx = surfaceCanvas.getContext('2d')!;
  const color = colorCtx.createImageData(size, size);
  const surface = surfaceCtx.createImageData(size, size);

  const gold = [(CAP_GOLD >> 16) & 255, (CAP_GOLD >> 8) & 255, CAP_GOLD & 255];
  const inkColor = [(ink >> 16) & 255, (ink >> 8) & 255, ink & 255];
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Encre de la fleur : rouge nettement au-dessus du vert dans l'image source.
      let ink = clamp01((source[i] - source[i + 1] - 50) / 50);
      // Cercle fin autour de la fleur.
      const distance = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      ink = Math.max(ink, 1 - smoothstep(0.0045, 0.0075, Math.abs(distance - 0.83)));
      color.data[i] = lerp(gold[0], inkColor[0], ink);
      color.data[i + 1] = lerp(gold[1], inkColor[1], ink);
      color.data[i + 2] = lerp(gold[2], inkColor[2], ink);
      color.data[i + 3] = 255;
      surface.data[i] = 0;
      surface.data[i + 1] = 255 * lerp(roughness, 0.5, ink);
      surface.data[i + 2] = 255 * (1 - 0.92 * ink);
      surface.data[i + 3] = 255;
    }
  }
  colorCtx.putImageData(color, 0, 0);
  surfaceCtx.putImageData(surface, 0, 0);

  const map = new CanvasTexture(colorCanvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = logo.anisotropy;
  const surfaceMap = new CanvasTexture(surfaceCanvas);
  surfaceMap.anisotropy = logo.anisotropy;
  return { map, surface: surfaceMap };
}

export interface CapOptions {
  /** Image du logo (public/textures/cap.png) : sert de masque pour l'encre du dessus. */
  logo: Texture;
  /** Environnement reflété par le métal (voir studio.ts). */
  environment: Texture;
  /** Maillage allégé (mobile). */
  lowPower?: boolean;
  /** Couleur de l'encre du logo (sRGB) ; par défaut le rouge de la palette classique. */
  ink?: number;
}

/** Capsule complète, origine au centre de sa base, axe Y vers le haut. */
export function createCap({ logo, environment, lowPower = false, ink = CAP_INK }: CapOptions): Mesh {
  const ROUGHNESS = 0.24;
  const lacquer = {
    metalness: 1,
    // Vernis de la capsule : un second reflet, net, par-dessus le métal satiné.
    clearcoat: 0.45,
    clearcoatRoughness: 0.12,
    envMap: environment,
    envMapIntensity: 1,
  };
  const gold = new MeshPhysicalMaterial({ ...lacquer, color: CAP_GOLD, roughness: ROUGHNESS, vertexColors: true });
  const { map, surface } = createPrintTextures(logo, ROUGHNESS, ink);
  const print = new MeshPhysicalMaterial({ ...lacquer, map, roughness: 1, roughnessMap: surface, metalnessMap: surface });

  const cap = new Mesh(createCapGeometry(lowPower), [gold, print]);
  cap.name = 'Cap';
  return cap;
}
