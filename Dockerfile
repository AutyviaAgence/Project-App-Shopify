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

# Casse-cache : invalide TOUT ce qui suit (COPY du code source + build) à chaque
# build. Évite qu'un cache Docker Dokploy serve un ancien bundle après un push.
# Bump cette valeur (ou laisse Dokploy passer --build-arg CACHEBUST=$(date)).
ARG CACHEBUST=2026-07-08-117
RUN echo "cache bust: $CACHEBUST"

COPY . .

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
# https://app.xeyo.io/version.json. Dokploy peut passer SOURCE_COMMIT ; sinon on
# dérive du .git présent dans le contexte (COPY . . l'inclut).
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
