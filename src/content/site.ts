/**
 * CONTENU CENTRAL DU SITE
 * -----------------------------------------------------------------------------
 * Tous les textes modifiables sont ici. Les passages entre crochets
 * ([À REMPLIR], [TEXTE À REMPLIR]…) sont des placeholders à remplacer.
 * Aucune allégation santé (pas de « antioxydant », « bon pour… ») : la
 * réglementation (règlement CE 1924/2006) les encadre strictement.
 */

export const brand = {
  name: 'REDSEA',
  product: 'Bissap',
  baseline: 'Infusion de fleurs d’hibiscus',
  /** Email de contact public, affiché dans le footer et les pages légales. */
  contactEmail: 'redseabissap@gmail.com',
  instagram: { handle: '@redsea_bissap', url: 'https://www.instagram.com/redsea_bissap/' },
} as const;

export const seo = {
  title: 'REDSEA — Bissap en bouteille pour bars, cafés et restaurants à Bordeaux',
  description:
    'REDSEA, bissap en bouteille verre 33 cl : une infusion de fleurs d’hibiscus du Sénégal, fabriquée à Pessac. Demande de devis pour les professionnels (bars, cafés, restaurants).',
  ogImage: '/og.jpg',
  ogImageAlt: 'Bouteille de bissap REDSEA, verre 33 cl, capsule dorée',
} as const;

export const nav = {
  quoteLabel: 'Demander un devis',
} as const;

export const hero = {
  /** Découpé en deux fragments qui s'écartent au scroll. */
  titleParts: ['RED', 'SEA'],
  srTitle: 'REDSEA, bissap : infusion de fleurs d’hibiscus du Sénégal',
  kicker: ['Bissap', 'Infusion de fleurs d’hibiscus'],
  facts: ['Bouteille verre 33 cl', 'Pour bars, cafés & restaurants', 'Bordeaux'],
  scrollHint: 'Scroller pour découvrir',
  cursorLabel: 'Tourner',
  bottleLabel: 'Bouteille REDSEA : glisser pour la faire tourner, cliquer pour voir l’autre face',
  fallbackAlt: 'Bouteille de bissap REDSEA en verre, capsule dorée, étiquette crème et rouge',
} as const;

export const about = {
  label: 'Qui sommes-nous',
  /**
   * Un paragraphe par entrée. Le texte est ajusté automatiquement pour tenir dans l'écran : plus il
   * est long, plus il est petit (environ 190 mots ici).
   */
  paragraphs: [
    'RedSea est née d’une rencontre. Un Égyptien, un Sénégalais, une école d’ingénieur à Bordeaux et une découverte : le karkadé que défendait l’un et le bissap que défendait l’autre étaient, au fond, la même boisson. La même fleur d’hibiscus, célébrée par deux cultures qui s’ignoraient.',
    'Testée auprès de dizaines d’étudiants et validée à l’unanimité, l’idée a rassemblé cinq étudiants ingénieurs autour d’un même projet : faire découvrir cette boisson venue d’Afrique à Bordeaux, puis au-delà.',
    'Nous avons retravaillé la recette pour une version moins sucrée et plus douce, sans jamais sacrifier le caractère de l’hibiscus. Nos fleurs proviennent d’une agriculture biologique et équitable, où la juste rémunération des producteurs n’est pas un argument marketing mais un engagement : un salaire décent, versé de manière éthique à l’agriculteur.',
    'Côté production, nous avons choisi la proximité et le savoir-faire : notre fournisseur est bordelais, et chaque bouteille est brassée à la Brasserie Gasconha, à Pessac. De la fleur à la bouteille, RedSea est une boisson locale, naturelle et responsable.',
    'Une rencontre, une fleur, cinq copains et l’envie de la partager avec le monde entier.',
  ],
  signature: 'L’équipe REDSEA',
} as const;

export type Argument = {
  /** Texte barré puis remplacé par `title` (effet « barré → remplacé »). Optionnel. */
  struck?: string;
  title: string;
  note: string;
};

