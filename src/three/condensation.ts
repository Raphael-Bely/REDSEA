/**
 * condensation.ts — gouttes de condensation sur le verre et l'étiquette, d'après la photo.
 * -----------------------------------------------------------------------------
 * Ce qu'on voit sur la photo, et que ce module reproduit :
 *   - trois échelles mêlées : une brume de micro-gouttes (quelques dixièmes de millimètre),
 *     beaucoup de petites perles, quelques grosses gouttes ovales ou en larme ;
 *   - chaque goutte est une petite lentille : un point de lumière net du côté de la lumière
 *     (en haut à gauche), l'intérieur assombri autour de ce point, et une lueur sur le bord
 *     opposé, là où la lumière ressort concentrée (en bas à droite) ;
 *   - un liseré sombre sur le pourtour et une courte ombre portée ;
 *   - des contours irréguliers : aucune goutte n'est un cercle parfait.
 *
 * Les gouttes sont de vrais dômes en relief (elles dépassent de la silhouette), instanciés.
 * Leur matière n'est pas calculée par réfraction : un shader dédié dessine directement ces
 * effets de lentille, puis assombrit et éclaire ce qui se trouve derrière (alpha prémultiplié :
 * couleur = lumière ajoutée, alpha = assombrissement). C'est plus fidèle à la photo à cette
 * échelle, et bien moins coûteux qu'un matériau transparent physique.
 */
import {
  BufferGeometry,
  type Color,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  ShaderMaterial,
  type Vector2,
  Vector3,
} from 'three';
import { KEY_LIGHT_DIRECTION } from './studio';

/** Sinus de l'angle de contact de l'eau sur le verre (≈ 55°) : fixe le bombé des gouttes. */
const CONTACT_SIN = 0.82;
/** Rayon de la collerette (ombre portée) autour d'une goutte, en rayons de goutte. */
const SKIRT = 1.6;

/** Lumière de débouchage (boîte de droite), repère caméra : éclaire les gouttes du flanc droit. */
const FILL_LIGHT_DIRECTION = [0.9, 0.22, 0.36] as const;

export interface CondensationOptions {
  /** Profil extérieur du verre : (rayon, hauteur), de la base au goulot. */
  profile: Vector2[];
  /** Zone couverte sur le verre (cm). */
  bottom: number;
  top: number;
  bodyRadius: number;
  labelRadius: number;
  labelBottom: number;
  labelTop: number;
  /** Niveau du liquide : au-dessus, les gouttes sont posées sur du verre vide. */
  fillLevel: number;
  /** Couleur du fond de page (instance partagée, mise à jour par le contrôleur). */
  backdrop: Color;
}

interface DropClass {
  name: string;
  count: number;
  /** Rayon (cm). */
  min: number;
  max: number;
  /** Part conservée sur l'étiquette : le papier retient moins de gouttes que le verre froid. */
  onLabel: number;
  /** Allongement vertical et forme en larme (gravité), maximum de la classe. */
  stretch: number;
  tear: number;
  /** Irrégularité du contour. */
  wobble: number;
  /** Les perles ne se chevauchent pas ; la brume, si. */
  exclusive: boolean;
  geometry: () => BufferGeometry;
}

