# Cleva Farm Manager API (Node/Express + Postgres migrations). Build from the repo root:
#   docker build -f deploy/api.Dockerfile -t cleva-farm-api:latest .
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./
COPY database/ /app/database/
COPY docs/seller-contract-v1.md docs/buyer-contract-v1.md docs/scout-contract-v1.md /app/docs/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
