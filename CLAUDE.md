# Original Flow — contexto para Claude

Plataforma SaaS multicliente para crear, publicar y medir funnels de conversión, con páginas generadas por IA, cobro con Original Pay y login con Original Auth. Proyecto de estadía en The Original Lab. **Todo en español** (producto, documentos, mensajes de commit y respuestas).

## Antes de hacer cualquier cosa

Lee `docs/PROJECT_CONTEXT.md` (qué es, decisiones, alcance, pendientes) y, según la tarea, `docs/ARCHITECTURE.md`, `docs/API_MVP.md`, `docs/STRUCTURE.md` y `docs/GUIDELINES.md`. Son la fuente de verdad; este archivo solo es un resumen.

## Estado

Pasos 1 a 6 del orden de construcción hechos: servidor base del backend, base de datos con Prisma 7 (14 tablas, migraciones), sesión con Original Auth en modo `mock_callback` (`/auth/*`, `/me`, `requireAuth`, auditoría), workspaces con equipo e invitaciones (`/workspaces*`, `services/permissions.ts`) y funnels sin IA (`/funnel-types`, `/funnels*`, registro de tipos y bloques en `funnel-types/`) y publicación con página pública (`/publish`, `/unpublish`, `/public/pages/:slug`, CORS y límite propios para `/public`) y captura pública (`/public/funnels/:slug/leads` y `/events`, `services/publicCapture.service.ts`), con pruebas contra base real. Siguiente: paso 7 (pagos con Original Pay), cuando la persona lo pida. El orden completo está en `docs/ARCHITECTURE.md`; el trabajo avanza paso a paso.

## Cómo trabajar (reglas del equipo)

- Se sigue el **project-playbook de The Original Lab** (stack, capas, seguridad, testing, git). Resumen aplicable en `docs/GUIDELINES.md`. Si algo se desvía del playbook, se anota en `docs/PROJECT_CONTEXT.md`.
- **Piezas chicas y verificables**: una cosa a la vez, con sus pruebas, y commit en cuanto funciona. No avances varios pasos sin que la persona lo apruebe.
- **Pregunta antes de decidir** lo importante (arquitectura, esquema de datos, seguridad, pagos, integraciones, dependencias nuevas). Lo menor se decide y se menciona.
- No inventes APIs, campos ni endpoints de los servicios TOL: sus contratos están en el playbook (`integrations/`) y se confirman con quien los mantiene.
- Nunca pegues ni escribas llaves reales; usa `.env` (ignorado por Git) y `.env.example` con placeholders.
- Ramas: `prod` y `dev`; trabajo en `feat/nombre`. Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`.
- La documentación se actualiza con cada avance, no al final (`docs/STRUCTURE.md` cuando cambien archivos).

## Stack

Backend: Node.js, TypeScript, Express, Zod, Prisma, PostgreSQL, Vitest, PNPM. Frontend: React, TypeScript, Tailwind, shadcn/ui, lucide, Vite, PNPM (aún vacío). Servicios: Original Auth, Original Pay, Media-as-a-Service, Original AI Engine. Sin Redis, sin n8n, sin servicio de correo (no existe).

## Reglas de código que más importan

- Capas del backend: `routes/` (validan y delegan) → `services/` (reglas y permisos) → `models/` y `schemas/`; servicios TOL solo desde `integrations/<servicio>/`. Un servicio nunca conoce HTTP.
- Máximo ~500 líneas por archivo. Variables de entorno solo en `backend/src/config/`.
- Toda entrada pasa por un schema Zod. Un recurso ajeno responde `404`, nunca `403`.
- Los campos JSON se validan al escribir y se leen de forma defensiva.

## Comandos

Base de datos local (desde la raíz, tras copiar `.env.example` a `.env`): `docker compose up -d`. Backend (desde `backend/`, con PNPM): `pnpm dev`, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm db:deploy`, `pnpm db:migrate`. Las pruebas de base de datos exigen `TEST_DATABASE_URL`. Los imports relativos llevan extensión `.js` (módulos ES `nodenext`).
