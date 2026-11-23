# syntax=docker/dockerfile:1.7
#
# Twigo production image.
#
# Next.js runs inside server.ts, which also serves the real-time group chat (Socket.IO) on the same
# port, and listens directly on 0.0.0.0:1010. Next.js's "standalone" server.js is deliberately not
# used: it would leave out the chat server.
#
# Build and run with Docker Compose (docker-compose.yml); see docs/DEPLOYMENT.md.

FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=1010 \
    HOST=0.0.0.0

# Dependencies first, so this layer is reused while package files do not change. Development
# dependencies are included on purpose: the build needs them, and tsx runs server.ts and the
# maintenance scripts (migrations, backups, creating the owner account).
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Retries and long timeouts survive slow or briefly interrupted connections; the cache mount keeps
# downloaded packages between builds (it is not part of the image).
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev --no-audit --no-fund \
      --fetch-retries=6 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=180000 --fetch-timeout=600000

COPY . .

# The production settings are mounted only while building (BuildKit secret, never stored in the
# image): Next.js reads .env.production during the build because some public pages are prerendered
# with the site's name, address and settings. The database is not reachable while building, so the
# DATABASE_URL below points nowhere on purpose: prerendered pages start with the built-in content
# and refresh from the database within five minutes of the site starting.
RUN --mount=type=secret,id=envfile,target=/app/.env.production,required=true \
    DATABASE_URL="postgresql://build:build@127.0.0.1:1/build" npm run build

# Uploaded files and backups live in a volume (/data); the app runs as the unprivileged "node" user.
RUN mkdir -p /data/storage /data/backups && chown -R node:node /data /app/.next
USER node

EXPOSE 1010

CMD ["node_modules/.bin/tsx", "server.ts", "--production"]
