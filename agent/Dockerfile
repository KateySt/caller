# syntax=docker/dockerfile:1
# Built by the LiveKit Cloud build service on `lk agent create` / `lk agent deploy`.
# Follows https://docs.livekit.io/deploy/agents/builds (Node template, adapted from pnpm to npm).

ARG NODE_VERSION=24
# glibc-based slim image — Alpine/musl is not supported by the LiveKit native bindings.
FROM node:${NODE_VERSION}-slim AS base

# The LiveKit native core reads the system CA bundle, which slim images don't ship;
# without it Room.connect() fails with "failed to retrieve region info".
RUN apt-get update -qq \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# --- Build stage ---
FROM base AS build
WORKDIR /app

# Manifests first so the dependency layer is cached across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# --- Production stage ---
FROM base
ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app/package.json ./
COPY --from=build --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appuser /app/dist ./dist

USER appuser
ENV NODE_ENV=production

# No secrets and no LIVEKIT_URL/API_KEY/API_SECRET here — LiveKit Cloud injects them at runtime.
# Launch the worker directly (no wrapper script) so it receives shutdown signals.
CMD ["node", "dist/main.js", "start"]
