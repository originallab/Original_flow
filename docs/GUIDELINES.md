# Original Flow — Guías de trabajo

Reglas específicas de este proyecto. Para lo general se remite al **project-playbook de The Original Lab** (`01-stack-estandar`, `02-arquitectura-base`, `03-seguridad`, `04-testing-y-calidad`, `05-documentacion-obligatoria`, `06-flujo-de-trabajo-git`, `07-deployment-e-infra`, `08-integracion-servicios-tol`, `09-trabajo-con-ia`). Aquí solo se resume lo que más se usa y lo particular de Original Flow. Si algo se desvía del playbook, se anota en `docs/PROJECT_CONTEXT.md`.

## Forma de trabajo

- **Piezas chicas y verificables.** Una cosa a la vez; se prueba y se hace commit en cuanto funciona. No se acumulan cientos de líneas sin un commit en medio.
- **Plan antes de código** en cualquier tarea no trivial: se escribe el plan, se revisa y recién entonces se implementa.
- **Se decide entre dos.** Lo importante (arquitectura, esquema de datos, seguridad, pagos, integraciones, dependencias nuevas) se acuerda antes; lo menor se decide y se menciona.
- **La IA acelera, no reemplaza el criterio.** Se lee el diff real, no el resumen; si no se puede explicar qué hace el código, no se mergea. Cuidado con tests escritos por el mismo agente que escribió el código: se revisa cada `assert`.
- **Sesiones cortas.** Cada sesión de trabajo arranca leyendo `docs/` (empezando por `PROJECT_CONTEXT.md`); al cerrar, se deja un resumen de dónde se quedó.
- **Nunca se pegan secretos** (llaves, `.env` reales) en chats ni documentos; se usan placeholders.

## Git

- **Ramas:** `prod` (estable, rama por defecto) y `dev` (integración). Cada tarea sale de `dev` como `feat/lo-que-se-trabaja` (el prefijo `feat/` se usa aunque sea un arreglo).
- **Commits:** prefijo + dos puntos + descripción corta en imperativo: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `style:`, `chore:`. Ejemplo: `feat: agregar endpoint de reembolsos parciales`.
- **Pull Request** revisado por la otra persona antes de mergear a `dev` o `prod`; branch protection en ambas ramas.
- **Avisar** antes de mergear o probar en una rama compartida («voy a usar dev unos minutos»).
- **Antes de mergear:** pruebas en verde, diff revisado, sin credenciales ni `console.log` de depuración, y revisión de código/seguridad del asistente de IA si el cambio toca auth, pagos o datos personales.
- **Repo:** privado, bajo la organización de la empresa. `.gitignore` y README desde el primer commit.

## Arquitectura del backend

- Capas: `routes/` → `services/` → `models/` y `schemas/`; servicios TOL solo desde `integrations/<servicio>/`. Ver `docs/ARCHITECTURE.md`.
- **Un servicio nunca conoce HTTP**; una ruta nunca contiene lógica de negocio ni consultas.
- **Ningún archivo supera ~500 líneas.** Si crece, se extrae por responsabilidad.
- **Prisma 7:** la URL de la base está en `backend/prisma.config.ts` (no en `schema.prisma`) y el cliente se crea con el adaptador de PostgreSQL (`src/models/prisma.ts`). La versión está fija (`7.10.1`); cambiarla se hace a propósito, con su guía de migración. Un cambio de modelo = editar `schema.prisma` + `pnpm db:migrate` + actualizar `docs/ARCHITECTURE.md` en el mismo commit.
- **Registros:** `AuditLog` es de solo lectura (disparador en la migración): nunca se agrega un endpoint ni una función que lo actualice o borre.
- **Módulos ES con `nodenext`:** los imports relativos llevan la extensión `.js` aunque el archivo sea `.ts` (`import { x } from './x.js'`). Es lo que exige Node al ejecutar lo compilado.
- **Errores:** los servicios lanzan `AppError` (`backend/src/lib/errors.ts`) con un código estable; nunca construyen la respuesta HTTP. El `errorHandler` la arma, y ante un error inesperado responde `500` genérico y deja el detalle solo en el log.
- **Logs de petición:** se registra el patrón de la ruta (`/public/orders/:publicToken`), no la URL real, para no dejar tokens ni datos de visitantes.
- **Configuración centralizada:** las variables de entorno se leen solo en `backend/src/config/`, nunca `process.env.X` suelto.
- **Validación:** toda entrada pasa por un esquema Zod antes de la lógica; jamás un objeto crudo del cliente a la base de datos.
- **Campos JSON** (`content`, `designSpec`, `brandBrief`, `seo`, `typeConfig`, `paymentConfig`...): se validan al escribir y se leen de forma defensiva.
- **Variantes del mismo tipo de cosa** (tipos de funnel, métodos de pago): despacho por registro, no `if/else` por nombre; agregar una variante no toca el flujo principal.
- **Formato de error** hacia el frontend: `{ success: false, error: { code, message, details }, requestId }` con `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`.
- **Integraciones:** cada servicio de The Original Lab se consume desde su cliente (`client.ts`, `types.ts`, `config.ts`); el cliente traduce errores y respuestas al formato propio. Antes de integrar uno, su ficha en el playbook (`integrations/`) debe estar completa; si falta algo, se confirma con quien lo mantiene, sin adivinar.
- **Logs:** cada llamada saliente a un servicio TOL queda registrada con `requestId`, servicio, operación, duración y status. Se separan log operativo y log de auditoría (pendiente de diseño, ver `docs/ARCHITECTURE.md`).

