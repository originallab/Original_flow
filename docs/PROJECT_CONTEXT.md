# Original Flow — Contexto del proyecto

> Documento fundacional. Reúne todo lo necesario para entender el proyecto sin haber estado en las conversaciones: qué es, qué entra en el MVP, qué se decidió, con qué stack, qué servicios usa y qué falta resolver. Se actualiza con cada decisión, no al final.

## Qué es

Original Flow es una plataforma SaaS multicliente para **crear, publicar, automatizar y medir funnels de conversión** (páginas web orientadas a conseguir contactos, ventas, citas o registros). Un negocio entra con su cuenta, define su marca y la plataforma **genera la página con inteligencia artificial** a partir de unas preguntas sencillas. La persona puede editarla bloque por bloque, publicarla, cobrar dentro de la misma página con Original Pay si vende un producto, recibir los contactos en un tablero tipo kanban y ver métricas: de dónde llegan los clics y en qué parte de la página abandonan los visitantes.

El problema que resuelve: hoy la landing, el formulario, el cobro y las métricas viven en herramientas separadas y el visitante escribe sus datos más de una vez. En Original Flow la página, el lead, el pago y la analítica comparten un solo modelo de datos.

## Contexto

- **Quién:** Juan Sebastián Enríquez Delgado, estudiante de TSU en Entornos Virtuales y Negocios Digitales, en estadía en The Original Lab (Durango, México), trabajando en pareja. Es su proyecto de estadía y a la vez un producto real de la empresa.
- **Idioma:** producto, documentación y commits en español.
- **Estado actual:** diseño terminado (pantallas, modelo de datos, contratos de API). Pasos 1 a 6 del orden de construcción hechos: servidor base del backend, base de datos con Prisma 7 (14 tablas, migraciones), sesión con Original Auth en modo `mock_callback` (`/auth/*` y `/me`), workspaces con equipo e invitaciones (`/workspaces*`), funnels sin IA (tipos, contenido por bloques, `typeConfig` y CTA automáticos) publicación con página pública (`/publish`, `/unpublish`, `/public/pages/:slug`) y captura de leads y eventos (`/public/funnels/:slug/leads` y `/events`), todo con pruebas contra una base real. El prototipo navegable (HTML) y las imágenes de las pantallas viven fuera del repositorio y se incorporan después, poco a poco.
- **Forma de trabajo:** playbook de The Original Lab (`project-playbook`). Piezas chicas y verificables, con pruebas y un commit por pieza (ver `docs/GUIDELINES.md`).

## Alcance del MVP

El MVP es: **generar páginas con IA, poder modificarlas, cobrar dentro de ellas con Original Pay, definir distintos tipos de funnel, iniciar sesión con Original Auth y ver métricas.**

| Entra en el MVP | Queda para después |
| --- | --- |
| Inicio de sesión con Original Auth | Cuentas para quien compra (el visitante no es usuario de la plataforma) |
| Alta del negocio, equipo y roles | Webhooks salientes y automatizaciones |
| Marca: logo propio o generado con IA, paleta con IA | Varias páginas por funnel (`upsell` y `libre`, columna `flow`) |
| Funnels de 6 tipos: leads, venta, citas, magnet, webinar, aplicación | Reembolsos y suscripciones de compradores |
| Generación de la página con IA y edición por bloques | Notificaciones por correo (el Mailing Service no existe) |
| Cobro dentro de la página con Original Pay (funnels de venta) | Varios idiomas por funnel |
| Publicación y versionado (historial) | Planes y límites de uso de la propia plataforma |
| Captura de leads y tablero kanban | |
| Dashboard: resumen, conversión, origen de clics y abandono por sección | |

