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

## Diseño del frontend

- **Logotipo:** siempre el completo («ORIGINAL FLOW», no el isotipo), arriba a la izquierda en todas las pantallas de la plataforma, con el mismo tamaño y forma en claro y en oscuro. El embudo, «FLOW» y la línea son **morados (#7725BE) siempre**; **solo la palabra «ORIGINAL» cambia con el tema: negra en claro y blanca en oscuro**. El componente `Logo` no acepta props de color ni tamaño a propósito; pruebas lo vigilan.
- **Modo oscuro:** fondo un poco más claro y grisáceo que el del diseño original, con las superficies escalonadas por encima. Los tokens viven en `frontend/src/index.css`; los colores se usan por token de Tailwind (`bg-surface`, `text-text-2`...), nunca con valores sueltos.
- **Tema:** claro, oscuro o el del sistema; solo se guarda la preferencia visual en el navegador (nunca el token de sesión en `localStorage`).
- **Las páginas públicas de los clientes** usan la marca del cliente, no la de Original Flow, y se dibujan en este mismo proyecto en `/p/:slug`.

## Sesión en el frontend

- **Todo `fetch` pasa por `services/`** y lo consumen solo los hooks o proveedores; los componentes no llaman a la API.
- **El token de sesión vive solo en `features/auth/sessionStore.ts`** (hoy `sessionStorage`; nunca `localStorage`). Está aislado para poder cambiarlo por una cookie `HttpOnly` cuando Original Auth confirme su mecanismo.
- **Rutas privadas:** se declaran bajo `ProtectedRoute` una sola vez; sin sesión mandan a `/login` y recuerdan a dónde iba la persona. Si el servidor no responde, la sesión guardada no se borra y se ofrece reintentar; solo un `401` la descarta.
- **Acceso simulado a Original Auth** (`VITE_AUTH_MODE=mock_callback`) y **modo demostración** (`VITE_DEMO_MODE=true`): solo en desarrollo y con valores inventados. No deben existir en producción: una prueba (`tests/productionBundle.test.ts`) compila en modo producción con todo encendido y falla si queda cualquier rastro. Para que Vite pueda eliminarlos, cada uso lleva un `import.meta.env.DEV` explícito en el lugar donde se decide (no solo dentro de una función auxiliar). Nunca se usan llaves reales en variables `VITE_*`.
- **Modo demostración** (`services/demo.ts`): responde dentro del navegador los mismos endpoints, formatos y errores que el backend (autenticación, `/me` y negocios) y guarda en `localStorage`. Cada vez que se conecte un endpoint nuevo en el front, se agrega también aquí (hoy: autenticación, `/me`, negocios, funnels —crear, listar, abrir, guardar, publicar y despublicar— las rutas públicas de la página, los leads y los eventos, y los leads del tablero con sus etapas). Las pruebas no dependen del `.env` de quien las corre (arrancan con el modo demostración apagado).
- **Cáscaras:** una pantalla puede construirse primero solo como maqueta navegable (datos de ejemplo, sin llamadas a la API) y lo dice en pantalla. Al conectarla se usa el servicio, y el modo demostración lo responde sin backend.

## Negocios en el frontend

- **El negocio activo** sale de `useWorkspaces()` (`features/workspaces/`); las pantallas de la plataforma cuelgan de `RequireWorkspace`, que espera a la lista y manda a `/bienvenida` si la persona todavía no tiene ninguno. La elección se recuerda en `localStorage` (`of-workspace`): es una preferencia, no un dato sensible.
- **Editar solo manda lo que cambió** (`diffWorkspace`): un campo opcional que se vacía se manda como `null` y, si no cambió nada, no hay llamada.
- **Errores de validación (422):** `ApiError.fieldErrors()` convierte `details` en un mensaje por campo; cada formulario los muestra junto a su campo.
- **Permisos en pantalla:** solo con `canManageWorkspace(role)` (`shared/utils/permissions.ts`). Es para decidir qué mostrar; el backend vuelve a comprobar todo.
- **País:** se elige en un `Combobox` (`shared/ui/Combobox.tsx`, patrón ARIA) con la lista de `features/workspaces/countries.ts`; se guarda el nombre en español. Un valor antiguo que no esté en la lista se muestra tal cual hasta que se elija otro.
- **Imagen de la marca:** `useLogoFile` la guarda solo en el navegador (sin subirla) y libera la dirección temporal al cambiarla o salir. Tipos PNG, JPG, WebP o SVG, hasta 5 MB. «Sugerir paleta con IA» es hoy una maqueta con una paleta de ejemplo; se conecta a Original AI Engine y a Media-as-a-Service más adelante.
- **La marca del cliente** (paleta de 5 colores) se muestra con estilos en línea, porque no es parte de los tokens de la plataforma; la plataforma nunca se pinta con ella.

## Páginas: bloques, generación y editor

- **El catálogo de bloques es la fuente de verdad en el front** (`shared/blocks/catalog.ts`): de ahí salen los campos del panel de propiedades, el contenido inicial y la validación (`validate.ts`), que copia las reglas del backend (`backend/src/funnel-types/blocks.ts`). Si el backend cambia un bloque, se cambia aquí y la prueba de validación lo refleja; el modo demostración usa esa misma validación para responder como el servidor.
- **La primera versión de la página la arma un `PageGenerator`** (`features/funnels/generation`). Hoy es `templateGenerator` (plantilla + textos de lo que la persona escribió + paleta de la marca). Para usar IA se escribe otro generador que devuelva el mismo `GeneratedPage` (por ejemplo llamando a `POST /funnels/:id/generate`) y se cambia `pageGenerator`; el asistente y el editor no se tocan. Si el generador ya guardó la página, marca `persisted`.
- **El asistente crea el borrador y luego lo llena** (`createDraft` + `fillDraft`): si armar la página falla se reintenta sobre el mismo funnel, sin crear otro.
- **Autoguardado del editor:** con debounce (`features/editor/constants.ts`), una petición a la vez (lo que cambie mientras se guarda se manda después), **nunca se guarda con campos inválidos** (se avisa y no se pierde lo escrito mientras la persona siga en la pantalla), al salir se guarda lo pendiente y salir con cambios que no se pudieron guardar pide confirmar. Un campo opcional que se deja vacío se quita del contenido (el backend rechaza textos vacíos).
- **Publicar:** `shared/publish.ts` (`findPublishProblems`) copia los requisitos del backend y el diálogo de publicar los muestra como lista (con un botón para arreglar cada uno) **antes** de intentar; el servidor siempre vuelve a comprobar y manda la última palabra (por ejemplo, Original Pay solo lo sabe él). Antes de revisar se guarda lo pendiente de la página. Solo super admin, administrador y marketing publican (`canPublishFunnels`); el diseñador edita pero no publica.
- **Ajustes del funnel:** datos (nombre, dirección/slug, precio y divisa si cobra), ajustes propios del tipo (`shared/funnelTypes.ts`, con el mismo formato de campos que los bloques) y a dónde lleva cada CTA. Cada parte se guarda con su botón y **nunca se guarda incompleta** (el backend valida los ajustes completos). Si el backend cambia el esquema de un tipo, se cambia en `funnelTypes.ts`.
- **Renderizador de páginas** (`features/pageRenderer`): usa solo los colores y el estilo de la página (la marca del cliente); es el mismo en el editor, la vista previa y la página pública (`mode`), y lo que solo funciona en la pública (formulario, botones, cuenta regresiva) vive en `public.tsx`.

## Leads en el frontend

- **El tablero** (`/leads`, `features/leads`) trae las etapas, los funnels (para filtrar) y los leads del negocio activo (hasta 100, los más recientes) con los filtros de funnel y texto. Un lead nuevo entra siempre en la primera etapa. El buscador espera `SEARCH_DELAY_MS` tras la última tecla para no pedir en cada letra.
- **Mover un lead** (arrastrándolo o con el selector «Etapa» del detalle) se ve al instante; si el servidor lo rechaza, el lead vuelve a su columna y se avisa. Solo cuenta la última petición de cada lead: si se mueve dos veces seguidas, la respuesta vieja no pisa a la nueva. Arrastrar solo funciona con mouse; en pantallas táctiles y con teclado se usa el selector del detalle.
- **Permisos** (solo en `shared/utils/permissions.ts`): `canViewLeads` (todos menos el diseñador) y `canManageLeads` (lo mismo, salvo el analista, que solo mira: sin arrastrar, sin cambiar la etapa ni el valor). El menú oculta «Leads» a quien no puede verlos y la pantalla muestra un aviso sin pedir datos.
- **Todo lo que escribió quien llenó el formulario se muestra como texto**, nunca como HTML. Los enlaces `mailto:` y `tel:` solo se generan si el dato tiene una forma segura (un correo con `?`, `&` o `%` se muestra sin enlace, para que no precargue destinatarios ni texto). Los campos internos de `customFields` (los que empiezan con guion bajo, como `_consentAt`) no se muestran.
- **El valor estimado no lleva símbolo de moneda**: el lead no guarda en qué divisa está.

## Historial de versiones en el frontend

- **Se abre desde el botón «Historial» de la barra del editor** (`features/history`). Muestra las versiones del funnel de la más nueva a la más vieja, con su nombre, quién la guardó y cuándo (relativo, con la fecha completa al pasar el cursor). Publicar guarda solo una versión «Publicado»; las demás las guarda la persona con un nombre (1 a 120 caracteres, `shared/history.ts`).
- **Guardar una versión primero guarda lo que esté pendiente en el editor** (`saveNow`), para que lo último que se escribió entre en la versión. Si la página tiene campos con errores no se guarda ni se restaura, y se explica.
- **Restaurar pide confirmar y se puede deshacer**: antes de aplicar la versión, el servidor guarda cómo estaba la página en una versión nueva («Antes de restaurar «X»»). Se restauran el contenido, el diseño, la marca, el SEO y el flujo; **no** el nombre, el precio, la dirección, el estado ni los ajustes del tipo. Al terminar, el editor cambia todo lo que muestra por el funnel restaurado (`replaceFunnel`) como si se acabara de abrir. Los CTA se ajustan a los botones y formularios de la versión.
- **Permisos**: guardar y ver versiones, quien edita funnels (incluido el diseñador); restaurar, quien puede publicar (`canRestoreHistory`, en `permissions.ts`): el diseñador no ve el botón «Restaurar».
- **Todavía no hay vista previa de una versión** (la API no devuelve la copia en la lista) ni comparar versiones.

## Equipo en el frontend

- **`/equipo`** (`features/team`) lo ve solo quien administra el negocio (`canManageWorkspace`: super admin y administrador); los demás roles no ven «Equipo» en el menú y, si entran por la dirección, solo ven un aviso sin que se pida nada al servidor. Es lo mismo que exige el backend para listar, invitar y quitar.
- **Invitar** es por correo y rol (los cinco invitables; `super_admin` nunca). **No se manda ningún correo** (no existe el servicio): si la persona ya tiene cuenta queda activa y se dice; si no, queda «Invitado», se le explica a quien invita que tiene que avisarle y que tendrá acceso cuando entre con ese correo. Cada rol muestra una línea de lo que puede hacer (`shared/roles.ts`, que sigue la tabla de permisos de `docs/API_MVP.md`); quién puede qué se decide solo en `utils/permissions.ts`.
- **Los errores se explican en su sitio**: correo vacío o mal escrito (sin pedir nada), persona que ya es parte o ya fue invitada (`409`, en el campo del correo, sin vaciarlo para que lo corrija) y los demás, con «Inténtalo de nuevo».
- **Quitar** pide confirmar y avisa qué acceso se pierde (a un administrador, el de todos los negocios del cliente). Si el servidor dice que es el único administrador (`409 LAST_CLIENT_ADMIN`) se explica y la persona sigue; si ya no estaba (`404`) se cierra y se vuelve a pedir el equipo. A uno mismo no se le ofrece «Quitar».
- **Todavía no hay**: cambiar el rol de alguien (el backend no tiene ese endpoint) ni reenviar una invitación. En la demostración, quien creó el negocio no se puede quitar, y una persona invitada no puede entrar con su rol (el acceso de la demostración es solo del dueño), así que los roles se prueban en las pruebas y no navegando.

## Dashboard en el frontend

- **Es la pantalla de inicio (`/`)** para quien puede verla (`canViewDashboard`: todos menos el diseñador, que ve un saludo y no pide nada). Todo sale de `/analytics/*`; el front solo dibuja la respuesta.
- **Una sola fila de filtros arriba** (periodo de 7, 30 o 90 días y funnel) que vale para todo lo que está debajo: las cifras, las gráficas y la tabla siempre coinciden. Al cambiar un filtro se sigue viendo lo anterior, atenuado (`aria-busy`), sin volver a «Cargando…»; si dos cambios se cruzan, gana el último. El abandono por sección es de una sola página, así que pide elegir un funnel.
- **La forma sigue al dato** (guía de visualización de datos): cifras sueltas con su cambio frente al periodo anterior (flecha y texto, nunca solo color); el embudo y los orígenes como barras con los números siempre escritos al lado; el abandono por sección con **énfasis** (todas las barras en gris y la sección donde más gente se va en el color de la marca, con su etiqueta); el rendimiento por funnel como tabla. No hay doble eje, ni una cifra en cada punto, ni el tooltip como única vía: cada gráfica es una `<table>` con título y encabezados, que es su equivalente accesible.
- **Colores de las gráficas**: tokens `--chart-1` (un color de serie) y `--chart-ramp-1…6` (etapas en orden, de la más clara a la más intensa), definidos en claro y en oscuro en `index.css` y **validados con el validador de paletas** (banda de luminosidad, contraste contra la superficie, pasos distinguibles). El gris de lo que no se destaca es `--muted`. Para cambiarlos hay que volver a validarlos.
- **Marcas**: barras de 20 px con la punta de 4 px redondeada y pegadas a una sola línea base; una etapa con poca gente se ve igual (mínimo 1,5 %). Lo que escribió un visitante (por ejemplo un origen) se muestra siempre como texto.
- **El dinero va por divisa** (cada funnel cobra en la suya): nunca se suman monedas distintas; con una sola divisa se muestra su cambio. Mientras no haya pagos, Ingresos y Ticket promedio dicen «Llega con los pagos.».
- **Columnas opcionales** (porcentaje de la etapa anterior, parte del total) aparecen solo si la tarjeta tiene ancho de sobra (consultas de contenedor de Tailwind), no según el ancho de la ventana.
- **La demostración calcula todo** (`services/demoAnalytics.ts`) con las definiciones de `docs/API_MVP.md`; el backend real todavía no tiene estos endpoints.

## Páginas públicas en el frontend

- **`/p/:slug` no pide sesión y no lleva el logotipo de la plataforma.** Es del cliente. Los mensajes de «no disponible», «no se pudo cargar» y «cargando» son neutros. Un funnel en borrador, inexistente o con la dirección mal escrita responden igual (el servidor da el mismo `404`).
- **Todo enlace que viene de los datos** (botón, calendario, video, redirección o enlace de agradecimiento) pasa por `safeHttpUrl` (`shared/utils/safeUrl.ts`): solo `http` y `https`. El validador de URL de Zod acepta `javascript:`, así que no basta. Si el destino no es seguro el botón queda deshabilitado y no se ofrece el enlace.
- **El formulario valida antes de mandar** con `shared/leads.ts`, que copia las reglas del backend (consentimiento exactamente `true`, correo o teléfono, solo los UTM permitidos, máximo 30 campos extra), y muestra cada error del servidor (`422`) junto a su campo. El correo va en `email`, el nombre en `name`, el teléfono en `phone` y el resto en `customFields`.
- **Medición de mejor esfuerzo** (`useTracker`): visita (una sola vez, con su origen), secciones vistas (una sola vez por visita, con `IntersectionObserver`) y clics en botones, por lotes de hasta 20. Se manda al ocultar o cerrar la página con `keepalive`. Si falla, no se reintenta ni se le avisa a la persona. El origen sale de `utm_source` o del sitio de donde llegó (si no es el propio); los parámetros se leen del router, no de `window.location`.
- **Después de registrarse** se reemplaza la página por la pantalla de gracias del tipo de funnel (`ThankYou`, con lo que devolvió el servidor en `next`): leads agradece y, si hay enlace seguro, lleva ahí a los 3 segundos (con botón «Continuar ahora»); citas ofrece elegir horario; webinar da la fecha en la zona del evento y el enlace para entrar; magnet avisa que la descarga aún no está disponible. Los tiempos están en `features/publicPage/constants.ts`.
- **Hoy no funcionan** (a propósito): el botón de pago (deshabilitado hasta Original Pay) y la descarga del recurso de un magnet (necesita Media-as-a-Service).
- **El modo demostración responde `/public/*`** (`services/demoPublic.ts`) con las mismas reglas y errores del backend y guarda leads y eventos en el navegador, así que `/p/:slug` se puede probar sin servidor después de publicar un funnel.

## Documentación

- Existen y se mantienen vivos: `PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `STRUCTURE.md` y `GUIDELINES.md`, más `API_MVP.md` y `CLAUDE.md` en la raíz.
- Se actualizan **con cada avance**, no al final. Al terminar una funcionalidad significativa se agrega su archivo en `docs/feats/` mientras el contexto está fresco.
- Si un endpoint cambia, `docs/API_MVP.md` se actualiza en el mismo commit.

## Convenciones específicas de Original Flow

- Todo el producto, los mensajes de error visibles, los commits y la documentación van en **español**.
- Los roles se comprueban en `services/` contra el módulo de permisos; nunca se compara el rol crudo en rutas ni en el frontend.
- Las landing pages que publica un cliente usan **la marca del cliente**, no la de Original Flow.
- Los tipos de funnel y los bloques son definiciones en código; agregar uno no modifica la base de datos.
