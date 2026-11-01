# ==========================================
# STAGE 1: Compilación de la Aplicación NestJS
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src/ ./src/

RUN npm run build

# ==========================================
# STAGE 2: Imagen Final de Producción
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node

EXPOSE 8000

CMD ["node", "dist/main.js"]

