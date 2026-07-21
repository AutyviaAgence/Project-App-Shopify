FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# ⚠️ CASSE-CACHE — NE PLUS DÉPENDRE D'UNE VALEUR À BUMPER À LA MAIN.
#
# `ARG CACHEBUST=<date en dur>` était resté figé au 2026-07-08 : Docker voyait
# une couche identique, réutilisait son cache pour TOUT ce qui suit (COPY du
# code, version.json, npm run build) et produisait une image contenant l'ANCIEN
# code. Dokploy affichait « Done » sur le bon commit — mais rien n'était
# reconstruit, et le serveur continuait de servir un bundle vieux de plusieurs
# heures. Des correctifs poussés semblaient donc « ne rien changer ».
#
# Le vrai invalidateur, c'est le CODE lui-même : on copie d'abord les fichiers
# de source, ce qui casse le cache dès qu'un seul octet change — sans rien à
# maintenir.
COPY . .

# Trace de build (utile dans les logs Dokploy pour vérifier qu'on a bien
# reconstruit). `CACHEBUST` reste accepté si Dokploy le passe explicitement.
ARG CACHEBUST=auto
RUN echo "cache bust: $CACHEBUST"

# Next.js inlines NEXT_PUBLIC_* vars at build time
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
# Embedded Signup WhatsApp : inlinés au build (sinon le bouton Meta ne s'affiche pas).
ARG NEXT_PUBLIC_META_APP_ID
ARG NEXT_PUBLIC_META_CONFIG_ID
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID
ENV NEXT_PUBLIC_META_CONFIG_ID=$NEXT_PUBLIC_META_CONFIG_ID
ENV NEXT_TELEMETRY_DISABLED=1

# Commit + date de build, écrits dans public/version.json (statique, servi tel
# quel). Permet de vérifier la version RÉELLEMENT déployée via
# https://app.xeyo.io/version.json.
#
# ⚠️ `.git` est exclu par .dockerignore : le fallback `git rev-parse` ne peut
# PAS fonctionner, d'où le `commit: "unknown"` observé en prod. Pour avoir le
# vrai SHA, passer `--build-arg BUILD_COMMIT=<sha>` depuis Dokploy. En
# attendant, c'est `builtAt` qui fait foi pour savoir si un build est récent.
ARG BUILD_COMMIT
RUN COMMIT="$BUILD_COMMIT"; \
    if [ -z "$COMMIT" ] && [ -d .git ]; then \
      apk add --no-cache git >/dev/null 2>&1 || true; \
      COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"; \
    fi; \
    printf '{"commit":"%s","builtAt":"%s"}\n' "${COMMIT:-unknown}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > public/version.json; \
    cat public/version.json

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# ffmpeg : remux des messages vocaux WebM (Chrome) → OGG, seul conteneur audio
# accepté par WhatsApp. Pas de ré-encodage (codec Opus des deux côtés), donc
# l'opération est quasi instantanée.
RUN apk add --no-cache ffmpeg

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
