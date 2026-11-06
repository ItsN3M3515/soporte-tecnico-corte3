# syntax=docker/dockerfile:1

# Dockerfile del backend de AsisTec (Node.js, arquitectura hexagonal).
# Va en backend/, junto al package.json. Contexto de construccion: backend/
#
# Por que Node 22: el backend usa el modulo node:sqlite que trae Node
# (engines: >=22.13), asi que no hace falta compilar nada nativo.

# Etapa 1: instalar SOLO las dependencias de produccion
# (sin jest, eslint, supertest, playwright... que no deben llegar a la imagen final)
FROM node:22.22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Etapa 2: imagen final, solo con el runtime, las dependencias y el codigo
FROM node:22.22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/soporte.db
WORKDIR /app

# Parches de seguridad de Debian publicados después de la imagen base
# (el escaneo de la imagen los reporta como "fixed version" disponible).
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

# npm, npx y corepack solo hacen falta para instalar dependencias (etapa 1).
# El contenedor arranca con "node" directo, así que se eliminan de la imagen
# final: traen sus propias dependencias (tar, sigstore...) con vulnerabilidades.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Carpeta de la base SQLite, con dueno no privilegiado.
# El volumen nombrado de Compose hereda estos permisos la primera vez.
RUN mkdir /data && chown node:node /data

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

# La imagen oficial de Node ya trae el usuario "node" (sin privilegios)
USER node
EXPOSE 3000

# Disponible si responde HTTP (GET /api/salud debe responder 200).
# La imagen slim no trae curl, por eso se usa el propio Node.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/salud',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Se ejecuta node directo (no "npm start") para que las senales de Docker
# lleguen al proceso y el contenedor se apague limpio.
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]