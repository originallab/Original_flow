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
├── frontend/                React + TypeScript + Vite + Tailwind (PNPM)
│   ├── index.html           aplica el tema guardado antes de pintar (sin parpadeo)
│   ├── vite.config.ts       Vite, Tailwind, alias @ y proxy de /api hacia el backend (puerto 3000)
│   ├── .env.example         VITE_API_URL (solo variables VITE_*; nunca secretos)
│   ├── public/              favicon (isotipo en morado)
│   ├── src/
│   │   ├── main.tsx, router.tsx   arranque y rutas (las privadas cuelgan de ProtectedRoute; cada pieza registra aquí sus pantallas)
│   │   ├── index.css        tokens de diseño claro/oscuro (docs/DESIGN.md) y tema de Tailwind
│   │   ├── assets/brand/    logotipo en dos capas: original-flow-logo.png (todo en morado salvo la palabra ORIGINAL) y original-flow-logo-word.png (solo esa palabra, como máscara)
│   │   ├── shared/          ui/ (Logo, ThemeToggle, Button, TextField, TextAreaField, Combobox, Stepper), theme/ (ThemeProvider), utils/ (cn, permissions: único lugar donde se comparan roles) y blocks/ (modelo de la página: tipos, catálogo de los 15 bloques con sus campos y validación igual a la del backend)
│   │   ├── services/        un archivo por entidad del backend: api.ts (cliente base), apiError.ts (ApiError y errores de campo), auth.ts (sesión, /me, acceso simulado), workspaces.ts, funnels.ts y demo.ts + demoCore.ts + demoFunnels.ts (modo demostración: backend de mentira dentro del navegador, solo en desarrollo)
│   │   ├── features/auth/   AuthProvider (estado de sesión), ProtectedRoute y sessionStore (dónde vive el token)
│   │   ├── features/workspaces/  WorkspaceProvider (negocios y negocio activo), RequireWorkspace, LoadState, brand.ts (paleta, rubros, diferencias), countries.ts (lista de países), useLogoFile.ts (imagen de la marca, solo en el navegador) y components/ (BusinessForm, PaletteEditor, BrandPreview, LogoUpload)
│   │   ├── features/funnels/ catalog.ts (tipos de funnel, plantillas con su paleta, instrucciones para la IA y pasos del asistente), components/ (ChoiceCard, TemplateThumb, WizardRail, BriefForm) y generation/ (PageGenerator: la interfaz que cumplirá la IA, templateGenerator que arma la página sin IA, createDraft y fillDraft)
│   │   ├── features/editor/ useFunnelEditor (carga, bloques, autoguardado), fieldHelpers.ts y components/ (BlockList, PropertiesPanel, FieldEditor, EditorTopBar)
│   │   ├── features/pageRenderer/ PageRenderer, blocks.tsx (cómo se dibuja cada bloque) y theme.ts (paleta y estilo de cada plantilla); lo reutilizará la página pública
│   │   ├── layouts/         PlatformLayout (encabezado con el logo, menú lateral y selector de negocio), OnboardingLayout (alta, sin menú) y WizardLayout (asistente a pantalla completa)
│   │   └── pages/           LoginPage, OnboardingPage (alta en 3 pasos), BusinessPage («Mi negocio»), FunnelsPage (lista), NewFunnelPage (asistente), EditorPage (editor de la página) y HomePage (temporal); orquestadores de pantalla
│   └── tests/               Vitest + Testing Library (logo, tema, tokens, API, sesión, login, negocios y marca, modo demostración, combobox de países, imagen de la marca, bloques, funnels, generación de páginas, editor y que la compilación de producción no incluya el modo demostración); helpers/fakeBackend.ts simula el backend y helpers/renderApp.tsx monta la app completa
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