## Decisiones tomadas

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Repositorio | **Monorepo simple**: `backend/`, `frontend/` y `docs/` en un solo repo | Proyecto chico, dos personas, mismo equipo. El playbook acepta ambas opciones y pide dejarla escrita. A confirmar con la empresa si el despliegue en EasyPanel exige repos separados (`front-original-flow` / `back-original-flow`) |
| Backend | Node.js + TypeScript + Express + Zod | Stack estándar del playbook |
| ORM | **Prisma 7.10.1** (versión fija) con el adaptador `@prisma/adapter-pg` | Muchas columnas JSON y relaciones; tipos y migraciones listos. Prisma 7 define la URL en `prisma.config.ts` y exige un adaptador de PostgreSQL. Alternativa descartada: Drizzle |
| Registros | Tablas propias `OperationLog` y `AuditLog` (14 tablas en total); `AuditLog` es de solo lectura mediante un disparador | El playbook exige un log operativo y uno de auditoría separados desde el día 1 |
| Equipo e invitaciones | Invitar a un correo con cuenta la activa de inmediato; a uno sin cuenta, lo deja invitado y se activa al iniciar sesión (no hay correo de invitación). Se puede invitar a cualquier rol menos `super_admin`; solo super admin y administrador del cliente gestionan el equipo | No existe servicio de correo; mínimo privilegio |
| Contenido de la página | El `content` se valida por tipo de bloque, pero los campos que el esquema no conoce se conservan (no se pierden datos mientras evoluciona el editor). Catálogo de 15 bloques (los 11 documentados más `beneficios`, `calendario`, `agenda` y `requisitos`). Una página nace vacía; los bloques base de cada tipo son una guía para la IA y el editor, no se insertan solos | Los tipos de funnel necesitaban bloques que no estaban en el catálogo |
| Precio de venta | El precio y la divisa viven solo en `Funnel.price` y `Funnel.currency`; `typeConfig.offer` guarda únicamente `compareAtPrice` | Una sola fuente de verdad para el monto que se cobra |
| Publicar | Publicar valida todo el funnel y guarda una versión en el historial, pero no «congela» el contenido: una página publicada se lee del mismo registro que edita el editor, así que los cambios se ven al instante. Solo super admin, administrador y marketing publican; el diseñador no | El modelo tiene una sola fila por funnel; congelar el contenido exigiría otro diseño |
| Página pública | `GET /public/pages/:slug` devuelve contenido, diseño, seo, precio y CTA, pero nunca `typeConfig`, marca ni ids. Las rutas públicas tienen su propia política de CORS (`PUBLIC_CORS_ORIGINS`) y su propio límite de peticiones | Los enlaces de `typeConfig` (reunión, recurso) son solo para quien se registró |
| Captura pública | El visitante solo decide los datos del formulario: el funnel sale del slug, la etapa es siempre la primera del tablero y la fuente es `web_form`. Se exige consentimiento (`consent: true`) y email o teléfono. El navegador solo puede mandar eventos `page_view`, `section_view` y `button_click`; los demás los genera el servidor. Un lead nuevo tiene un límite de 10 por minuto por IP | Evitar que un visitante falsee datos, inunde la analítica o escriba datos arbitrarios |
| Lo que ve el visitante después de registrarse | Se devuelve en la respuesta al enviar el formulario (agradecimiento, calendario, recurso, enlace del webinar), no en la página pública | Esos enlaces son solo para quien se registró |
| Frontend | Un solo proyecto (`frontend/`) con la plataforma y el renderizador de páginas públicas en la ruta `/p/:slug`; en desarrollo, Vite reenvía `/api` al backend. Logo completo en morado siempre y modo oscuro más claro y grisáceo que el diseño original (ver `docs/GUIDELINES.md`) | Decisiones de la persona sobre el diseño |
| Navegar sin backend | **Modo demostración** del front (`VITE_DEMO_MODE=true`, valor por defecto de `.env.example`): la aplicación responde sola, sin servidor ni base de datos, y guarda en el navegador. Solo en desarrollo; la compilación de producción lo excluye (prueba automática). Sin él, un servidor caído se muestra como «No se pudo conectar con el servidor», no como «error inesperado» | La persona no tiene Docker/PostgreSQL en su equipo y necesitaba recorrer las pantallas sin errores |
| Acceso mientras no hay credenciales | Original Auth simulado: el front hace el mismo flujo que el real (crear sesión, aviso de Original Auth al backend, validar, `/me`) con credenciales inventadas, solo en desarrollo. El camino real (redirección a Original Auth, `/auth/return` y `/auth/error`) se agrega cuando lleguen las credenciales y la URL pública del callback | Poder construir el login sin bloquearse |
| Token de sesión en el navegador | `sessionStorage`, aislado en un solo archivo. Falta confirmar con Original Auth si usará una cookie `HttpOnly`; el playbook prohíbe `localStorage` para tokens | Es la opción menos mala disponible con tokens `Bearer` |
| Alta del negocio | Cualquier persona con sesión puede crear su primer negocio; si ya administra un cliente, el nuevo workspace cuelga de él. Etapas por defecto: las 5 del prototipo | Onboarding sin aprobación previa |
| Sesiones | Vigencia de 15 minutos si no se validan y 30 días si se validaron, contada desde la creación; límite de 30 peticiones por minuto por IP en `GET /auth/session` (en memoria) | Equilibrio entre seguridad y comodidad; una sola instancia, sin Redis |
| Callback de Original Auth | Con secretos incorrectos o sesión desconocida responde `200` con `validated: 0` y deja una advertencia en el log | Patrón observado en la integración real; no se sabe cómo reacciona Original Auth ante un 4xx |
| Fallo de la auditoría | Si no se puede escribir en `AuditLog`, se registra el error y la operación (login) continúa | Disponibilidad; para los cobros se decidirá aparte |
| Idempotencia del cobro | Encabezado `Idempotency-Key` obligatorio en el checkout y columna `Order.idempotencyKey` única por funnel | Reintentar nunca cobra dos veces (playbook 03, punto 13) |
| n8n | No se usa en el MVP. Si luego se quieren automatizaciones, se agregan webhooks salientes que n8n pueda consumir | La lógica crítica (pagos, leads, reconciliación) debe estar en código propio con pruebas; además, la licencia de n8n limita ofrecerlo dentro de un SaaS |
| Pagos | Original Pay es el motor de pagos de los funnels que venden un producto; los demás tipos no cobran | Ya existe en la empresa y delega el cumplimiento de PCI-DSS |
| Login | Original Auth, solo para quien usa la plataforma | Ya existe; el comprador no necesita cuenta |
| Dominios | Los resuelve un servicio de la empresa; Original Flow solo guarda el `slug` del funnel, que el servicio usa como variable para armar la URL | No duplicar DNS ni SSL |
| Page, Version, Domain | `Page` se fusionó con `Funnel`; `Version` pasó a `FunnelHistory` (JSON con snapshot y usuario); los campos de dominio salieron | Menos tablas; lo flexible vive como JSON en el funnel |
| Tipos de funnel | Definiciones en código (un registro), no una tabla | Agregar un tipo no exige tocar la base de datos |
| Magnet | El recurso se entrega como descarga en la página de gracias | No existe servicio de correo |
| IA | Se integra después del paso 7 del orden de construcción. Los endpoints solo devuelven propuestas y no guardan nada hasta que la persona elige | El producto debe funcionar de punta a punta sin IA |
| Métricas | Se calculan desde `Event` y `Lead`; no se almacenan por separado | Un solo registro de verdad |

