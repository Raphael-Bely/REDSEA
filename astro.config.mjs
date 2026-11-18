import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// URL publique du site (canonical, Open Graph, sitemap). À définir au build : SITE_URL=https://mondomaine.fr
const site = process.env.SITE_URL ?? 'https://redsea.example';

/*
 * Palette du site, choisie au lancement :
 *   npm run dev            → « classique » : étiquette beige, site beige et rouge (par défaut)
 *   npm run dev --noir     → « noir » : étiquette noire, site noir et rose
 * npm transmet le drapeau au script sous la forme npm_config_noir=true. Même chose pour
 * `npm run build --noir` ; en déploiement (Vercel), définir la variable REDSEA_PALETTE=noir.
 */
const palette =
  process.env.npm_config_noir === 'true' || process.env.REDSEA_PALETTE === 'noir' || process.argv.includes('--noir')
    ? 'noir'
    : 'classique';

/** Affiche la palette active au démarrage, pour savoir d'un coup d'œil quelle version tourne. */
const paletteBanner = {
  name: 'redsea-palette',
  hooks: {
    'astro:config:done': ({ logger }) => {
      logger.info(palette === 'noir' ? 'Palette « noir » : étiquette noire, site noir et rose.' : 'Palette « classique » : beige et rouge.');
    },
  },
};

export default defineConfig({
  site,
  // Tout est prérendu en statique ; seule /api/devis (prerender = false) part en fonction serveur.
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap(), paletteBanner],
  build: {
    // Pas de <style> inline : la CSP n'autorise que 'self'.
    inlineStylesheets: 'never',
  },
  vite: {
    // Palette lue par le code (src/palette.ts) : remplacée à la compilation, rien à l'exécution.
    define: {
      __REDSEA_PALETTE__: JSON.stringify(palette),
    },
    build: {
      sourcemap: false,
      // Pas de script ni d'asset inliné (CSP stricte, pas de data: pour les polices).
      assetsInlineLimit: 0,
    },
  },
  env: {
    schema: {
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      QUOTE_RECIPIENT_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      QUOTE_SENDER_EMAIL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'REDSEA Devis <onboarding@resend.dev>',
      }),
      SLACK_WEBHOOK_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURNSTILE_SECRET_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },
});