/** Scène « nuit » : le simulateur complet, juste avant le devis. */
export const night = {
  /** Nom de la section pour les lecteurs d'écran (rien n'est affiché). */
  label: 'La bouteille en 3D, à manipuler',
};

export const argumentsSection = {
  label: 'Ce qu’il y a dans la bouteille',
  items: [
    {
      struck: 'Sirop industriel',
      title: 'Fleurs d’hibiscus infusées',
      note: 'Une vraie infusion de fleurs d’hibiscus, faite par nos soins selon notre recette.',
    },
    {
      title: 'Hibiscus du Sénégal',
      note: 'Nos fleurs viennent du Sénégal, où le bissap se boit au quotidien.',
    },
    {
      title: 'Brassé à Pessac',
      note: 'Brassé à la Brasserie Gasconha, à Pessac, et vendu en direct aux établissements : un circuit court.',
    },
    {
      struck: 'Canette',
      title: 'Verre 33 cl',
      note: 'Une bouteille en verre, à servir bien fraîche, au comptoir comme à table.',
    },
  ] satisfies Argument[],
} as const;

export const quote = {
  label: 'Professionnels',
  title: 'Devis',
  intro:
    'Bar, café, restaurant, épicerie fine ou événement : dites-nous ce qu’il vous faut, nous revenons vers vous avec un tarif.',
  submit: 'Envoyer la demande',
  sending: 'Envoi en cours…',
  successTitle: 'Demande envoyée.',
  successText: 'Merci. Nous vous répondons par email très vite.',
  errorGeneric: 'L’envoi a échoué. Réessayez dans un instant ou écrivez-nous directement.',
} as const;

/** Mention d'information RGPD de premier niveau, affichée sous le bouton du formulaire. */
export const rgpd = {
  /**
   * Responsable du traitement = la personne juridique qui collecte les demandes de devis et décide
   * de leur usage : l'entreprise individuelle qui édite le site (REDSEA n'est pas une société).
   * Son identité complète figure dans les mentions légales (`legal.editor`).
   */
  controller: 'Badra MOHAMED EI (REDSEA)',
  /** Adresse où écrire pour exercer ses droits (accès, rectification, effacement…). */
  rightsEmail: 'redseabissap@gmail.com',
  retention: '3 ans après le dernier contact',
} as const;

/** Informations légales : pages /mentions-legales et /confidentialite. */
export const legal = {
  lastUpdate: '22 novembre 2026',
  /**
   * Source : annuaire-entreprises.data.gouv.fr (SIREN 131 465 403).
   * Un entrepreneur individuel doit faire suivre son nom de « EI » sur ses documents professionnels
   * (art. R. 526-26 du Code de commerce).
   */
  editor: {
    name: 'Badra MOHAMED EI',
    status: 'Entrepreneur individuel — entreprise artisanale',
    siren: '131 465 403',
    siret: '131 465 403 00015 (siège)',
    registry: 'Registre national des entreprises (RNE), tenu par l’INPI',
    activity: 'Production de boissons rafraîchissantes (code NAF 11.07B)',
    /** Vide : pas de numéro de TVA intracommunautaire, la ligne n'est pas affichée. */
    vat: '',
    address: '2 rue Beaubourg, 75004 Paris, France',
    email: 'redseabissap@gmail.com',
    phone: '+33 7 69 63 47 95',
  },
  publicationDirector: 'Badra MOHAMED',
  host: {
    // Source : netlify.com/privacy (rubrique « Contact Us »). Netlify ne publie pas de téléphone.
    name: 'Netlify, Inc.',
    address: '101 2nd Street, San Francisco, CA 94105, États-Unis',
    contact: 'support@netlify.com — www.netlify.com',
    phone: '',
  },
  manufacturer: 'Brasserie Gasconha, Pessac (France)',
} as const;

/**
 * Mesure d'audience sans cookie (Plausible ou Umami), DÉSACTIVÉE par défaut.
 * Pour l'activer : enabled = true, renseigner src/domain, puis autoriser le
 * domaine du script dans la CSP (vercel.json : script-src et connect-src).
 */
export const analytics = {
  enabled: false,
  scriptSrc: '',
  domain: '',
} as const;