## Stack

| Capa | Elección |
| --- | --- |
| Frontend | TypeScript, React, Tailwind, shadcn/ui, lucide, Vite, PNPM (todavía vacío) |
| Backend | Node.js, TypeScript, Express, Zod, PNPM |
| Acceso a datos | Prisma |
| Base de datos | PostgreSQL |
| Autenticación | Original Auth (sesión + callback + consulta hasta validar; el `Bearer` de la API es el token de esa sesión) |
| Archivos | Media-as-a-Service |
| IA | Original AI Engine (gateway propio), peticiones firmadas con HMAC-SHA256 |
| Pagos | Original Pay |
| Pruebas | Vitest |
| Entorno local | Docker Compose (`compose.yml`) con PostgreSQL |

### Decisiones fuera del estándar

Hasta ahora, ninguna desviación del `01-stack-estandar.md`.

- **Sin Redis.** El playbook indica no instalarlo «por si acaso»: no hay varias instancias ni estado compartido. El límite de peticiones de los endpoints públicos vive en memoria de un solo proceso. Si se despliega en más de una instancia, se agrega Redis.
- **Sin servicio de correo.** El Mailing Service de la empresa no existe; el MVP no envía correos.

## Servicios The Original Lab

| Servicio | Uso en Original Flow | Integrado |
| --- | --- | --- |
| Original Auth | Inicio de sesión de quien usa la plataforma | Diseñado; faltan credenciales |
| Media-as-a-Service | Logo de la marca e imágenes de los bloques | Diseñado; faltan credenciales |
| Original AI Engine | Generar página, bloques, paleta, logo e imagen de marca | Solo diseño en pantallas; faltan credenciales |
| Original Pay | Cobro dentro de los funnels de venta. Dos pasos (`/payment/init` y `/payment/process`) con la cabecera `apikey`; estado con `/payment/data/{order_token}`; estados pendiente, pagado, cancelado y parcialmente pagado; timeout de 15 s; hay sandbox | Diseñado; dudas por confirmar (ver Pendientes) |
| Servicio de dominios | Publica la URL del funnel a partir de su `slug` | Falta definir el contrato |
| Impact-as-a-Service | — | No aplica |
| Mailing Service | Avisos por correo | **No existe todavía**; no se usa en el MVP |