## Seguridad (mínimos obligatorios)

- **Auth a nivel de grupo de rutas**, no endpoint por endpoint: un endpoint nuevo en un router protegido queda protegido solo.
- **Sin credenciales en el código** ni en archivos versionados. `.env` real ignorado por Git; `.env.example` con placeholders.
- **Nunca devolver ni loguear secretos** (la `apiKey` de Original Pay de cada workspace, tokens...). Las respuestas omiten esos campos de forma explícita.
- **IDOR:** toda acción por id aplica el mismo filtro de acceso que el listado; si el recurso existe pero no es de quien pregunta, responde **`404`** (no `403`).
- **CORS** con lista explícita de orígenes; nunca `*` junto con credenciales. **Encabezados de seguridad** con `helmet`.
- **Sesión:** el token no se guarda en `localStorage`; se confirma con Original Auth si va en cookie `HttpOnly` + `Secure` + `SameSite` (con protección CSRF en mutaciones).
- **Cifrado correcto para cada caso:** contraseñas con hash lento (aquí no aplica: el login es de Original Auth); firmas entre sistemas con HMAC-SHA256 más timestamp; secretos que hay que volver a leer (apiKey de Original Pay) con cifrado reversible y la clave fuera del repositorio.
- **Pagos:** el monto se recalcula siempre en el servidor desde `Funnel.price`; el cobro es idempotente; toda transacción queda auditada; no se guardan datos de tarjeta.
- **Endpoints públicos o costosos** (leads, eventos, checkout, IA) con límite de peticiones; se decide a propósito si falla abierto o cerrado.
- **Datos personales de `Lead`:** no se escriben en los registros técnicos.

## Pruebas

- Vitest. **Toda funcionalidad nueva lleva su prueba de camino feliz y de camino denegado** (`401`, `403`/`404`, `422`, cuota excedida) como parte de terminarla.
- **Si aparece un bug, primero el test que lo reproduce**, luego el arreglo.
- **No se mockea la base de datos propia** en pruebas de integración (se usa una real, con `TEST_DATABASE_URL`; sin esa variable esas pruebas se saltan y el resultado lo dice); **sí se mockean** las llamadas HTTP a servicios externos (Original Pay, Original Auth, Media-as-a-Service, Original AI Engine).
- **Aislamiento:** las pruebas corren en serie (`fileParallelism: false` en `vitest.config.ts`) porque comparten una base real, y cada prueba crea datos con valores únicos; no se aceptan fallos intermitentes.
- Un solo archivo de setup compartido para las pruebas.
- Checklist pre-merge: pruebas al 100 %, ningún archivo sobre el límite de líneas, sin `console.log`, sin credenciales en el diff, documentación actualizada.

## Docker local

- Se levanta con `docker compose up -d` desde la raíz, después de copiar `.env.example` a `.env`.
- El archivo de variables se llama **`.env`** a propósito y `compose.yml` usa `${VAR:?mensaje}`: así, si falta una variable, Compose falla con un error claro en vez de asignar en silencio un puerto aleatorio (problema documentado en el playbook, `07`).
- Si algo se conecta a la base equivocada sin error, lo primero es `docker port original-flow-db` para comparar el puerto real con el esperado.

## Documentación

- Existen y se mantienen vivos: `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `STRUCTURE.md` y `GUIDELINES.md`, más `API_MVP.md` y `CLAUDE.md` en la raíz.
- Se actualizan **con cada avance**, no al final. Al terminar una funcionalidad significativa se agrega su archivo en `docs/feats/` mientras el contexto está fresco.
- Si un endpoint cambia, `docs/API_MVP.md` se actualiza en el mismo commit.

## Convenciones específicas de Original Flow

- Todo el producto, los mensajes de error visibles, los commits y la documentación van en **español**.
- Los roles se comprueban en `services/` contra el módulo de permisos; nunca se compara el rol crudo en rutas ni en el frontend.
- Las landing pages que publica un cliente usan **la marca del cliente**, no la de Original Flow.
- Los tipos de funnel y los bloques son definiciones en código; agregar uno no modifica la base de datos.
