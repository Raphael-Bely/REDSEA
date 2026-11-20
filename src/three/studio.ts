/**
 * studio.ts — le studio photo que reflètent le verre, la capsule et les gouttes.
 * -----------------------------------------------------------------------------
 * Tout est calculé dans un seul shader, sur un dôme, puis préfiltré (PMREM) : pas d'image HDR à
 * télécharger. La disposition reprend celle de la photo de référence :
 *
 *   - un cyclo clair derrière la bouteille (le « mur ») et une table crème sous l'horizon :
 *     le métal doré reste lumineux partout, comme sur la photo ;
 *   - une grande boîte à lumière à l'avant-gauche (lumière principale) et une plus étroite à
 *     droite : sur un cylindre, chacune devient un long reflet vertical ;
 *   - deux filets très lumineux à l'arrière : ils dessinent les arêtes du verre ;
 *   - une boîte en douche, au-dessus et en arrière : dessus de la capsule et épaule.
 *
 * Repère : +z vers la caméra, +x à droite, +y vers le haut. L'azimut est mesuré depuis la caméra
 * (0) vers la droite (+90°) ; ±180° = derrière la bouteille.
 *
 * Un point du cylindre dont la normale fait l'angle φ avec la caméra reflète l'azimut 2φ : la
 * boîte principale (−58°) apparaît donc à gauche du centre, à x ≈ −0,48 rayon.
 */
import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Texture,
  type WebGLRenderer,
} from 'three';

/** Direction de la lumière principale (vers la source), dans le repère de la caméra. */
export const KEY_LIGHT_DIRECTION = [-0.72, 0.46, 0.52] as const;

const STUDIO_FRAGMENT = /* glsl */ `
  varying vec3 vDirection;

  float window(float x, float halfSize, float softness) {
    return 1.0 - smoothstep(halfSize * (1.0 - softness), halfSize * (1.0 + softness), abs(x));
  }
  float wrapAngle(float a) {
    return atan(sin(a), cos(a));
  }
  /** Boîte à lumière rectangulaire à bords doux, définie en azimut / élévation (radians). */
  float softbox(float az, float el, float az0, float el0, float halfWidth, float halfHeight, float softness) {
    return window(wrapAngle(az - az0), halfWidth, softness) * window(el - el0, halfHeight, softness * 0.5);
  }

  void main() {
    vec3 d = normalize(vDirection);
    float az = atan(d.x, d.z);
    float el = asin(clamp(d.y, -1.0, 1.0));

    // Cyclo : clair derrière la bouteille, pénombre chaude côté caméra, plus lumineux vers le haut.
    float behind = smoothstep(0.45, -0.4, d.z);
    vec3 wall = mix(vec3(0.34, 0.3, 0.26), vec3(1.0, 0.95, 0.87), behind);
    wall *= mix(0.8, 1.12, smoothstep(-0.1, 0.8, d.y));
    // Les côtés du cyclo sont un peu plus sombres (drapeaux noirs) : ils modèlent les bords.
    wall *= 1.0 - 0.3 * window(abs(wrapAngle(az)) - radians(100.0), radians(22.0), 0.6);

    // Table crème : rebond chaud sous l'horizon, plus dense au pied de la bouteille.
    vec3 table = vec3(0.7, 0.62, 0.5) * mix(1.0, 0.6, smoothstep(-0.05, -0.9, d.y));
    vec3 color = mix(wall, table, smoothstep(0.03, -0.08, d.y));

    // Lumière principale : grande boîte à l'avant-gauche.
    color += vec3(1.0, 0.97, 0.93) * 5.5 * softbox(az, el, radians(-58.0), radians(20.0), radians(15.0), radians(44.0), 0.45);
    // Débouchage : boîte plus étroite à droite.
    color += vec3(1.0, 0.98, 0.96) * 3.0 * softbox(az, el, radians(72.0), radians(12.0), radians(8.5), radians(40.0), 0.5);
    // Contre-jours : deux filets à l'arrière, qui dessinent les arêtes.
    color += vec3(1.0, 1.0, 1.0) * 24.0 * softbox(az, el, radians(-150.0), radians(10.0), radians(2.0), radians(42.0), 0.5);
    color += vec3(1.0, 0.96, 0.9) * 15.0 * softbox(az, el, radians(141.0), radians(10.0), radians(1.5), radians(38.0), 0.5);
    // Douche : boîte au-dessus, légèrement en arrière.
    float overhead = smoothstep(cos(radians(36.0)), cos(radians(20.0)), dot(d, normalize(vec3(-0.1, 0.86, -0.45))));
    color += vec3(1.0, 0.98, 0.95) * 3.4 * overhead;

    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Construit le studio et renvoie sa texture d'environnement préfiltrée (à libérer avec `dispose()`). */
export function createStudioEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();
  const dome = new Mesh(
    new SphereGeometry(40, 48, 24),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: STUDIO_FRAGMENT,
    }),
  );
  scene.add(dome);
  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.012, 0.1, 100);
  pmrem.dispose();
  dome.geometry.dispose();
  dome.material.dispose();
  return target.texture;
}
