# Original Flow

Plataforma SaaS multicliente para **crear, publicar, automatizar y medir funnels de conversión**. Un negocio define su marca, la plataforma genera la página con inteligencia artificial, la persona la edita, la publica, cobra dentro de la misma página con Original Pay (funnels de venta), recibe los leads en un tablero kanban y ve métricas de origen de clics y abandono por sección.

Proyecto de estadía en **The Original Lab** (Durango, México). Todo el producto y la documentación están en español.

## Estado

El diseño (pantallas, modelo de datos, contratos de API) está terminado y documentado. Los **pasos 1 a 6 del orden de construcción** (ver `docs/ARCHITECTURE.md`) están hechos: servidor base del backend, base de datos con Prisma 7 (14 tablas y migraciones), sesión con Original Auth en modo simulado (`mock_callback`), workspaces con equipo e invitaciones, funnels sin IA (tipos, bloques y CTA), publicación con página pública y captura de leads y eventos, con pruebas. Lo siguiente es el paso 7: pagos con Original Pay.

## Estructura

Monorepo simple (decisión documentada en `docs/PROJECT_CONTEXT.md`):

| Carpeta | Contenido |
| --- | --- |
| `backend/` | API en Node.js + TypeScript + Express + Zod + Prisma |
| `frontend/` | React + TypeScript + Vite + Tailwind (tema claro/oscuro, logo, acceso, alta del negocio, «Mi negocio», lista de funnels, asistente de creación (arma la página con la plantilla; la IA se enchufa después) editor de la página con autoguardado, ajustes del funnel, publicar con su lista de requisitos, la página publicada en `/p/:slug` con su formulario, botones y medición, el tablero de leads por etapas, el dashboard con las métricas, el equipo con sus invitaciones el historial de versiones del editor y la compra en la página pública con la conexión de Original Pay) |
| `docs/` | Documentación del proyecto. **Empieza por `docs/PROJECT_CONTEXT.md`** |

El mapa completo de carpetas está en `docs/STRUCTURE.md`.

## Cómo levantar el entorno local

Requisitos: Node.js LTS, PNPM, Docker y Git.

1. Copia las variables y ajústalas:
   ```bash
   cp .env.example .env
   cp backend/.env.example backend/.env
   ```
2. Levanta la base de datos:
   ```bash
   docker compose up -d
   ```
3. Instala las dependencias del backend (también genera el cliente de Prisma) y aplica las migraciones a tu base local (necesita `DATABASE_URL` en `backend/.env`, igual a la base de `compose.yml`):
   ```bash
   cd backend && pnpm install
   ```
   ```bash
   pnpm db:deploy
   ```
   ```bash
   pnpm dev
   ```
   Comprueba que responde en `http://localhost:3000/health`.
4. Otros comandos del backend: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm db:migrate` (crear una migración nueva al cambiar `schema.prisma`) y `pnpm db:studio`.
5. Las pruebas de base de datos usan una base **real** y solo corren si defines `TEST_DATABASE_URL` (con las migraciones aplicadas). Usa una base de pruebas aparte, nunca la de desarrollo con datos que te importen.
6. Arranca el frontend. **Para solo navegar por las pantallas no necesitas backend, base de datos ni Docker**: copia `frontend/.env.example` como `frontend/.env` y deja `VITE_DEMO_MODE=true` (viene así); la aplicación responde sola y guarda lo que hagas en tu navegador. Para trabajar contra el backend real, pon `VITE_DEMO_MODE=false` y arranca el backend en el puerto 3000.
   ```bash
   cd frontend && pnpm install
   ```
   ```bash
   pnpm dev
   ```
   El **acceso real** a Original Auth se activa con `VITE_TOKEN_APP` y `VITE_ORIGINALAUTH_LOGIN_URL` (ver `frontend/.env.example`): la pantalla de acceso ofrece «Continuar con Original Auth», que regresa a `/auth/return` (o a `/auth/error`). Original Auth debe llamar además al callback del backend (`POST /api/v1/auth/callback`).
   Con el backend real, para iniciar sesión sin las credenciales reales de Original Auth usa el **acceso simulado**: copia `frontend/.env.example` como `frontend/.env` y, en `backend/.env`, deja `AUTH_MODE=mock_callback` con `ORIGINALAUTH_TOKEN_APP=token-app-de-desarrollo` y `ORIGINALAUTH_SECRET_KEY=cambia-este-secreto-local` (los mismos valores inventados que trae `.env.example`). La pantalla de acceso te deja entrar con cualquier correo. Ese modo solo existe en desarrollo: no entra en la compilación de producción.
   Se abre en `http://localhost:5173`; las llamadas a `/api` pasan por el servidor de Vite hacia el backend, así que no hay que configurar CORS para trabajar en local. Comandos: `pnpm test`, `pnpm typecheck`, `pnpm build`.

## Imagen de producción (frontend)

El frontend trae `frontend/Dockerfile`: compila con Node y sirve los archivos con nginx sin privilegios (puerto 8080, `/health` para el `HEALTHCHECK`, `index.html` para cualquier ruta de la aplicación, assets con huella en caché por un año). Construir y probar en local:

```bash
cd frontend && docker build --build-arg VITE_API_URL=https://api.ejemplo.com/api/v1 -t original-flow-frontend .
```

En EasyPanel la ruta de compilación es `frontend/`. Lo que el navegador necesita saber (`VITE_API_URL`, `VITE_TOKEN_APP` y `VITE_ORIGINALAUTH_LOGIN_URL`) se fija al **compilar** con `--build-arg` (son datos públicos, nunca secretos); para cambiarlos hay que volver a construir. Si la API está en otro dominio, ese dominio del frontend debe estar en `CORS_ORIGINS` del backend. El modo demostración nunca entra en la imagen.

## Documentación

| Archivo | Para qué |
| --- | --- |
| `docs/PROJECT_CONTEXT.md` | Qué es el proyecto, decisiones, stack, servicios, pendientes |
| `docs/ARCHITECTURE.md` | Arquitectura, modelo de datos, orden de construcción |
| `docs/API_MVP.md` | Contratos de la API del MVP |
| `docs/STRUCTURE.md` | Mapa de carpetas y archivos |
| `docs/GUIDELINES.md` | Reglas de trabajo (basadas en el playbook de The Original Lab) |

## Trabajo en equipo

Ramas `prod` (estable) y `dev` (integración); cada tarea en `feat/nombre`. Commits con prefijo (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`). Detalles en `docs/GUIDELINES.md`.