/** Dôme en calotte sphérique : sommet, anneaux concentriques, collerette plate facultative. */
function createDropGeometry(sectors: number, rings: number, skirt: boolean): BufferGeometry {
  const cos = Math.sqrt(1 - CONTACT_SIN * CONTACT_SIN);
  const height = (rho: number) => (Math.sqrt(1 - rho * rho * CONTACT_SIN * CONTACT_SIN) - cos) / CONTACT_SIN;
  const positions: number[] = [0, 0, height(0)];
  const ringCount = rings + (skirt ? 1 : 0);
  for (let j = 1; j <= ringCount; j++) {
    const rho = j <= rings ? j / rings : SKIRT;
    const z = j <= rings ? height(rho) : 0;
    for (let i = 0; i < sectors; i++) {
      const angle = (i / sectors) * Math.PI * 2;
      positions.push(rho * Math.cos(angle), rho * Math.sin(angle), z);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < sectors; i++) indices.push(0, 1 + i, 1 + ((i + 1) % sectors));
  for (let j = 0; j < ringCount - 1; j++) {
    const inner = 1 + j * sectors;
    const outer = inner + sectors;
    for (let i = 0; i < sectors; i++) {
      const next = (i + 1) % sectors;
      indices.push(inner + i, outer + i, outer + next, inner + i, outer + next, inner + next);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

const DROP_CLASSES: DropClass[] = [
  {
    name: 'Large',
    count: 44,
    min: 0.125,
    max: 0.2,
    onLabel: 0.1,
    stretch: 0.45,
    tear: 0.8,
    wobble: 0.1,
    exclusive: true,
    geometry: () => createDropGeometry(16, 4, true),
  },
  {
    name: 'Medium',
    count: 300,
    min: 0.065,
    max: 0.12,
    onLabel: 0.3,
    stretch: 0.25,
    tear: 0.45,
    wobble: 0.09,
    exclusive: true,
    geometry: () => createDropGeometry(12, 3, true),
  },
  {
    name: 'Small',
    count: 1700,
    min: 0.028,
    max: 0.062,
    onLabel: 0.3,
    stretch: 0.1,
    tear: 0.15,
    wobble: 0.06,
    exclusive: true,
    geometry: () => createDropGeometry(8, 2, false),
  },
  {
    name: 'Mist',
    count: 7000,
    min: 0.011,
    max: 0.026,
    onLabel: 0.08,
    stretch: 0,
    tear: 0,
    wobble: 0,
    exclusive: false,
    geometry: () => createDropGeometry(6, 1, false),
  },
];

/** Rayon du verre et pente de la paroi par pas de 0,02 cm de hauteur. */
function buildSurfaceLookup(profile: Vector2[], top: number) {
  const STEP = 0.02;
  const count = Math.ceil(top / STEP) + 2;
  const radius = new Float32Array(count);
  const slope = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const height = n * STEP;
    for (let i = 1; i < profile.length; i++) {
      const a = profile[i - 1];
      const b = profile[i];
      if (b.y - a.y < 1e-4 || height < a.y || height > b.y) continue; // seule la paroi montante compte
      const t = (height - a.y) / (b.y - a.y);
      radius[n] = a.x + (b.x - a.x) * t;
      slope[n] = (b.x - a.x) / (b.y - a.y);
      break;
    }
  }
  return (height: number) => {
    const n = Math.min(count - 1, Math.max(0, Math.round(height / STEP)));
    return { radius: radius[n], slope: slope[n] };
  };
}

/** Grille spatiale : retrouve vite les gouttes voisines pour éviter les chevauchements. */
class DropGrid {
  private readonly cells = new Map<number, number[]>();
  private readonly drops: number[] = []; // x, y, z, rayon
  constructor(private readonly cell: number) {}

  private key(ix: number, iy: number, iz: number) {
    return ((ix + 64) << 14) | ((iy + 64) << 7) | (iz + 64);
  }

  /** Vrai si une goutte déjà posée touche la sphère (x, y, z, rayon · marge). */
  overlaps(x: number, y: number, z: number, radius: number, margin: number): boolean {
    const ix = Math.floor(x / this.cell);
    const iy = Math.floor(y / this.cell);
    const iz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.cells.get(this.key(ix + dx, iy + dy, iz + dz));
          if (!bucket) continue;
          for (const index of bucket) {
            const reach = (this.drops[index + 3] + radius) * margin;
            const ddx = this.drops[index] - x;
            const ddy = this.drops[index + 1] - y;
            const ddz = this.drops[index + 2] - z;
            if (ddx * ddx + ddy * ddy + ddz * ddz < reach * reach) return true;
          }
        }
      }
    }
    return false;
  }

  add(x: number, y: number, z: number, radius: number) {
    const index = this.drops.length;
    this.drops.push(x, y, z, radius);
    const key = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell), Math.floor(z / this.cell));
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(index);
    else this.cells.set(key, [index]);
  }
}

