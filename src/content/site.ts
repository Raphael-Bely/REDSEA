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
  contactEmail: '[contact@domaine]',
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
   * [TEXTE À REMPLIR] — environ 80 mots. Le paragraphe ci-dessous est un
   * placeholder rédigé à partir des seules informations de l'étiquette :
   * à remplacer par votre histoire.
   */
  text:
    '[TEXTE À REMPLIR] REDSEA est né à Bordeaux d’une envie simple : servir le bissap comme on le boit à Dakar, sans le dénaturer. Des fleurs d’hibiscus du Sénégal, infusées puis mises en bouteille à la Brasserie Gasconha, à Pessac. Une boisson rouge profond, servie fraîche, pensée pour les comptoirs, les terrasses et les cartes qui cherchent autre chose qu’un soda. Ici, racontez en quelques phrases qui vous êtes, d’où vient la recette et pourquoi vous la proposez aux bars, cafés et restaurants.',
  signature: '[Prénom Nom — fondateur·rice, À REMPLIR]',
} as const;

export type Argument = {
  /** Texte barré puis remplacé par `title` (effet « barré → remplacé »). Optionnel. */
  struck?: string;
  title: string;
  note: string;
};

export const argumentsSection = {
  label: 'Ce qu’il y a dans la bouteille',
  items: [
    {
      struck: 'Sirop industriel',
      title: 'Fleurs d’hibiscus infusées',
      note: '[À REMPLIR] Une phrase sur l’infusion : les fleurs séchées, le temps, le geste.',
    },
    {
      title: 'Hibiscus du Sénégal',
      note: '[À REMPLIR] Une phrase sur l’origine des fleurs et la filière.',
    },
    {
      title: 'Brassé à Pessac',
      note: '[À REMPLIR] Une phrase sur la fabrication à la Brasserie Gasconha.',
    },
    {
      struck: 'Canette',
      title: 'Verre 33 cl',
      note: '[À REMPLIR] Une phrase sur le format : service à table, conditionnement, livraison.',
    },
  ] satisfies Argument[],
} as const;

export const quote = {
  label: 'Professionnels',
  title: 'Devis',
  intro:
    'Bar, café, restaurant, épicerie fine ou événement : dites-nous ce qu’il vous faut, nous revenons vers vous avec un tarif. [À REMPLIR : délai de réponse, zone de livraison, minimum de commande.]',
  submit: 'Envoyer la demande',
  sending: 'Envoi en cours…',
  successTitle: 'Demande envoyée.',
  successText: 'Merci. Nous vous répondons par email très vite. [À REMPLIR : délai]',
  errorGeneric: 'L’envoi a échoué. Réessayez dans un instant ou écrivez-nous directement.',
} as const;

/** Mention d'information RGPD de premier niveau, affichée sous le bouton du formulaire. */
export const rgpd = {
  controller: '[NOM DU RESPONSABLE DE TRAITEMENT]',
  rightsEmail: '[email de contact RGPD]',
  retention: '3 ans après le dernier contact',
} as const;

/** Informations légales : pages /mentions-legales et /confidentialite. */
export const legal = {
  lastUpdate: '[date de dernière mise à jour — À REMPLIR]',
  editor: {
    name: '[Nom ou raison sociale — À REMPLIR]',
    status: '[Statut juridique (SAS, EI, micro-entreprise…) et capital social — À REMPLIR]',
    siren: '[SIREN / numéro RCS — À REMPLIR]',
    vat: '[N° de TVA intracommunautaire, si applicable — À REMPLIR]',
    address: '[Adresse du siège — À REMPLIR]',
    email: '[Email — À REMPLIR]',
    phone: '[Téléphone — À REMPLIR]',
  },
  publicationDirector: '[Nom du directeur ou de la directrice de la publication — À REMPLIR]',
  host: {
    // À adapter à l'hébergeur réellement utilisé. Valeurs indicatives pour Vercel : à vérifier.
    name: '[Nom de l’hébergeur — ex. Vercel Inc. — À REMPLIR]',
    address: '[Adresse de l’hébergeur — À REMPLIR]',
    phone: '[Téléphone de l’hébergeur — À REMPLIR]',
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
