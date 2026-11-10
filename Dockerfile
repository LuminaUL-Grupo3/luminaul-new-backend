# ==========================================
# STAGE 1: Compilación de la Aplicación NestJS
# ==========================================
ARG NODE_VERSION=24-alpine
FROM node:${NODE_VERSION} AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# ==========================================
# STAGE 2: Imagen Final de Producción
# ==========================================
FROM node:${NODE_VERSION}

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

USER node

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:8000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main"]

