# API de Original Flow. Se construye desde backend/ (en EasyPanel: ruta de compilación "backend").
# Dos etapas: la primera instala todo y compila; la final solo lleva lo que hace falta para correr.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

# Primero las dependencias, para que Docker reutilice esta capa mientras no cambien.
# El tsconfig va antes de instalar: el postinstall genera el cliente de Prisma y, según el tsconfig,
# decide la extensión de sus imports (sin él quedan en .ts y el servidor no arranca).
COPY package.json pnpm-lock.yaml tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile

COPY src ./src
RUN pnpm build


FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Prisma necesita OpenSSL para aplicar las migraciones desde este contenedor.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

COPY package.json pnpm-lock.yaml tsconfig.json ./
# Las migraciones se aplican con `pnpm db:deploy`: necesitan el esquema, la configuración y los motores de Prisma.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

# Nunca como root.
RUN chown -R node:node /app
USER node
EXPOSE 3000

# Slim no trae curl: se consulta /health con Node. Falla (y el contenedor se marca no saludable) si no responde 200.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Al arrancar aplica las migraciones pendientes (prisma migrate deploy: solo aplica las que faltan, no borra nada)
# y luego inicia el servidor. Si una migración falla, el contenedor no arranca. Con SKIP_MIGRATIONS=true se omite.
# `exec` deja a Node como proceso principal para que reciba SIGTERM al detener el contenedor.
CMD ["sh", "-c", "if [ \"$SKIP_MIGRATIONS\" != \"true\" ]; then pnpm db:deploy || exit 1; fi; exec node dist/server.js"]
