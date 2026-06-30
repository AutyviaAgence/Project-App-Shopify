import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["geoip-lite"],
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jdeslkxwbtqkeifrlmnf.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@supabase/supabase-js",
    ],
  },
  // Reverse-proxy PostHog (EU) via /ingest → évite les bloqueurs de pub.
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: 'https://eu-assets.i.posthog.com/static/:path*' },
      { source: '/ingest/:path*', destination: 'https://eu.i.posthog.com/:path*' },
    ]
  },
  // Le proxy /ingest gère des sous-chemins (skip trailing-slash redirect).
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        // Page embedded Shopify : doit pouvoir s'afficher dans l'iframe de l'admin Shopify.
        // On autorise Shopify comme frame-ancestor et on NE met PAS X-Frame-Options: DENY.
        source: '/shopify/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
          },
        ],
      },
      {
        source: '/shopify',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
          },
        ],
      },
      {
        // Toutes les autres routes : interdites en iframe (sauf /shopify ci-dessus).
        source: '/((?!shopify).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://challenges.cloudflare.com https://connect.facebook.net https://eu-assets.i.posthog.com https://eu.i.posthog.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://supabase.autyvia.fr https://jdeslkxwbtqkeifrlmnf.supabase.co https://challenges.cloudflare.com https://www.facebook.com https://cdn.shopify.com https://lh3.googleusercontent.com https://*.googleusercontent.com",
              "font-src 'self' https://challenges.cloudflare.com",
              "connect-src 'self' https://supabase.autyvia.fr wss://supabase.autyvia.fr https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.openai.com https://graph.facebook.com https://challenges.cloudflare.com https://connect.facebook.net https://www.facebook.com https://eu.i.posthog.com https://eu-assets.i.posthog.com",
              "frame-src https://js.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com",
              "worker-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      {
        // Redirection lien WhatsApp : aucun referrer transmis à WhatsApp
        // (sinon ERR_BLOCKED_BY_RESPONSE quand le clic vient de Shopify).
        // Cette règle vient APRÈS le catch-all → elle écrase le Referrer-Policy.
        source: '/api/wa/:slug*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
};

export default nextConfig;
