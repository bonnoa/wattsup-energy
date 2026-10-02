# syntax=docker/dockerfile:1
# Image de production WattsUp Energy : Next.js standalone, utilisateur non-root.
# Les migrations sont appliquées au démarrage (src/instrumentation.ts).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Secret factice limité au build (Better Auth le vérifie à l'import) ; le vrai
# secret est fourni à l'exécution.
RUN BETTER_AUTH_SECRET=build-only-placeholder-secret-0000000000 pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S wattsup && adduser -S wattsup -G wattsup
COPY --from=build --chown=wattsup:wattsup /app/.next/standalone ./
COPY --from=build --chown=wattsup:wattsup /app/.next/static ./.next/static
COPY --from=build --chown=wattsup:wattsup /app/public ./public
COPY --from=build --chown=wattsup:wattsup /app/drizzle ./drizzle
USER wattsup
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
