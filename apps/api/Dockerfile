# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root manifests first (for npm workspaces cache layer)
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

# Install all workspace deps (postinstall runs prisma generate).
# Puppeteer uses the Alpine Chromium in the runtime image, so skip its browser download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm ci --workspace=apps/api --include-workspace-root

# Copy source
COPY apps/api/ ./apps/api/

# Generate Prisma client and build
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# chromium: renders the proposal PDF (PdfRendererService); Thai fonts are embedded by the app
RUN apk add --no-cache dumb-init chromium

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy workspace manifests and install production deps only
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --workspace=apps/api --include-workspace-root --omit=dev

# Copy compiled output + prisma generated client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/src/generated ./apps/api/src/generated
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/assets ./apps/api/assets

WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 3000

# dumb-init forwards signals so Node shuts down gracefully
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