Reglas de integración (playbook `08`): el frontend nunca llama directo a un servicio TOL; cada servicio se consume solo desde `backend/src/integrations/<servicio>/` con su cliente, que traduce errores y respuestas al formato propio; cada llamada saliente se registra en el log operativo con `requestId`, servicio, operación, duración y status.

## Roles

Seis roles en dos ámbitos. El rol vive en `Membership.role`. El super admin opera a nivel plataforma y el resto dentro de un cliente o un workspace. Los permisos se comprueban en `services/`, nunca comparando el rol crudo en rutas o en el frontend.

| Rol | Código | Ámbito | Puede |
| --- | --- | --- | --- |
| Super admin | `super_admin` | Plataforma (The Original Lab) | Ver y administrar todos los clientes y la configuración del SaaS |
| Admin del cliente | `client_admin` | Cliente | Administrar sus workspaces y equipo, conectar Original Pay y todo lo demás |
| Marketing manager | `marketing_manager` | Workspace | Crear, editar y publicar funnels, usar la IA, ver leads, órdenes y dashboard |
| Diseñador | `disenador` | Workspace | Crear y editar funnels, usar la IA; no publica |
| Vendedor | `vendedor` | Workspace | Ver y mover leads, ver órdenes y dashboard; no edita funnels |
| Analista | `analista` | Workspace | Solo lectura: dashboard, órdenes y leads |

Un recurso de otro cliente responde `404`, nunca `403`. La matriz completa por acción está en `docs/API_MVP.md`.

## Jerarquía de entidades

```
Client (el cliente de The Original Lab; tenant)
  ├── Membership (usuarios con rol, del cliente o de un workspace)
  └── Workspace (marca o unidad de negocio; un cliente puede tener varios)
        ├── LeadStage (etapas del tablero de leads)
        └── Funnel (página completa: diseño, contenido y slug)
              ├── CTA (configuración de cada botón o formulario)
              ├── FunnelHistory (versiones guardadas, con el usuario que las hizo)
              ├── Lead (contacto capturado, en una LeadStage)
              │     └── Order (cobro hecho con Original Pay)
              └── Event (visitas, clics, secciones vistas, pagos)
```

Las plantillas (Claridad, Impacto, Minimal, Encuentro, Recurso y Agenda) son un catálogo fijo del producto, no una tabla: un funnel nace a partir de una y después vive independiente.

El detalle del modelo de datos (diagrama, diccionario de las 14 tablas y forma de los campos JSON) está en `docs/ARCHITECTURE.md`.

## Flujos clave

