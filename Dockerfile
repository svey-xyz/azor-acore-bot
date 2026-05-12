# syntax=docker/dockerfile:1.7

# Build metadata, populated by CI (docker/metadata-action) or passed via --build-arg.
ARG BUN_VERSION=1.1.38
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
ARG VERSION=dev

# ---- deps stage ---------------------------------------------------------
# Install production dependencies using the lockfile for a reproducible build.
FROM oven/bun:${BUN_VERSION}-alpine AS deps
WORKDIR /usr/app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runtime stage ------------------------------------------------------
# Bun executes TypeScript directly and natively resolves the tsconfig path
# aliases (@azor/*, @azor.lib/*, etc.), so no separate compile step is needed.
FROM oven/bun:${BUN_VERSION}-alpine AS runtime
WORKDIR /usr/app
ENV NODE_ENV=production \
    TZ=Etc/UTC

# tini gives the bot PID 1 with proper SIGTERM/SIGINT forwarding so
# `docker stop` and `docker compose down` shut the Discord client down cleanly.
RUN apk add --no-cache tini

COPY --from=deps /usr/app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY server ./server
COPY lib ./lib
COPY @types ./@types

USER bun

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
