# Original Flow — Estructura del repositorio

Mapa de carpetas y archivos. **Se actualiza cuando se crean, eliminan o mueven archivos** (regla del playbook, `05-documentacion-obligatoria.md`). Las carpetas con solo un `.gitkeep` están vacías a propósito: Git no guarda carpetas vacías y el `.gitkeep` las conserva hasta que haya código.

```
original_flow/
├── .gitignore               ignora node_modules, .env reales, dist, logs y configuración local
├── .env.example             variables para la base de datos local (Docker)
├── compose.yml              entorno local: PostgreSQL 16 (el backend se agrega en el paso 1)
├── CLAUDE.md                contexto para el asistente de IA: qué es, reglas y punteros a docs/
├── README.md                qué es el proyecto y cómo levantarlo
├── backend/                 API (Node.js + TypeScript + Express + Zod + Prisma)
│   ├── .env.example         variables del backend (servicios TOL, base de datos, CORS)
│   ├── package.json         scripts: dev, build, start, typecheck, test (gestor: PNPM)
│   ├── pnpm-lock.yaml       versiones exactas instaladas (se versiona)
│   ├── tsconfig.json        TypeScript estricto (typecheck de src, tests y config)
│   ├── tsconfig.build.json  compilación de producción: solo src/ hacia dist/
│   ├── vitest.config.ts     configuración de pruebas
│   ├── prisma.config.ts     configuración de Prisma 7 (URL de la base, ruta de migraciones)
│   ├── prisma/
│   │   ├── schema.prisma    modelo de datos (14 tablas)
│   │   └── migrations/      migraciones SQL (init y audit_log_inmutable)
│   ├── src/
│   │   ├── server.ts        arranque: carga la config, crea la app y escucha
│   │   ├── app.ts           createApp(config, logger): middleware globales y montaje de rutas
│   │   ├── config/          única lectura de variables de entorno (loadConfig, validada con Zod)
│   │   ├── lib/             piezas sin dependencias de negocio: AppError, logger, safeEqual (secretos en tiempo constante), paginación, slug y errores de Prisma
│   │   ├── routes/          reciben el request, validan con Zod y delegan: health, auth y public (públicas), me, workspaces, funnel-types y funnels (privadas); index.ts monta /api/v1
│   │   ├── services/        reglas de negocio y permisos: auth, me, audit, access (rol en un workspace), workspace, funnel, funnelContent, funnelPublish, publicPage, publicCapture y permissions.ts (qué puede hacer cada rol)
│   │   ├── schemas/         esquemas Zod de entrada, salida y campos JSON (auth, workspace, funnel y public)
│   │   ├── models/          acceso a datos: prisma.ts (cliente con adaptador de PostgreSQL) y una consulta por entidad (session, user, membership, workspace, funnel, cta, lead, event, auditLog)
│   │   ├── generated/       cliente de Prisma generado (no se versiona; `pnpm db:generate`)
│   │   ├── middleware/      requestId, requestLogger, errorHandler (+ notFound), requireAuth y rateLimit
│   │   ├── jobs/            tareas programadas (reconciliación de pagos cada 5 min)
│   │   ├── funnel-types/    registro de los 8 tipos de funnel (index.ts) catálogo de bloques con su validación (blocks.ts), plantillas (templates.ts) y qué ve el visitante tras registrarse (afterSubmit.ts)
│   │   └── integrations/    un cliente por servicio de The Original Lab
│   │       ├── original-auth/
│   │       ├── original-pay/
│   │       ├── media-aas/
│   │       └── ai-engine/
│   └── tests/               pruebas con Vitest (config, app, errores, límite, esquema de datos, auth, /me, workspaces, tipos de funnel, funnels, publicación y captura pública); helpers/testApp.ts, db.ts y auth.ts
├── frontend/                React + Vite + Tailwind (vacío hasta que empiece el frontend)
└── docs/
    ├── PROJECT_CONTEXT.md   qué es, alcance, decisiones, stack, servicios y pendientes
    ├── ARCHITECTURE.md      arquitectura, modelo de datos y orden de construcción
    ├── API_MVP.md           contratos de la API del MVP
    ├── STRUCTURE.md         este archivo
    ├── GUIDELINES.md        reglas de trabajo basadas en el playbook
    └── design/
        └── modelo-datos/    diagramas ER (5 imágenes) y schema.sql (copia de las migraciones)
```

## Archivos que todavía no existen (y cuándo se crean)

| Archivo | Se crea en |
| --- | --- |
| `backend/Dockerfile` (con `HEALTHCHECK`) y `.dockerignore` | Antes del primer despliegue en EasyPanel |
| `docs/DEV_SETUP.md` | En cuanto levantar el entorno deje de ser un comando obvio |
| `docs/feats/` | Al terminar cada funcionalidad significativa |
| `docs/design/` (pantallas y prototipo) | Cuando se decida incorporarlos |
