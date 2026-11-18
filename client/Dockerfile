# syntax=docker/dockerfile:1.7

# ---- dependencies -----------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- development target (Vite dev server with hot reload) -------------------
FROM deps AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---- production build -------------------------------------------------------
FROM deps AS build
# Only a non-secret, relative API path is baked in. Never pass secrets as build args.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY . .
RUN npm run build

# ---- nginx (unprivileged) serving the SPA + reverse-proxying /api -----------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Backend location is resolved at container start (not at build time).
ENV BACKEND_URL=http://backend:5000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