1. **Entrada y alta del negocio.** La persona inicia sesión con Original Auth. Si es nueva, completa el onboarding; se crean el `Client`, el `Workspace`, 5 etapas de lead por defecto y su membresía de administrador.
2. **Configurar la marca.** Sube su logo y la IA propone una paleta editable; si no tiene logo, la IA propone 3 opciones y una imagen de marca. Responde preguntas sobre su marca (`brandBrief`).
3. **Crear un funnel (wizard).** Pasos 1 y 2: nombre, tipo, producto, precio y público. Paso 3: marca. Paso 4: la IA genera `designSpec`, `content`, `seo` y los CTA. Queda en borrador.
4. **Editar.** Editor de bloques con autoguardado; reescribir un bloque con IA (devuelve propuesta sin guardar); cambiar el destino de un CTA; guardar y restaurar versiones.
5. **Publicar.** Modal con lista de verificación (contenido, slug y, si vende, precio y pagos conectados). Pasa a `published`, se guarda una versión y el servicio de dominios expone la URL a partir del `slug`.
6. **Capturar y medir.** La página publicada envía eventos (`page_view`, `section_view`, `button_click`) y, al enviar el formulario, crea un `Lead` en la primera etapa. Los eventos llevan el origen del clic y la sección vista.
7. **Cobrar con Original Pay (funnels de venta).** El servidor busca o crea el lead, toma el monto de `Funnel.price` (nunca del navegador), crea la `Order` en `pending`, llama a `/payment/init` y `/payment/process` con nombre y correo ya capturados, guarda el `order_token` y devuelve la URL de pago. En la página de retorno se consulta el estado; al quedar pagado, la orden pasa a `paid`, el lead pasa a la etapa con `isWon` y se registra `payment_completed`. Una tarea cada 5 minutos revisa las órdenes pendientes, porque Original Pay no documenta un aviso hacia el comercio.
8. **Seguimiento.** El equipo mueve los leads por el tablero kanban y asigna vendedores.
9. **Dashboard.** Visitas, leads, conversión, ingresos y ticket promedio; conversión por etapa; de dónde vienen los clics; en qué sección abandonan.

## Pendientes

Decisiones o datos que faltan y que bloquean partes concretas.

