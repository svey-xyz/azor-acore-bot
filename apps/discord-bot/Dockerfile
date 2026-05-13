# syntax=docker/dockerfile:1.7
#
# Build context is the MONOREPO ROOT (.), not this directory. The CI workflow
# passes `file: apps/discord-bot/Dockerfile`. Building locally:
#
#   docker build -f apps/discord-bot/Dockerfile -t azor-bot .
#
# Paths below are therefore relative to the repo root.

# Build metadata, populated by CI (docker/metadata-action) or passed via --build-arg.
ARG BUN_VERSION=1.1.38
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG VERSION=dev

# ---- deps stage ---------------------------------------------------------
# Install production dependencies for the @azor/bot workspace, using the
# hoisted root lockfile so the build is reproducible.
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /usr/app

# Copy every workspace manifest so Bun can resolve the workspace graph before
# installing. Source code is NOT copied here — keeps this layer cacheable
# across edits that don't touch package.json files.
COPY package.json bun.lock ./
COPY apps/discord-bot/package.json ./apps/discord-bot/
COPY packages/shared/package.json  ./packages/shared/

RUN bun install --frozen-lockfile --production --filter @azor/bot

# ---- runtime stage ------------------------------------------------------
# Bun executes TypeScript directly and natively resolves the tsconfig path
# aliases (@azor/*, @azor.lib/*, @azor.server/*, etc.), so no compile step.
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /usr/app
ENV NODE_ENV=production \
    TZ=Etc/UTC \
    AZOR_CONFIG_PATH=/config/azor.config.json \
    SSH_PRIVATE_KEY_PATH=/config/ssh_key

# tini gives the bot PID 1 with proper SIGTERM/SIGINT forwarding so
# `docker stop` and `docker compose down` shut the Discord client down cleanly.
RUN apk add --no-cache tini

# Hoisted workspace deps from the deps stage.
COPY --from=deps /usr/app/node_modules ./node_modules

# Monorepo manifests + base tsconfig (extended by apps/discord-bot/tsconfig.json).
COPY package.json tsconfig.base.json ./

# Bot package — manifest, tsconfig, and source trees.
COPY apps/discord-bot/package.json apps/discord-bot/tsconfig.json ./apps/discord-bot/
COPY apps/discord-bot/src    ./apps/discord-bot/src
COPY apps/discord-bot/server ./apps/discord-bot/server
COPY apps/discord-bot/lib    ./apps/discord-bot/lib
COPY apps/discord-bot/@types ./apps/discord-bot/@types

# Shared TS package. Source-only (Bun resolves the .ts entry directly).
COPY packages/shared ./packages/shared

# Bake the default config into /config so the image runs out of the box.
# Users mount their own /config volume to override (and to drop in ssh_key).
COPY apps/discord-bot/config/ /config/
RUN chown -R bun:bun /config
VOLUME ["/config"]

USER bun
WORKDIR /usr/app/apps/discord-bot

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "src/bot.ts"]

# ---- OCI image labels ---------------------------------------------------
# https://github.com/opencontainers/image-spec/blob/main/annotations.md
ARG VCS_REF
ARG BUILD_DATE
ARG VERSION
LABEL org.opencontainers.image.title="azor-acore-bot" \
      org.opencontainers.image.description="Discord bot that bridges an AzerothCore WoW private server with Discord via slash commands." \
      org.opencontainers.image.url="https://github.com/svey-xyz/azor-acore-bot" \
      org.opencontainers.image.source="https://github.com/svey-xyz/azor-acore-bot" \
      org.opencontainers.image.documentation="https://github.com/svey-xyz/azor-acore-bot#readme" \
      org.opencontainers.image.vendor="svey" \
      org.opencontainers.image.authors="svey <https://github.com/svey-xyz>" \
      org.opencontainers.image.licenses="ISC" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.base.name="docker.io/oven/bun:${BUN_VERSION}-alpine"
