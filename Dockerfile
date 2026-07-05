# ── Stage 1: byg frontend (Vite) ─────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Installer ALLE deps (inkl. devDependencies) til bygningen
COPY package.json package-lock.json ./
RUN npm ci

# Kopiér kildekode og byg frontend til dist/
COPY . .
RUN npm run build

# ── Stage 2: slankt runtime-image ────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Databasen + bilag lægges på en volume, uden for koden
ENV DB_PATH=/data/udlejning-data.json
ENV BILAG_DIR=/data/bilag
ENV PORT=3002

# Installer KUN production-deps (express) — ingen React/Vite i runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Kopiér server + det byggede frontend fra build-stagen
COPY server.js ./
COPY --from=build /app/dist ./dist

# Persistent data-mappe (mountes som volume) — kun /data skal være skrivbar for node.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

EXPOSE 3002

# Kør som non-root bruger (node-brugeren findes i alpine-imaget)
USER node

# Simpel healthcheck mod /health-routen
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
