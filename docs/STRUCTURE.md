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
│   ├── Dockerfile           imagen de producción en dos etapas (compila con Node y sirve con nginx sin privilegios) con HEALTHCHECK a /health; la dirección de la API y los datos públicos de Original Auth se fijan al compilar (`--build-arg`)
│   ├── nginx.conf           servidor estático: /health, index.html para las rutas de la aplicación y caché larga solo para /assets
│   ├── nginx-headers.conf   encabezados de seguridad de toda respuesta
│   ├── .dockerignore        deja fuera node_modules, dist, pruebas y los .env
│   ├── public/              favicon (isotipo en morado)
│   ├── src/
│   │   ├── main.tsx, router.tsx   arranque y rutas (las privadas cuelgan de ProtectedRoute; cada pieza registra aquí sus pantallas)
│   │   ├── index.css        tokens de diseño claro/oscuro (docs/DESIGN.md) y tema de Tailwind
│   │   ├── assets/brand/    logotipo en dos capas: original-flow-logo.png (todo en morado salvo la palabra ORIGINAL) y original-flow-logo-word.png (solo esa palabra, como máscara)
│   │   ├── shared/          ui/ (Logo, ThemeToggle, Button, TextField, TextAreaField, SelectField, Combobox, Stepper, Modal), theme/ (ThemeProvider), utils/ (cn, permissions: único lugar donde se comparan roles; safeUrl: solo enlaces http/https; navigation: salir a otra dirección; publicUrl) roles.ts (nombre y descripción de cada rol), payments.ts (métodos de pago y reglas de la compra y de la conexión), history.ts (reglas del nombre de una versión), utils/dates.ts (fechas relativas y completas), blocks/ (modelo de la página: tipos, catálogo de los 15 bloques con sus campos y validación igual a la del backend), funnelTypes.ts (ajustes de cada tipo de funnel), publish.ts (requisitos para publicar), leads.ts (reglas del lead igual que el backend) y afterSubmit.ts (qué se muestra después de registrarse, según el tipo)
│   │   ├── services/        un archivo por entidad del backend: api.ts (cliente base), apiError.ts (ApiError y errores de campo), auth.ts (sesión, /me, acceso simulado), originalAuth.ts (el acceso real: la dirección de inicio de sesión y la espera de la validación), workspaces.ts, funnels.ts, publicPages.ts (página publicada, leads y eventos: sin sesión), leads.ts (etapas del tablero y leads del negocio), analytics.ts (las cifras del dashboard), members.ts (equipo e invitaciones), history.ts (versiones de un funnel), payments.ts (conectar Original Pay) y demo.ts + demoCore.ts + demoFunnels.ts + demoFunnelActions.ts + demoPublic.ts + demoLeads.ts + demoAnalytics.ts + demoMembers.ts + demoHistory.ts + demoPayments.ts + demoCheckout.ts + demoPay.ts (modo demostración: backend de mentira dentro del navegador, solo en desarrollo)
│   │   ├── features/auth/   AuthProvider (estado de sesión y acceso real), ProtectedRoute, sessionStore (dónde vive el token y el inicio de sesión pendiente) y components/ (AuthShell, el marco de las pantallas de acceso)
│   │   ├── features/workspaces/  WorkspaceProvider (negocios y negocio activo), RequireWorkspace, LoadState, brand.ts (paleta, rubros, diferencias), countries.ts (lista de países), useLogoFile.ts (imagen de la marca, solo en el navegador) y components/ (BusinessForm, PaletteEditor, BrandPreview, LogoUpload, PaymentsSection)
│   │   ├── features/funnels/ catalog.ts (tipos de funnel, plantillas con su paleta, instrucciones para la IA y pasos del asistente), components/ (ChoiceCard, TemplateThumb, WizardRail, BriefForm) y generation/ (PageGenerator: la interfaz que cumplirá la IA, templateGenerator que arma la página sin IA, createDraft y fillDraft)
│   │   ├── features/editor/ useFunnelEditor (carga, bloques, autoguardado), fieldHelpers.ts, components/ (BlockList, PropertiesPanel, FieldEditor, EditorTopBar, PublishDialog) y settings/ (ajustes: datos del funnel, ajustes del tipo y CTA)
│   │   ├── features/pageRenderer/ PageRenderer (modos editar, vista previa y público), blocks.tsx (cómo se dibuja cada bloque), public.tsx (lo que solo funciona en la página publicada: formulario, botones con su acción y cuenta regresiva) y theme.ts (paleta y estilo de cada plantilla)
│   │   ├── features/leads/    useLeadsBoard (etapas, leads, filtros, mover con vuelta atrás si falla, dar de alta y corregir), useAssignees (a quién se puede asignar un lead), leadDisplay.ts (cómo se muestra un lead), constants.ts y components/ (LeadBoard con arrastrar y soltar, LeadCard, LeadDetail, LeadForm para el alta a mano, LeadContactForm para corregir datos y asignar, y LeadFilters)
│   │   ├── features/dashboard/ useDashboard (carga todo con los filtros y conserva lo anterior al recargar), format.ts (conteos, porcentajes, dinero y variación) y components/ (DashboardFilters, StatTile, ChartCard con BarMark, ConversionCard, SourcesCard, DropOffCard y FunnelsCard)
│   │   ├── features/history/  useHistory (versiones, guardar y restaurar con sus errores explicados) y components/ (HistoryDialog)
│   │   ├── features/team/     useTeam (equipo, invitar y quitar con sus errores explicados) y components/ (InviteForm, MemberList y RemoveMemberDialog)
│   │   ├── features/publicPage/ constants.ts (tiempos), traffic.ts (origen de la visita y UTM), useTracker (visita, secciones vistas y clics, por lotes), useSeo (título, descripción e indexación), ThankYou (pantalla de después de registrarse, por tipo de funnel), CheckoutDialog (la compra), OrderResult (a dónde vuelve quien pagó) y checkoutConstants.ts (tiempos)
│   │   ├── layouts/         PlatformLayout (encabezado con el logo, menú lateral y selector de negocio), OnboardingLayout (alta, sin menú) y WizardLayout (asistente a pantalla completa)
│   │   └── pages/           LoginPage, AuthReturnPage (`/auth/return`, a donde regresa Original Auth) y AuthErrorPage (`/auth/error`), OnboardingPage (alta en 3 pasos), BusinessPage («Mi negocio»), FunnelsPage (lista), NewFunnelPage (asistente), EditorPage (editor de la página), PublicPage (la página publicada en `/p/:slug`, sin sesión ni logotipo de la plataforma), OrderPage (`/p/:slug/orden/:token`, el retorno del pago), DemoPayPage (la pasarela de mentira, solo en desarrollo), LeadsPage (tablero de leads), DashboardPage (métricas del negocio), TeamPage (equipo e invitaciones), NotFoundPage (404) y HomePage (el dashboard, o un saludo para quien no puede verlo); orquestadores de pantalla
│   └── tests/               Vitest + Testing Library (logo, tema, tokens, API, sesión, login, negocios y marca, modo demostración, combobox de países, imagen de la marca, bloques, funnels, generación de páginas, editor, ajustes, publicar, reglas del lead, página pública, leads (servicio, demostración, tablero y presentación), analítica, dashboard, equipo, historial, compra y pagos y que la compilación de producción no incluya el modo demostración); acceso real a Original Auth, helpers/fakeBackend.ts simula el backend, helpers/renderApp.tsx monta la app completa y helpers/publicApp.ts prepara un funnel publicado para las pruebas de la página pública y helpers/leadsApp.ts un negocio con leads para las del tablero
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
