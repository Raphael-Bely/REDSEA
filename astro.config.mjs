import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

// URL publique du site (canonical, Open Graph, sitemap). À définir au build : SITE_URL=https://mondomaine.fr
const site = process.env.SITE_URL ?? 'https://redsea.example';

export default defineConfig({
  site,
  // Tout est prérendu en statique ; seule /api/devis (prerender = false) part en fonction serveur.
  output: 'static',
  adapter: vercel(),
  integrations: [sitemap()],
  build: {
    // Pas de <style> inline : la CSP n'autorise que 'self'.
    inlineStylesheets: 'never',
  },
  vite: {
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
