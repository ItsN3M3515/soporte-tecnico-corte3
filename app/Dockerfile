# syntax=docker/dockerfile:1

# Imagen web de AsisTec: la app Expo exportada para navegador, servida por nginx.
# nginx también pasa /api y /socket.io al backend, así el navegador usa una sola URL
# (la misma que publica Tailscale Funnel) y no hace falta CORS ni abrir el puerto 3000.
# Contexto de construcción: app/

# Etapa 1: exportar la app para web (HTML, JS y recursos estáticos)
FROM node:22.22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
# "mismo-origen": la app llama al API en la misma URL desde la que se cargó (src/lib/config.ts)
ENV EXPO_PUBLIC_API_URL=mismo-origen
RUN npx expo export --platform web --output-dir dist

# Etapa 2: solo nginx y los archivos estáticos.
# nginx-unprivileged corre como el usuario nginx (UID 101) y escucha en 8080, no en 80.
FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24
# Parches de seguridad de Alpine publicados después de la imagen base, y sin curl:
# el healthcheck usa el wget de busybox, curl solo sumaría vulnerabilidades.
USER root
RUN apk upgrade --no-cache && apk del --no-cache curl
COPY --chown=nginx:nginx docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080

# Listo cuando nginx responde y además el backend detrás de él responde.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/api/salud || exit 1