function createDropMaterial(backdrop: Color): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true, // couleur = lumière ajoutée, alpha = assombrissement du fond
    depthWrite: false,
    // Les dômes sont posés sur la paroi : ce décalage évite qu'ils ne scintillent contre elle.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    uniforms: {
      uKeyLight: { value: new Vector3(...KEY_LIGHT_DIRECTION).normalize() },
      uFillLight: { value: new Vector3(...FILL_LIGHT_DIRECTION).normalize() },
      uBackdrop: { value: backdrop },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aShape; // x : larme (0–1), y : phase, z : irrégularité du contour, w : aléa
      attribute float aKind; // 0 : verre devant le liquide, 1 : étiquette, 2 : verre vide
      uniform vec3 uKeyLight;
      uniform vec3 uFillLight;
      uniform vec3 uBackdrop;
      varying vec2 vDisc;      // position dans le disque de la goutte (rayon 1 au bord)
      varying vec3 vKey;       // lumières et regard dans le repère de la goutte (x, y : plan ; z : normale)
      varying vec3 vFill;
      varying vec3 vEye;
      varying vec3 vGlow;      // teinte de la lueur intérieure
      varying float vShade;    // force de l'assombrissement
      varying float vGloss;    // finesse du point de lumière

      void main() {
        vec3 p = position;
        vDisc = p.xy;
        float rho = length(p.xy);
        float angle = atan(p.y, p.x);

        // Contour irrégulier, puis forme en larme : pointe vers le haut, ventre vers le bas.
        float lobes = cos(2.0 * angle + aShape.y) * 0.6 + cos(3.0 * angle - aShape.y * 1.7) * 0.4;
        p.xy *= 1.0 + aShape.z * lobes * smoothstep(0.0, 0.7, rho);
        float upper = max(p.y, 0.0);
        p.x *= 1.0 - aShape.x * 0.6 * smoothstep(0.0, 1.1, upper);
        p.y += aShape.x * 0.5 * upper;

        mat4 frame = modelViewMatrix * instanceMatrix;
        vec4 viewPosition = frame * vec4(p, 1.0);
        vec3 axisX = normalize(frame[0].xyz);
        vec3 axisY = normalize(frame[1].xyz);
        vec3 axisZ = normalize(frame[2].xyz);
        vec3 eye = normalize(-(frame * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        vKey = vec3(dot(uKeyLight, axisX), dot(uKeyLight, axisY), dot(uKeyLight, axisZ));
        vFill = vec3(dot(uFillLight, axisX), dot(uFillLight, axisY), dot(uFillLight, axisZ));
        vEye = vec3(dot(eye, axisX), dot(eye, axisY), dot(eye, axisZ));

        // Ce que la goutte éclaire dépend de ce qu'il y a derrière elle.
        vec3 backdrop = pow(uBackdrop, vec3(1.0 / 2.2));
        if (aKind < 0.5) {
          vGlow = vec3(0.56, 0.1, 0.09); // devant le bissap : rubis lumineux
          vShade = 1.0;
        } else if (aKind < 1.5) {
          vGlow = vec3(0.17, 0.155, 0.12); // sur le papier : un éclat discret
          vShade = 0.62;
        } else {
          vGlow = backdrop * 0.2 + 0.03; // sur le verre vide : la couleur du fond, en plus clair
          vShade = 0.78;
        }

        // Une micro-goutte ne fait qu'un ou deux pixels : son reflet doit en couvrir une bonne part.
        float size = length(instanceMatrix[0].xyz);
        vGloss = mix(46.0, 230.0, smoothstep(0.02, 0.09, size));

        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vDisc;
      varying vec3 vKey;
      varying vec3 vFill;
      varying vec3 vEye;
      varying vec3 vGlow;
      varying float vShade;
      varying float vGloss;

      const float CONTACT = ${CONTACT_SIN.toFixed(3)};
      const float SKIRT = ${SKIRT.toFixed(2)};

      /**
       * Effet d'une lumière sur la goutte.
       * x : point de lumière (reflet), y : lueur sur le bord opposé (lumière concentrée),
       * z : assombrissement côté lumière, w : la goutte reçoit-elle cette lumière ?
       */
      vec4 lens(vec3 light, vec3 eye, vec3 normal, float rho) {
        float lit = smoothstep(-0.12, 0.3, light.z);
        vec2 side = normalize(light.xy + vec2(1e-4, 0.0));
        float across = dot(vDisc, side); // +1 : bord tourné vers la lumière, −1 : bord opposé
        float gloss = pow(max(dot(normal, normalize(light + eye)), 0.0), vGloss);
        float halo = pow(max(dot(normal, normalize(light + eye)), 0.0), 30.0) * 0.16;
        float glow = smoothstep(0.0, 0.85, -across) * (1.0 - smoothstep(0.82, 1.0, rho)) * smoothstep(0.1, 0.7, rho);
        float shade = smoothstep(-0.35, 0.75, across) * smoothstep(0.05, 0.85, rho);
        return vec4(gloss + halo, glow, shade, lit);
      }

      void main() {
        float r2 = dot(vDisc, vDisc);
        float rho = sqrt(r2);
        vec3 key = normalize(vKey);
        vec3 fill = normalize(vFill);
        vec3 eye = normalize(vEye);

        vec3 light = vec3(0.0);
        float dark = 0.0;
        if (rho <= 1.0) {
          vec3 normal = vec3(vDisc * CONTACT, sqrt(1.0 - r2 * CONTACT * CONTACT));
          vec4 a = lens(key, eye, normal, rho);
          vec4 b = lens(fill, eye, normal, rho);
          float keyWeight = a.w;
          float fillWeight = b.w * 0.55;

          light += vec3(1.0, 0.985, 0.96) * (a.x * keyWeight + b.x * fillWeight);
          light += vGlow * (a.y * keyWeight + b.y * fillWeight * 0.7);

          // Liseré sombre du pourtour, plus marqué du côté de la lumière principale.
          float rim = smoothstep(0.74, 0.97, rho) * (0.62 + 0.38 * dot(vDisc, normalize(key.xy + vec2(1e-4, 0.0))));
          float shade = mix(0.55, a.z, keyWeight);
          dark = (0.36 * shade + 0.5 * rim) * vShade;
        } else {
          // Collerette : courte ombre portée, du côté opposé à la lumière.
          float away = -dot(vDisc / rho, normalize(key.xy + vec2(1e-4, 0.0)));
          dark = (1.0 - smoothstep(1.0, SKIRT, rho)) * smoothstep(-0.2, 0.8, away) * 0.3 * vShade;
        }
        gl_FragColor = vec4(light, clamp(dark, 0.0, 0.85));
      }
    `,
  });
}

/** Groupe « Condensation » : un maillage instancié par taille de goutte, un seul matériau. */
export function createCondensation(options: CondensationOptions): Group {
  const { bottom, top, bodyRadius, labelRadius, labelBottom, labelTop, fillLevel } = options;
  const surfaceAt = buildSurfaceLookup(options.profile, top);
  const material = createDropMaterial(options.backdrop);
  const group = new Group();
  group.name = 'Condensation';

  // Générateur déterministe : mêmes gouttes à chaque visite.
  let seed = 20261116;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const grid = new DropGrid(0.6);
  const matrix = new Matrix4();
  const normal = new Vector3();
  const around = new Vector3();
  const along = new Vector3();
  const axisX = new Vector3();
  const axisY = new Vector3();
  const axisZ = new Vector3();

  DROP_CLASSES.forEach((spec, order) => {
    const geometry = spec.geometry();
    const mesh = new InstancedMesh(geometry, material, spec.count);
    mesh.name = `Condensation${spec.name}`;
    mesh.renderOrder = 3 + order; // les grosses d'abord, la brume par-dessus : sans importance visuelle, mais stable
    const shapes = new Float32Array(spec.count * 4);
    const kinds = new Float32Array(spec.count);

    let placed = 0;
    for (let guard = 0; placed < spec.count && guard < spec.count * 40; guard++) {
      const height = bottom + rand() * (top - bottom);
      const onLabel = height > labelBottom && height < labelTop;
      const surface = surfaceAt(height);
      const radius = onLabel ? labelRadius : surface.radius;
      if (radius <= 0) continue;
      // Densité proportionnelle à la circonférence ; le papier retient moins de gouttes.
      if (rand() > (radius / bodyRadius) * (onLabel ? spec.onLabel : 1)) continue;

      const size = spec.min + (spec.max - spec.min) * Math.pow(rand(), 1.7);
      const angle = rand() * Math.PI * 2;
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      const x = sin * radius;
      const z = cos * radius;
      if (spec.exclusive ? grid.overlaps(x, height, z, size, 0.92) : grid.overlaps(x, height, z, 0, 0.9)) continue;
      if (spec.exclusive) grid.add(x, height, z, size);

      const slope = onLabel ? 0 : surface.slope;
      normal.set(sin, -slope, cos).normalize(); // normale sortante de la paroi
      around.set(cos, 0, -sin); // tangente horizontale
      along.crossVectors(normal, around).normalize(); // tangente montante

      // Forme : les grosses gouttes s'allongent et prennent une forme de larme sous leur poids.
      const weight = (size - spec.min) / (spec.max - spec.min);
      const stretch = 1 + spec.stretch * (0.3 + 0.7 * weight) * rand();
      const tear = spec.tear * weight * rand();
      const twist = (rand() - 0.5) * 0.5; // aucune goutte n'est parfaitement d'aplomb
      const bulge = 0.8 + rand() * 0.3;
      axisX.copy(around).multiplyScalar(Math.cos(twist)).addScaledVector(along, Math.sin(twist));
      axisY.copy(along).multiplyScalar(Math.cos(twist)).addScaledVector(around, -Math.sin(twist));
      axisZ.copy(normal);
      matrix.makeBasis(
        axisX.multiplyScalar(size / Math.sqrt(stretch)),
        axisY.multiplyScalar(size * Math.sqrt(stretch)),
        axisZ.multiplyScalar(size * bulge),
      );
      // Posée juste au-dessus de la paroi ; une goutte allongée pend sous son point d'accroche.
      const lift = 0.004;
      const sag = size * (stretch - 1) * 0.5;
      matrix.setPosition(
        x + normal.x * lift - along.x * sag,
        height + normal.y * lift - along.y * sag,
        z + normal.z * lift - along.z * sag,
      );
      mesh.setMatrixAt(placed, matrix);
      shapes.set([tear, rand() * Math.PI * 2, spec.wobble * (0.4 + 0.6 * rand()), rand()], placed * 4);
      kinds[placed] = onLabel ? 1 : height > fillLevel ? 2 : 0;
      placed++;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    geometry.setAttribute('aShape', new InstancedBufferAttribute(shapes, 4));
    geometry.setAttribute('aKind', new InstancedBufferAttribute(kinds, 1));
    group.add(mesh);
  });

  return group;
}
