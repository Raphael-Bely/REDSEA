# REDSEA — site vitrine

One-page B2B pour REDSEA, bissap en bouteille verre 33 cl (infusion de fleurs d'hibiscus du Sénégal, fabriquée à la Brasserie Gasconha, Pessac). Cible : bars, cafés, restaurants. Pas de vente en ligne, pas de compte, pas de cookie.

- **Astro 7** en sortie statique + **une seule** route serveur (`/api/devis`)
- **GSAP + ScrollTrigger** (animations), **Lenis** (smooth scroll)
- **Three.js** pour la bouteille 3D procédurale, chargé à la demande
- CSS natif (custom properties, `clamp()`), TypeScript, zod côté serveur
- Déploiement prévu sur **Vercel** (adaptateur `@astrojs/vercel`)

---

## 1. Installation

Prérequis : **Node.js ≥ 22.23** (exigé par Astro 7 ; un fichier `.nvmrc` est fourni).

```bash
nvm use
```

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run dev
```

Le site tourne sur `http://localhost:4321`.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production (statique + fonction `/api/devis`) |
| `npm run check` | vérification TypeScript / Astro |

En développement, **sans clé Resend ni Turnstile**, le formulaire fonctionne quand même : la demande est validée puis simplement affichée dans la console du serveur (rien n'est envoyé). En production, sans ces clés, le formulaire répond « momentanément indisponible » : il ne s'ouvre jamais sans protection.

Paramètres d'URL utiles pour tester : `?bottle=3d` force la scène 3D, `?bottle=fallback` force l'image de secours.

### Deux éditions : beige & rouge, noir & rose

Le site existe en deux éditions, comme l'étiquette :

| Édition | Étiquette | Site |
| --- | --- | --- |
| **classique** | beige, lettres rouges facettées (`beige.pdf`) | beige et rouge |
| **noir** | noire, lettres roses facettées (`rose.pdf`) | noir et rose |

**Le visiteur choisit** pendant sa visite :

- avec les deux **pastilles de l'en-tête** (beige/rouge, noir/rose), sur toutes les pages ;
- ou, clin d'œil, en **« dévissant » la capsule** : survoler le haut de la bouteille fait apparaître « Dévisser » sous le curseur, un clic la fait tourner et change d'édition.

Sur l'accueil, un rideau aux couleurs de l'édition suivante monte et l'annonce, le site et la bouteille (nouvelle étiquette, nouvelle encre de capsule) changent derrière lui. Le choix est gardé le temps de la visite (`sessionStorage`), pages légales comprises ; une nouvelle visite repart sur l'édition par défaut.

**Édition par défaut**, choisie au lancement :

| Commande | Édition par défaut |
| --- | --- |
| `npm run dev` | classique |
| `npm run dev --noir` | noir |
| `npm run build --noir` | build de production, noir par défaut |

Au démarrage, la console indique l'édition par défaut (`[redsea-palette] Palette « noir » …`). En ligne, la variable d'environnement `REDSEA_PALETTE=noir` (Netlify ou Vercel) fait de même.

Où ça se règle :

- **couleurs** : jetons CSS dans `src/styles/global.css` (bloc `:root[data-palette='noir']`). Les rôles s'inversent : le fond beige devient noir, le rouge devient le rose de l'étiquette, les sections sombres (devis, pied de page) passent en rose pâle ; sur les fonds roses, l'or devient un bronze foncé pour rester lisible ;
- **textures de la bouteille, nom des éditions, couleurs du rideau** : `src/palette.ts` ;
- **changement d'édition** : `src/scripts/edition.ts` (pastilles), `public/edition.js` (choix appliqué avant le premier affichage), `switchEdition()` dans `src/scripts/main.ts` (rideau, bouteille reconstruite) ;
- **lettres facettées** : comme « REDSEA » et « BISSAP » sur les étiquettes, les grands titres (hero, arguments, rideau « Devis », pages légales) sont remplis d'un motif de triangles dans les teintes de l'étiquette de l'édition (`public/textures/<édition>/lowpoly.png`, règle `background-clip: text` dans `global.css`). Image PNG et non SVG : un SVG de ~1500 triangles est redessiné à chaque image quand les lettres bougent, ce qui saccadait (surtout sous Firefox) ;
- **étiquettes et motifs** : générés depuis `beige.pdf` et `rose.pdf` par `python3 scripts/prepare-labels.py` (recadrage sur l'étiquette, retrait des 8 mm recouverts par le recouvrement, logo recalé face caméra, teintes des facettes relevées sur l'étiquette) → `public/textures/beige/` et `public/textures/noir/`. À relancer si un PDF change.

Non décliné par édition pour l'instant : l'image de secours de la bouteille (photo de l'ancienne étiquette, affichée sans WebGL ou avec « réduire les animations »), l'image de partage `og.jpg` et les favicons.

---

## 2. Ce qu'il reste à remplir

Tout le contenu est centralisé dans **`src/content/site.ts`**. Chercher `À REMPLIR` :

| Où | Quoi |
| --- | --- |
| `legal.editor.phone` | téléphone de l'éditeur (obligatoire pour un entrepreneur individuel, loi LCEN art. 6) |

Déjà rempli : textes « Qui sommes-nous » et « Ce qu'il y a dans la bouteille », email de contact et d'exercice des droits RGPD (`redseabissap@gmail.com`), destinataire des devis, éditeur (Badra MOHAMED EI, SIREN 131 465 403, RNE, source : annuaire-entreprises.data.gouv.fr), directeur de la publication, hébergeur (Netlify, Inc.), base des transferts hors UE (Data Privacy Framework : Netlify, Resend, Cloudflare). Si l'hébergeur change (Vercel…), mettre à jour `legal.host` et le tableau des sous-traitants de `confidentialite.astro`. Si la marque REDSEA est déposée à l'INPI, ajouter son numéro dans « Propriété intellectuelle ».

Faire relire les deux pages légales par un juriste avant mise en ligne : la structure est complète (articles 13–14 RGPD), mais le contenu dépend de votre situation.

**Aucune allégation santé** dans les textes (pas de « antioxydant », « bon pour… ») : elles sont encadrées par le règlement (CE) 1924/2006.

---

## 3. Variables d'environnement

Aucune adresse, clé ou URL de webhook n'est dans le code ni dans le dépôt. Tout passe par des variables d'environnement, déclarées et typées dans `astro.config.mjs` (`env.schema`).

| Variable | Côté | Obligatoire | Rôle |
| --- | --- | --- | --- |
| `SITE_URL` | build | oui en prod | URL publique sans slash final (canonical, Open Graph, sitemap) |
| `RESEND_API_KEY` | serveur | oui | clé API Resend |
| `QUOTE_RECIPIENT_EMAIL` | serveur | oui | adresse qui reçoit les demandes de devis |
| `QUOTE_SENDER_EMAIL` | serveur | non | expéditeur. Défaut : `REDSEA Devis <onboarding@resend.dev>` |
| `SLACK_WEBHOOK_URL` | serveur | non | Incoming Webhook Slack. Vide = Slack ignoré |
| `PUBLIC_TURNSTILE_SITE_KEY` | client | oui | clé publique Turnstile (visible dans le HTML, c'est normal) |
| `TURNSTILE_SECRET_KEY` | serveur | oui | clé secrète Turnstile |

En local : fichier `.env` (ignoré par git). En production : Vercel → Project → Settings → Environment Variables, puis redéployer.

### Resend (email)

1. Créer un compte sur resend.com, puis **API Keys → Create API Key** (permission « Sending access »). La coller dans `RESEND_API_KEY`.
2. Renseigner `QUOTE_RECIPIENT_EMAIL`.
3. **Tant qu'aucun domaine n'est vérifié**, garder l'expéditeur par défaut `onboarding@resend.dev`. Limite Resend dans ce mode : les emails ne partent que vers l'adresse du compte Resend. `QUOTE_RECIPIENT_EMAIL` doit donc être cette adresse.
4. **Passer à un domaine vérifié** (aucun changement de code) :
   - Resend → **Domains → Add Domain** (un sous-domaine d'envoi du type `mail.mondomaine.fr` est conseillé) ;
   - ajouter chez votre registrar les enregistrements DNS affichés par Resend : **SPF** (un `TXT` et un `MX` sur le sous-domaine d'envoi) et **DKIM** (un `TXT` `resend._domainkey`). Ajouter aussi un **DMARC** (`TXT` `_dmarc`, par exemple `v=DMARC1; p=none; rua=mailto:…`) ;
   - attendre le statut « Verified », puis définir `QUOTE_SENDER_EMAIL="REDSEA Devis <devis@mondomaine.fr>"` et redéployer.

L'email part avec `Reply-To` = l'adresse du prospect : répondre écrit directement au prospect. Sujet : `Devis REDSEA — {établissement} ({ville})`. Corps HTML + version texte.

### Slack (optionnel)

1. api.slack.com/apps → **Create New App → From scratch**.
2. **Incoming Webhooks** → activer → **Add New Webhook to Workspace** → choisir le canal.
3. Copier l'URL `https://hooks.slack.com/services/…` dans `SLACK_WEBHOOK_URL`.
4. Slack devient alors un sous-traitant : **remettre sa ligne** dans le tableau des prestataires de `src/pages/confidentialite.astro` (retirée tant que Slack n'est pas utilisé).

Le message est formaté en Block Kit. Un échec Slack est journalisé mais **ne fait jamais échouer** l'envoi de l'email. Cette URL est un secret : ne jamais la committer.

### Cloudflare Turnstile (anti-robot sans cookie)

1. Tableau de bord Cloudflare → **Turnstile → Add widget**. Ajouter le domaine de production (et `localhost` pour tester). Mode « Managed ».
2. Copier la **Site Key** dans `PUBLIC_TURNSTILE_SITE_KEY` et la **Secret Key** dans `TURNSTILE_SECRET_KEY`.

Le script Turnstile n'est chargé que lorsque le visiteur approche du formulaire. Pour tester sans compte, Cloudflare fournit des clés qui valident toujours : `1x00000000000000000000AA` (site) et `1x0000000000000000000000000000000AA` (secret).

---

## 4. Déploiement (Netlify ou Vercel)

L'hébergeur est détecté au build (`astro.config.mjs`) : l'adaptateur Netlify ou Vercel est choisi automatiquement. Seule la route `/api/devis` devient une fonction serveur ; tout le reste est statique.

**Netlify** (offre gratuite, sans limite de durée) :

> **Crédits de l'offre gratuite** (relevés sur netlify.com/pricing, novembre 2026) : 300 crédits par mois, plafond strict, remis à zéro chaque mois. Chaque **déploiement en production coûte 15 crédits** : chaque `git push` sur `main` en déclenche un. La bande passante coûte 20 crédits par Go ; une première visite du site pèse environ 1,5 Mo (les suivantes viennent du cache). Les déploiements de prévisualisation et de branche sont gratuits. Crédits épuisés = plus de déploiement possible, et le site risque d'être mis en pause jusqu'au mois suivant. Grouper les modifications avant de pousser, et suivre la consommation dans **Usage & billing**.

1. Pousser le dépôt sur GitHub, puis **Netlify → Add new project → Import an existing project** et choisir le dépôt. Les réglages viennent de `netlify.toml` (commande `npm run build`, dossier `dist`, Node 22) : ne rien changer dans l'interface.
2. **Project configuration → Environment variables** : ajouter les variables de la section 3 (`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, et `SITE_URL` une fois le nom de domaine branché). `REDSEA_PALETTE` vaut `classique` par défaut dans `netlify.toml`.
3. Redéployer (**Deploys → Trigger deploy**) après chaque changement de variable.

**Vercel** : **Add New → Project**, importer le dépôt, Node **22.x**, mêmes variables. Attention, l'offre gratuite de Vercel (Hobby) est réservée à un usage personnel non commercial : un site de vente aux professionnels relève de l'offre payante.

Les **en-têtes de sécurité** sont dans `vercel.json` et `netlify.toml` (à garder identiques) : Content-Security-Policy stricte (`'self'` + Turnstile uniquement), HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, Permissions-Policy restrictive, `frame-ancestors 'none'`. Ils ne s'appliquent pas en `npm run dev` : les contrôler sur un déploiement de préversion (par exemple avec securityheaders.com).

Le build ne produit ni source map, ni script ou style inline (c'est ce qui permet une CSP sans `'unsafe-inline'`). Ne pas ajouter d'attribut `style="…"` ni de code dans un `<script is:inline>` : ils seraient bloqués (un `<script is:inline src="/…">` vers un fichier du site, comme `edition.js`, est autorisé).

**Cloudflare Pages à la place de Vercel** : remplacer l'adaptateur (`npm i @astrojs/cloudflare`, puis `adapter: cloudflare()` dans `astro.config.mjs`) et recopier les en-têtes de `vercel.json` dans un fichier `public/_headers`. Le code de la route `/api/devis` n'utilise que `fetch` et des API web standard : il n'a pas à changer.

**Limite de débit** : 5 requêtes / 10 min par adresse IP (adresses IPv6 regroupées par bloc /64), en mémoire (`src/lib/rate-limit.ts`). En serverless chaque instance a sa propre mémoire : c'est un frein efficace contre les rafales, pas un quota strict. La vraie barrière contre les robots est Turnstile ; pour un quota exact, ajouter une règle de rate limiting dans le pare-feu de l'hébergeur sur `/api/devis`.

---

## 5. Arborescence

```
public/
  fonts/            polices auto-hébergées (+ licences OFL)
  images/bottle-ref.png      photo de référence de la bouteille
  textures/label.png|.webp   étiquette déroulée (texture 3D)
  textures/cap.png           logo hibiscus sur capsule dorée
  textures/mosaic.svg        motif « RED SEA » (masque teinté en CSS)
  textures/grain.png         grain
  og.jpg, favicon-*.png, apple-touch-icon.png, noscript.css
scripts/prepare-assets.py    régénère les assets dérivés depuis les deux PNG sources
src/
  content/site.ts            ← TOUS LES TEXTES
  styles/fonts.css           ← polices, déclarées à un seul endroit
  styles/global.css, home.css
  layouts/Base.astro, Legal.astro
  pages/index.astro, mentions-legales.astro, confidentialite.astro, robots.txt.ts
  pages/api/devis.ts         ← seule route serveur
  components/QuoteForm.astro
  scripts/main.ts            loader, scroll, animations, montage de la bouteille
  scripts/quote-form.ts      validation client + envoi
  three/Bottle.ts            ← bouteille 3D (seul fichier qui importe Three.js)
  lib/quote-fields.ts        options et limites partagées client/serveur
  lib/quote-schema.ts        nettoyage + schéma zod
  lib/quote-notify.ts        email Resend, Slack, vérification Turnstile
  lib/rate-limit.ts
vercel.json                  en-têtes de sécurité et cache
```

Les fichiers sources `etiquette_bissap.png` et `bouteille_bissap.png` sont conservés à la racine. `scripts/prepare-assets.py` (Pillow, numpy, opencv) en dérive l'étiquette recadrée, le logo de capsule, les favicons et le détourage de la bouteille ; les résultats sont versionnés, le script ne sert que si les sources changent.

---

## 6. Police d'affichage : à remplacer

La police de marque (lettrage « REDSEA » / « BISSAP » de l'étiquette) **n'était pas fournie**. Elle est remplacée par **Caprasimo** (SIL Open Font License), la police libre la plus proche trouvée : très proche des petits textes de l'étiquette (« infusion de fleurs d'hibiscus »), moins contrastée que le grand lettrage vertical. Police de texte : **Schibsted Grotesk** (OFL). Les deux sont auto-hébergées, sans aucun CDN.

Pour brancher la vraie police :

1. déposer le fichier (woff2 de préférence) dans `public/fonts/` ;
2. changer l'URL du `@font-face` « Redsea Display » dans `src/styles/fonts.css` ;
3. changer la même URL dans `src/layouts/Base.astro` (constante `DISPLAY_FONT_URL`, pour le preload) ;
4. si la nouvelle police est plus large ou plus étroite, ajuster `--display-scale` dans `fonts.css` : tous les titres géants suivent.

---

## 7. La bouteille 3D

Générée procéduralement dans `src/three/`, le seul dossier du site qui connaît Three.js :

| Fichier | Rôle |
| --- | --- |
| `Bottle.ts` | verre, liquide, étiquette, ombre et tache de lumière, assemblage, contrôleur (pose, drag, rotation idle) |
| `cap.ts` | capsule à vis en relief réel : bourrelet, bague d'inviolabilité, filetage, moletage, dessus imprimé |
| `condensation.ts` | gouttes de condensation en relief, effet de lentille dessiné par un shader dédié |
| `studio.ts` | studio photo calculé en shader (cyclo clair, boîtes à lumière), reflété par le verre, le métal et les gouttes |

- **verre** : `LatheGeometry` sur le profil d'une 33 cl type limonade, `MeshPhysicalMaterial` (transmission, vernis), reflets du studio ;
- **liquide** : volume translucide (absorption de Beer-Lambert : le fond de page reste visible à travers, rubis profond au centre, plus clair sur les bords et dans le col) ; surface libre calculée dans le shader, qui ballotte quand la bouteille tourne ou se déplace (inclinaison sur ressort amorti, vortex, onde). Réglages : `LIQUID_ABSORPTION` et `updateLiquid()` dans `Bottle.ts` ;
- **étiquette** : celle de l'édition affichée (`public/textures/<édition>/`, voir section 1), enroulée sur 360°, hauteur déduite du ratio de l'image ; `label-hd.webp` sur ordinateur, `label.webp` sur mobile ;
- **capsule** : or laqué ; le logo du dessus (`cap.png`) sert de masque, son encre suit l'édition (rouge, ou rose en édition noire) ;
- **condensation** : désactivée sur mobile (`lowPower`) ; pour la retirer partout, supprimer l'appel à `createCondensation()` dans `buildProceduralBottle()` ;
- **rotation idle** : sans scroll pendant 1,5 s, la bouteille tourne lentement sur elle-même (`IDLE_SPEED`) ; au scroll elle termine son tour pour retrouver la face prévue.

Dans `src/scripts/main.ts` : le rideau « Demander un devis » (`setupQuoteJump()`, rouge depuis une section beige, beige depuis une section rouge) et le changement d'édition (`switchEdition()` : la bouteille est reconstruite sur un canvas neuf avec l'autre étiquette).

Interactions : rotation pilotée par le scroll dans le hero, drag horizontal (souris et tactile) avec inertie amortie, rotation lente au repos, curseur « Tourner ». Au clavier : flèches gauche/droite pour tourner, Entrée ou Espace pour le demi-tour.

Three.js (~150 ko gzip) est dans un chunk séparé, importé dynamiquement, et seulement si le hero est proche du viewport. La boucle de rendu s'arrête quand le hero sort de l'écran ou que l'onglet est masqué.

**Image de secours** (détourage de la photo, AVIF/WebP, léger parallaxe) quand : `prefers-reduced-motion`, WebGL 2 absent ou rendu logiciel, appareil modeste (≤ 2 Go de RAM ou ≤ 2 cœurs), économiseur de données, perte du contexte WebGL, ou JavaScript désactivé.

### Remplacer la bouteille procédurale par un `.glb`

Seule la fonction `loadBottleModel()` de `src/three/Bottle.ts` est à modifier. Contrat du modèle : origine au centre de la base, axe Y vers le haut, hauteur ≈ 21,7 unités (centimètres), face avant vers +Z.

1. Déposer le fichier dans `public/models/bottle.glb` (compressé avec `gltf-transform optimize` de préférence).
2. Remplacer le corps de la fonction :

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

export async function loadBottleModel(_assets: BottleAssets): Promise<Object3D> {
  const gltf = await new GLTFLoader().loadAsync('/models/bottle.glb');
  const model = gltf.scene;
  // Mise à l'échelle et recentrage pour respecter le contrat ci-dessus.
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  model.scale.setScalar(BOTTLE.height / size.y);
  box.setFromObject(model);
  const center = box.getCenter(new Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  return model;
}
```

3. Si le `.glb` embarque déjà ses textures, les chargements de `label` et `cap` dans `createBottle()` peuvent être retirés. Si le modèle utilise Draco ou KTX2, brancher `DRACOLoader` / `KTX2Loader` sur le `GLTFLoader` et héberger leurs décodeurs dans `public/` (pas de CDN, la CSP les bloquerait).

Le reste (cadrage, pose, drag, scroll, zone cliquable) ne dépend que de `BOTTLE.height` et `BOTTLE.bodyRadius` : les ajuster si les proportions du modèle diffèrent.

---

## 8. Choix faits pendant la réalisation

Points laissés ouverts par le brief, tranchés ainsi (tous faciles à changer) :

| Sujet | Choix | Où le changer |
| --- | --- | --- |
| Hébergeur | Vercel | `astro.config.mjs`, `vercel.json` |
| Clic sur la bouteille (« à préciser ») | demi-tour animé vers l'autre face de l'étiquette (recto logo ↔ verso ingrédients) | `flip()` dans `Bottle.ts`, appel dans `bindBottleInteractions()` de `main.ts` |
| Police d'affichage | Caprasimo en remplacement | section 6 |
| Jointure de l'étiquette | l'étiquette fait 360° : la jointure est l'endroit où les deux bords de l'image se rejoignent, à environ 100° de la face avant, donc invisible de face. La placer strictement au dos décentrerait le logo | `BOTTLE.labelFrontU` |
| Transmission du verre | 1 au lieu de ~0,9 : en dessous, Three.js rend la part non transmise comme un voile blanc qui délave le liquide | `glassMaterial` |
| Fond vu à travers le verre | le canvas est transparent (le titre passe derrière la bouteille), mais le verre réfracte un fond crème uni : à travers le col vide on voit la couleur du hero, pas les lettres du titre | `draw()` dans `Bottle.ts` |
| Textures KTX2 | non utilisées : une seule texture de 1368 px (224 ko en WebP) ; le transcodeur Basis pèserait plus lourd que le gain | — |
| Position au rechargement | la page revient toujours en haut (l'intro en dépend), sauf si l'URL contient une ancre comme `#devis` | `init()` dans `main.ts` |
| 4ᵉ argument | « Canette → Verre 33 cl », en placeholder | `site.ts` |
| Mesure d'audience | aucune. Un emplacement Plausible/Umami existe, désactivé | `analytics` dans `site.ts` (+ autoriser le domaine dans la CSP) |

---

## 9. Sécurité

Audit du site (code, configuration, dépendances), avec les protections en place :

| Risque | Protection |
| --- | --- |
| Injection de code dans les pages (XSS) | aucun HTML construit à partir de données ; messages affichés en texte (`textContent`) ; CSP stricte sans `'unsafe-inline'` ni `eval` |
| Scripts ou contenus tiers | CSP : uniquement le site lui-même et Turnstile ; aucune police, aucun CDN, aucun traceur |
| Site affiché dans un cadre (clickjacking) | `frame-ancestors 'none'` et `X-Frame-Options: DENY` |
| Formulaire envoyé depuis un autre site (CSRF) | contrôle de l'en-tête `Origin`, JSON obligatoire, `form-action 'self'` |
| Robots et spam | Turnstile (vérifié côté serveur), champ piège, limite de débit |
| Requêtes énormes ou piégées | corps refusé au-delà de 16 Ko (taille annoncée et taille réellement lue), champs coupés à leur longueur maximale avant toute expression régulière |
| Données envoyées par le formulaire | nettoyées (caractères invisibles et de contrôle), validées par zod, échappées dans l'email (HTML) et dans Slack ; destinataire fixé côté serveur : le formulaire ne peut pas servir à envoyer des emails ailleurs |
| Fuite de secrets | clés uniquement dans les variables d'environnement, jamais dans le code ; `.env` ignoré par git (jamais commité, historique vérifié) ; pas de source map publiée |
| Connexion interceptée | HTTPS forcé (HSTS 2 ans, `upgrade-insecure-requests`) |
| Accès aux capteurs du navigateur | `Permissions-Policy` : caméra, micro, géolocalisation, paiement… désactivés |

Les en-têtes sont dans `vercel.json` et `netlify.toml` (à garder identiques) ; le site a été testé servi avec ces en-têtes, sans aucune violation de la CSP.

**Dépendances** : `npm audit` ne signale aucune faille haute ou critique. Il reste 10 alertes « modérées » dans `glob` et `minimatch`, utilisés uniquement par les outils de Netlify qui empaquettent la fonction au moment du build, sur nos propres fichiers : non exploitables ici (elles demandent qu'un attaquant contrôle des motifs de fichiers), et rien de ce code n'est envoyé aux visiteurs. Les forcer à jour casserait l'empaquetage ; elles disparaîtront avec une prochaine version de l'adaptateur Netlify (`npm update`).

**À faire de votre côté** : garder le dépôt GitHub privé (il contient les étiquettes et des adresses personnelles), activer la double authentification sur GitHub, Netlify, Resend et Cloudflare, et ne jamais coller une clé dans le code ou dans une capture d'écran.

## 10. Accessibilité, performance, vie privée

- HTML sémantique, un seul `h1`, lien d'évitement, focus visibles, labels réels, erreurs reliées aux champs (`aria-describedby`, `aria-invalid`), statut d'envoi annoncé (`role="alert"`).
- `prefers-reduced-motion` : pas de smooth scroll, pas de rotation, pas de reveal ; le contenu est affiché directement et la bouteille est une image fixe.
- Sans JavaScript : pas de loader (`public/noscript.css`), contenu complet lisible.
- Le loader compte la progression **réelle** (polices, chunk Three.js, textures, compilation des shaders, première image). Garde-fou : il ne retient jamais la page plus de 10 s, et s'efface seul si le JavaScript échoue.
- L'or (`#C9A35C`) n'est utilisé pour du texte que sur fond rouge ou noir (contraste AA) ; sur fond crème il reste décoratif.
- Aucun cookie, aucun traceur, aucune police ni script tiers hormis Turnstile, chargé à l'approche du formulaire. Pas de bandeau cookies nécessaire.
- Clic droit et raccourcis clavier laissés intacts.

**Non vérifié dans cette session** : le score Lighthouse mobile (visé ≥ 90) n'a pas été mesuré ; l'envoi réel par Resend, Slack et Turnstile n'a pas été testé faute de clés (la chaîne de validation, le honeypot, le contrôle d'origine et la limite de débit l'ont été en local) ; les en-têtes de `vercel.json` sont à contrôler sur un vrai déploiement.