| Tema | Qué falta | Bloquea |
| --- | --- | --- |
| Original Pay: llave por workspace | Confirmar con quien mantiene Original Pay que cada workspace necesita su propia app y llave para que el dinero llegue a la cuenta de cada cliente, y cómo se crea (a mano o por API) | Paso 7 |
| Original Pay: aviso de pago | Confirmar si existe un webhook hacia el comercio; si existe, se agrega `POST /webhooks/original-pay` con verificación de firma y la reconciliación queda de respaldo | Paso 7 |
| Original Pay: pruebas y mínimos | Todo el desarrollo apunta al sandbox; algunas pasarelas tienen monto mínimo (por ejemplo Stripe en MXN) y el servidor lo valida antes de publicar | Paso 7 |
| Servicio de dominios | Contrato de integración: cómo recibe el `slug` de cada funnel publicado y desde qué dominio(s) se leen las páginas (hay que poner esos orígenes en `PUBLIC_CORS_ORIGINS`; vacío = ninguno) | Producción |
| Credenciales | Original Auth, Media-as-a-Service y Original AI Engine | Pasos 2, 9 y 10 |
| Token de sesión en el frontend | Confirmar con Original Auth qué mecanismo usa (cookie `HttpOnly` o token) y dónde se guarda; el playbook prohíbe `localStorage` para tokens | Paso 2 |
| Repositorio y despliegue | Confirmar monorepo con la empresa y la organización de GitHub (`originallab`) | Primer push |
| Cobro de la propia plataforma | Si Original Flow cobra una suscripción con Original Pay desde el día 1 o el v1 es interno o gratuito; si cobra, diseñar planes y límites | Planes |
| Notificaciones por correo | El Mailing Service no existe: dejarlas fuera del v1, usar un proveedor transaccional como excepción documentada, o esperar el servicio interno | Avisos de lead nuevo |
| Automatizaciones y WhatsApp | Se guardarían como configuración dentro de un nodo del `flow`; falta decidir si necesitan tablas propias | Fuera del MVP |
| Pantalla Biblioteca | Definir qué contiene y qué datos necesita | Diseño |
| IP real del visitante | Detrás de EasyPanel hay que configurar `TRUST_PROXY_HOPS` (normalmente 1); sin eso, la IP de auditoría y del límite de peticiones sería la del proxy | Despliegue |
| Subida del logo y paleta con IA | `PATCH /workspaces/:id` ya guarda `logoFileId` y `brandPalette`, pero subir el archivo y proponer la paleta (`/assets/*`, `/brand/*`) es el paso 9 | Paso 9 |
| Ediciones simultáneas | El autoguardado reemplaza todo el contenido: si dos personas editan el mismo funnel a la vez, gana la última en guardar. Falta un control de versiones (por ejemplo, comparar `updatedAt`) | Antes de abrir el editor a varias personas |
| Publicar con IA o con pagos | Un funnel de venta no se puede publicar hasta que el workspace conecte Original Pay (paso 7); hasta entonces solo se publican los demás tipos | Paso 7 |
| Anti-spam del formulario | El límite de 10 leads por minuto por IP no frena a un atacante con muchas IP ni a un robot que comparte la IP de una oficina. Falta decidir una protección adicional (por ejemplo un campo trampa o un captcha) | Antes de producción |
| Descarga del recurso de un magnet | Hoy el servidor devuelve el `resourceFileId`; convertirlo en un enlace de descarga depende de Media-as-a-Service | Paso 9 |
| Acceso real a Original Auth en el front | Falta el camino de redirección (`VITE_TOKEN_APP`, `/auth/return`, `/auth/error`, consulta repetida a `/auth/validate`) y probar con las credenciales reales y una URL pública para el callback | Cuando lleguen las credenciales |
| Editor y generación de la página | El asistente crea el funnel y arma la página **con la plantilla** (sin IA); la siguiente pantalla es el editor para modificarla (bloques, propiedades, vista previa, autoguardado). La IA se enchufa después con un `PageGenerator` (ver `docs/GUIDELINES.md`). Los campos del formulario de instrucciones para la IA son una primera propuesta y todavía no se guardan (el endpoint `PUT /funnels/:id/brand-brief` no existe en el backend). Ya están: ajustes del funnel (datos, ajustes del tipo y CTA), el diálogo de **publicar** con su lista de requisitos y despublicar. **Faltan:** las páginas públicas (`/p/:slug`; el enlace que muestra el diálogo todavía lleva a una pantalla «no existe»), historial de versiones, subir imágenes y logos (Media-as-a-Service), un funnel que cobra no se puede publicar hasta que exista Original Pay (igual que en el backend real) y las seis plantillas afinadas con tus modificaciones | Las siguientes piezas del front |
| Alta del negocio: logo y paleta con IA | El paso de marca ya deja elegir una imagen (solo se muestra en la pantalla: no se guarda) y tiene el botón «Sugerir paleta con IA», pero devuelve una paleta de ejemplo; subir el archivo y generar la paleta de verdad necesitan Media-as-a-Service y el AI Engine. Tampoco hay paso de equipo | Cuando se integren esos servicios |
| Primer `super_admin` | No existe forma de crear el primero (no nace de ningún flujo); hace falta un procedimiento, por ejemplo un script de arranque | Administración de la plataforma |
| Limpieza de sesiones | Las sesiones vencidas se rechazan pero no se borran; falta una tarea programada que las elimine | Antes de producción |
| Escribir en los registros | Falta el servicio que escribe en `OperationLog` y `AuditLog` desde cada integración y acción sensible | Pasos 2 y 3 |
| Eliminar funnels con órdenes | Un funnel con órdenes no se puede borrar (`Order` en `Restrict`): la API responde `409` y ofrece despublicar | Paso 4 |

## Documentos relacionados

- `docs/ARCHITECTURE.md`: arquitectura, modelo de datos y orden de construcción.
- `docs/API_MVP.md`: contratos de la API.
- `docs/STRUCTURE.md`: mapa de carpetas.
- `docs/GUIDELINES.md`: reglas de trabajo.
- Fuera del repositorio (por ahora): prototipo HTML, imágenes de las pantallas en claro y oscuro, Marco teórico y reporte de estadía.
