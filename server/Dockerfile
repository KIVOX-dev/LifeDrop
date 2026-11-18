# syntax=docker/dockerfile:1.7

# ---- dependencies (all, for building / dev) ---------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- development target (hot reload; source is bind-mounted) ----------------
FROM deps AS dev
ENV NODE_ENV=development
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
EXPOSE 5000
CMD ["npx", "tsx", "watch", "src/server.ts"]

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- production dependencies only -------------------------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Run as the unprivileged "node" user; no secrets are baked into the image.
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# server.ts handles SIGTERM/SIGINT for a graceful shutdown (compose adds an init process).
CMD ["node", "dist/server.js"]
