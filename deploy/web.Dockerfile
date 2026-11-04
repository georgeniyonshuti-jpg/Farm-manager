# Cleva Farm Manager PWA (Vite build + nginx). Build from the repo root:
#   docker build -f deploy/web.Dockerfile --build-arg VITE_API_URL=https://farmapi.cleva.rw -t cleva-farm-web:latest .
FROM node:20-bookworm-slim AS build

WORKDIR /app/web

ARG VITE_API_URL=https://farmapi.cleva.rw
ARG VITE_APP_VERSION=1.0.0
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM nginx:1.27-alpine

COPY deploy/farm-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
