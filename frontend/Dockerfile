# Frontend de Original Flow (la plataforma y las páginas publicadas). Se construye desde frontend/
# (en EasyPanel: ruta de compilación "frontend"). Dos etapas: la primera compila; la final solo sirve
# los archivos estáticos con nginx, sin Node y sin privilegios.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Primero las dependencias, para que Docker reutilice esta capa mientras no cambien.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Lo que el navegador necesita saber se fija al COMPILAR (Vite lo mete en el código): son datos públicos, nunca
# secretos. Para cambiarlos hay que volver a construir la imagen:
#   docker build --build-arg VITE_API_URL=https://api.ejemplo.com/api/v1 -t original-flow-frontend .
# - VITE_API_URL: dónde está la API. Si es otro dominio, el backend debe listar este frontend en CORS_ORIGINS.
# - VITE_TOKEN_APP y VITE_ORIGINALAUTH_LOGIN_URL: el acceso real con Original Auth (ver .env.example).
ARG VITE_API_URL=/api/v1
ARG VITE_TOKEN_APP=
ARG VITE_ORIGINALAUTH_LOGIN_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_TOKEN_APP=$VITE_TOKEN_APP \
    VITE_ORIGINALAUTH_LOGIN_URL=$VITE_ORIGINALAUTH_LOGIN_URL
RUN pnpm build


# nginx que corre como usuario sin privilegios (escucha en el 8080).
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-headers.conf /etc/nginx/nginx-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

# La imagen trae wget (no curl). Falla (y el contenedor se marca no saludable) si /health no responde 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
