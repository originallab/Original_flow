# Original Flow — APIs del MVP

## Convenciones

Contratos de la API del MVP, derivados del modelo de 14 tablas (ver `docs/ARCHITECTURE.md`). Es la referencia para construir las rutas, los esquemas Zod y las pruebas; si un endpoint cambia, se actualiza este archivo en el mismo commit.

- **Base:** `/api/v1`. Los ids son uuid y las fechas van en ISO 8601.
- **Autenticación:** `Authorization: Bearer <session>`, el mismo token del flujo de Original Auth. Los endpoints `/public/*` y `/auth/*` no lo piden.
- **Alcance por cliente:** toda consulta se filtra por el workspace de la persona; un recurso de otro cliente responde `404`, nunca `403`, para no revelar que existe.
- **Validación:** cada entrada se valida con Zod antes de llegar a la lógica de negocio. Los campos JSON (`content`, `designSpec`, `brandBrief`, `seo`) tienen su propio esquema.
- **Listas:** `?page=1&pageSize=25`; responden `{ items, total, page, pageSize }`.
- **Errores:** `{ success: false, error: { code, message, details }, requestId }` con `400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`, `503`.

### Permisos por rol

SA superadministrador · CA administrador del cliente · MM marketing · DI diseñador · VE vendedor · AN analista.

| Acción | SA | CA | MM | DI | VE | AN |
| --- | --- | --- | --- | --- | --- | --- |
| Gestionar workspace y equipo | Sí | Sí | No | No | No | No |
| Conectar Original Pay | Sí | Sí | No | No | No | No |
| Crear y editar funnels | Sí | Sí | Sí | Sí | No | No |
| Publicar y despublicar | Sí | Sí | Sí | No | No | No |
| Usar la IA (generar, logo, paleta) | Sí | Sí | Sí | Sí | No | No |
| Ver y mover leads | Sí | Sí | Sí | No | Sí | Solo ver |
| Ver órdenes y pagos | Sí | Sí | Sí | No | Sí | Sí |
| Ver el dashboard | Sí | Sí | Sí | No | Sí | Sí |

Los permisos se comprueban en la capa de servicios, no en las rutas ni en el frontend.

## Autenticación, cuentas y workspaces

| Método | Ruta | Qué hace | Tablas |
| --- | --- | --- | --- |
| GET | `/auth/session` | Crea una sesión (UUID) antes de ir a Original Auth | Session |
| POST | `/auth/callback` | Original Auth llama aquí: valida `token_app` y `secret_key`, crea el usuario si es nuevo y marca la sesión como validada | Session, User |
| POST | `/auth/validate` | El frontend consulta hasta recibir `validated: 1` | Session |
| DELETE | `/auth/session/:token` | Cierra sesión | Session |
| GET | `/me` | Usuario actual con sus membresías y workspaces | User, Membership |
| POST | `/workspaces` | Alta del negocio (onboarding). Crea el `Client` si no existe, el `Workspace`, las 5 etapas de lead por defecto y la membresía `client_admin` | Client, Workspace, LeadStage, Membership |
| GET | `/workspaces` | Workspaces del usuario | Workspace |
| GET | `/workspaces/:id` | Detalle del workspace y su paleta | Workspace |
| PATCH | `/workspaces/:id` | Edita nombre, país, sitio, rubro, `logoFileId` y `brandPalette` | Workspace |
| GET | `/workspaces/:id/members` | Equipo e invitaciones pendientes | Membership |
| POST | `/workspaces/:id/members` | Invita por correo con un rol | Membership |
| DELETE | `/workspaces/:id/members/:memberId` | Quita el acceso | Membership |

**Cómo funcionan los endpoints de autenticación (paso 2, construidos)**

- `GET /auth/session` responde `{ "session": "<uuid>" }`. Tiene límite de peticiones por IP (30 por minuto por defecto).
- `POST /auth/callback` recibe el cuerpo de Original Auth (`token_app`, `secret_key`, `email`, `session`, `name?`, en snake_case). Responde siempre `200` con `{ "validated": 1 }` o `{ "validated": 0 }` cuando los secretos son incorrectos o la sesión no existe o venció; solo un cuerpo mal formado (por ejemplo sin `email`) responde `422`. Es idempotente y nunca reasigna una sesión ya validada a otro correo.
- `POST /auth/validate` recibe `{ "session": "<uuid>" }` y responde `{ "validated": 0 }` o `{ "validated": 1, "userId", "email", "profileComplete" }`. `profileComplete` es `true` cuando la persona ya tiene al menos una membresía activa (es decir, ya hizo su onboarding).
- `DELETE /auth/session/:token` responde siempre `204`, exista o no la sesión.
- `GET /me` responde `{ "user": { id, email, name }, "memberships": [{ id, role, clientId, workspaceId }], "workspaces": [{ id, name, clientId }] }`. Solo cuentan las membresías activas; un `client_admin` ve todos los workspaces de su cliente.
- **Vigencia de las sesiones:** 15 minutos si no se validan y 30 días si se validaron, contados desde su creación (configurables con `SESSION_PENDING_TTL_MINUTES` y `SESSION_TTL_DAYS`).
- **Auditoría:** se escriben `auth.register`, `auth.login` y `auth.logout` con el id del usuario y la IP, nunca con su correo.

**Cómo funcionan los endpoints de workspaces (paso 3, construidos)**

- **Respuesta de un workspace:** `{ id, clientId, name, country, website, industry, logoFileId, brandPalette, createdAt, role }`, donde `role` es el rol de quien pregunta. **Nunca** incluye `paymentConfig`.
- `GET /workspaces` lista los que la persona puede ver, paginados: todos (super admin), los de su cliente (administrador del cliente) o el suyo (resto de roles).
- `POST /workspaces` responde `201`. Si la persona ya administra un cliente, el workspace nuevo cuelga de él; si no, se crea su cliente (con el nombre del workspace) y ella queda como `client_admin`. Se crean las 5 etapas de lead por defecto (Nuevo, Contactado, Interesado, Oportunidad y Cliente; esta última es la final y la de `isWon`). Todo ocurre en una sola transacción.
- `PATCH /workspaces/:id` acepta `name`, `country`, `website`, `industry`, `logoFileId` y `brandPalette` (con `null` se borra). Debe llevar al menos un campo; cualquier otro (como `clientId`) se ignora. `brandPalette` exige los cinco colores en hexadecimal (`#RRGGBB`).
- `GET /workspaces/:id/members` (paginado) lista las membresías del workspace y los administradores de su cliente; los invitados salen con su correo y `status: "invited"`. Cada una: `{ id, role, status, userId, email, name, clientId, workspaceId, createdAt }` (un administrador es del cliente: lleva `clientId` y no `workspaceId`; los demás roles, al revés). Solo super admin y administrador del cliente pueden listarlas, invitar y quitar.
- `POST /workspaces/:id/members` responde `201`. Si el correo ya tiene cuenta, la membresía queda `active` de inmediato; si no, queda `invited` y se activa sola la primera vez que esa persona inicie sesión. No hay correo de invitación (no existe el servicio). Roles invitables: `client_admin`, `marketing_manager`, `vendedor`, `disenador` y `analista`; `super_admin` nunca se asigna desde la API. Un administrador del cliente tiene acceso a todos los workspaces de su cliente. Responde `409 MEMBER_ALREADY_EXISTS` si ya es parte del equipo o ya fue invitada.
- `DELETE /workspaces/:id/members/:memberId` responde `204`. Responde `409 LAST_CLIENT_ADMIN` si es el único administrador activo del cliente, y `404` si la membresía no pertenece a ese workspace. Quitar a un `client_admin` le quita el acceso a todos los workspaces del cliente.
- **Permisos:** ver el workspace, cualquier rol que acceda a él; editarlo y gestionar el equipo, solo super admin y administrador del cliente. A quien no tiene acceso a un workspace se le responde `404`; a quien lo ve pero no puede hacer la acción, `403`.
- **Auditoría:** `workspace.create`, `workspace.update` (con los nombres de los campos cambiados, no sus valores), `member.invite`, `member.accept` y `member.remove`.

**`POST /workspaces`**

```json
{ "name": "Academia Nimbral", "country": "México", "website": "academianimbral.com", "industry": "educacion" }
```

El logo y la paleta se guardan después con `PATCH /workspaces/:id`, una vez que la persona elige el logo (ver «Archivos y marca con IA»).

## Funnels

El funnel es una sola fila con su contenido en JSON, así que el editor trabaja casi todo con estos endpoints.

| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| POST | `/funnels` | Crea un funnel en borrador con los datos de los pasos 1 y 2 del wizard | SA, CA, MM, DI |
| GET | `/funnels?workspaceId=&status=` | Lista los funnels del workspace | Todos los de lectura |
| GET | `/funnels/:id` | Devuelve el funnel completo, con `content`, `designSpec` y `seo`, para cargar el editor | SA, CA, MM, DI |
| PATCH | `/funnels/:id` | Cambia nombre, producto, precio, público, `slug`, `seo` y `language` | SA, CA, MM, DI |
| PUT | `/funnels/:id/brand-brief` | Guarda las respuestas del paso «Tu marca» | SA, CA, MM, DI |
| POST | `/funnels/:id/generate` | La IA genera `designSpec`, `content`, `seo` y los CTA a partir del `brandBrief` | SA, CA, MM, DI |
| PUT | `/funnels/:id/content` | Reemplaza el contenido del editor (autoguardado con debounce) | SA, CA, MM, DI |
| PATCH | `/funnels/:id/content/blocks/:key` | Edita un solo bloque | SA, CA, MM, DI |
| POST | `/funnels/:id/content/blocks/:key/regenerate` | La IA reescribe un bloque; devuelve la propuesta sin guardarla | SA, CA, MM, DI |
| DELETE | `/funnels/:id` | Elimina el funnel y, en cascada, CTA, historial, leads y eventos; responde 409 si tiene órdenes (se debe despublicar en su lugar) | SA, CA |

**Cómo funcionan los endpoints de funnels (paso 4, construidos)**

- **Crear (`POST /funnels`)** responde `201` con el funnel completo en borrador. El `slug` se genera solo a partir del nombre (sin acentos, con guiones; si ya existe, se le agrega un sufijo corto) y se puede cambiar después. Acepta también `currency` (`MXN`, `USD` o `CLP`; por defecto `MXN`). El contenido nace vacío (`{"blocks":[]}`). Rechaza con `422 FUNNEL_TYPE_UNAVAILABLE` los tipos `upsell` y `libre`.
- **Listar (`GET /funnels?workspaceId=&status=`)**: `workspaceId` es obligatorio, está paginado y no incluye el contenido pesado (`content`, `typeConfig`, `designSpec`...). Lo pueden ver todos los roles con acceso al workspace; abrir el funnel completo (`GET /funnels/:id`) solo super admin, administrador, marketing y diseñador.
- **`PATCH /funnels/:id`** acepta `name`, `productName`, `price`, `currency`, `targetAudience`, `slug`, `seo` y `language` (con `null` se borran los opcionales). El estado no se cambia por aquí (se publica con `/publish`). Un `slug` repetido responde `409 SLUG_TAKEN`; el formato válido es minúsculas, números y guiones, de 3 a 60 caracteres.
- **`DELETE /funnels/:id`** responde `204`, o `409 FUNNEL_HAS_ORDERS` si tiene órdenes. Solo super admin y administrador del cliente.
- **Contenido (`PUT /funnels/:id/content`)** recibe `{ "blocks": [...] }` (máximo 60). Cada bloque lleva `key` (único; minúsculas, números, `-` y `_`), `type`, `order`, `content` y `style`. El `content` se valida según el `type` y los errores indican el bloque y el campo (`blocks.0.content.title`). Los campos que el esquema no conoce se conservan. El autoguardado **no** escribe en el log de auditoría. `PATCH .../content/blocks/:key` cambia `content`, `style` u `order` de un solo bloque (el tipo no se cambia) y vuelve a validarlo.
- **Bloques disponibles:** `encabezado`, `texto`, `imagen` (con `fileId` o `url`), `video`, `formulario`, `boton`, `contador`, `precios`, `testimonios`, `faq`, `logos`, `beneficios`, `calendario`, `agenda` y `requisitos`.
- **CTA automáticos:** al guardar el contenido se crea un CTA por cada `boton` (texto = `label`) y `formulario` (texto = `submitLabel`), se borran los de bloques que ya no existen y se actualiza el texto de los que siguen. Un botón nace con `checkout` si el funnel cobra y con `scroll_to` si no; un formulario, siempre con `form_submit`. El destino y el seguimiento que se hayan editado se conservan; si un bloque cambia de botón a formulario (o al revés), su CTA se reinicia.
- **`PATCH /funnels/:id/ctas/:blockKey`**: un formulario solo puede ser `form_submit` y un botón no (`422 CTA_ACTION_NOT_ALLOWED`); `checkout` solo en funnels que cobran (`422 CTA_CHECKOUT_NOT_ALLOWED`); un destino de tipo `url` debe ser `http` o `https` (`422 CTA_DESTINATION_INVALID`). Si cambia la acción sin mandar destino, el destino anterior se borra.
- **`PUT /funnels/:id/type-config`** valida con el esquema del tipo y responde `{ "typeConfig": ... }`; los campos que el esquema no define se descartan. `GET /funnel-types` devuelve `{ "items": [...] }` con el esquema de cada `typeConfig` en JSON Schema.
- **`PUT /funnels/:id/design-spec`** guarda `{ template, palette?, fonts? }` en `designSpec` y responde `{ "designSpec": ... }`. `template` es una de las 6 plantillas (`claridad`, `impacto`, `minimal`, `encuentro`, `recurso`, `agenda`); `palette` lleva los cinco colores en `#RRGGBB`; `fonts` lleva `heading` y `body`, solo con letras, números y espacios (el front los usa en CSS y para cargar la fuente). La paleta y las tipografías son opcionales: si faltan, la plantilla usa las suyas. Reemplaza el diseño completo, y la IA del paso 10 llenará este mismo objeto. Lo pueden usar quienes editan el funnel (super admin, administrador, marketing y diseñador).
- **Auditoría:** `funnel.create`, `funnel.update` (campos cambiados), `funnel.delete`, `funnel.type_config_update`, `funnel.design_update` y `cta.update`.

**`POST /funnels`**

```json
{ "workspaceId": "...", "name": "Curso de datos", "objective": "leads",
  "productName": "Curso de análisis de datos", "price": 4200, "targetAudience": "Profesionales sin experiencia en programación", "language": "es" }
```

**`PUT /funnels/:id/brand-brief`** guarda un objeto con `personality`, `visualStyle`, `tone`, `typography`, `inspiration` y `avoid`.

**`POST /funnels/:id/generate`** responde con el funnel actualizado. No publica nada: el resultado queda en borrador para que la persona lo revise y lo edite. Si la IA no responde, devuelve `503` y el funnel queda como estaba.

**`PUT /funnels/:id/content`**

```json
{ "blocks": [ { "key": "hero", "type": "encabezado", "order": 1, "content": { "title": "..." }, "style": {} } ] }
```

Al guardar, el servicio valida cada bloque según su `type` y **sincroniza los CTA**: crea uno por cada bloque `boton` o `formulario` nuevo y elimina los de bloques que ya no existen.

## Tipos de funnel

El campo `objective` define el tipo. Cada tipo es una **definición en código** (un registro), no una tabla: dice qué bloques lleva, cuál es su llamado a la acción principal, qué guarda `typeConfig` y qué evento cuenta como conversión. Agregar un tipo nuevo es agregar una entrada, sin tocar la base de datos. La IA lee la definición para generar la estructura y los textos.

| Tipo (`objective`) | Para qué sirve | Bloques base | CTA principal | `typeConfig` | Conversión | ¿Cobra? | MVP |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `leads` | Captar contactos | encabezado, beneficios, testimonios, formulario, FAQ | `form_submit` | `{ thankYou: { message, redirectUrl? } }` | `lead_created` | No | Sí |
| `venta` | Vender un producto | encabezado, beneficios, testimonios, precios, FAQ, botón de pago | `checkout` | `{ offer: { compareAtPrice? }, paymentMethods[], successMessage, successUrl? }` (el precio y la divisa viven en `Funnel.price` y `Funnel.currency`) | `payment_completed` | Sí | Sí |
| `citas` | Agendar una reunión | encabezado, beneficios, formulario, calendario | `form_submit` y luego `url` al calendario | `{ calendarUrl, durationMin, confirmationMessage }` | `lead_created` | No | Sí |
| `magnet` | Entregar un recurso a cambio de datos | encabezado, imagen del recurso, formulario | `form_submit` | `{ resourceFileId, deliveryMessage }` | `lead_created` | No | Sí |
| `webinar` | Registrar a un evento | encabezado, fecha y agenda, formulario | `form_submit` | `{ startsAt, timezone, joinUrl, agenda[] }` | `lead_created` | No | Sí |
| `aplicacion` | Recibir postulaciones | encabezado, requisitos, formulario largo | `form_submit` | `{ questions[], successMessage }` | `lead_created` | No | Sí |
| `upsell` | Oferta después de una compra | oferta, botón de pago, botón de rechazo | `checkout` | requiere varios pasos (`flow`) | `payment_completed` | Sí | Después |
| `libre` | Flujo propio | cualquiera | cualquiera | `flow` | lo define quien lo arma | Opcional | Después |

**Por qué `upsell` y `libre` quedan fuera del MVP:** necesitan encadenar varias páginas y el MVP trabaja con una página por funnel. Cuando se activen, usarán la columna `flow`.

**El recurso del `magnet` se entrega en la página de gracias**, como descarga desde Media-as-a-Service, porque el servicio de correo de la empresa todavía no existe.

| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| GET | `/funnel-types` | Lista las definiciones: nombre, bloques base, esquema de `typeConfig`, si cobra y si está disponible | Cualquier usuario autenticado |
| PUT | `/funnels/:id/type-config` | Guarda y valida `typeConfig` con el esquema Zod de su tipo | SA, CA, MM, DI |

`POST /funnels` rechaza con `422` los tipos que no están disponibles. Un funnel `venta` solo se puede publicar si tiene precio, divisa y un workspace con pagos conectados.

## Publicación, CTAs e historial

| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| POST | `/funnels/:id/publish` | Valida que haya contenido, `slug`; pasa a `published` y guarda una entrada en el historial | SA, CA, MM |
| POST | `/funnels/:id/unpublish` | Vuelve a borrador sin borrar nada | SA, CA, MM |
| GET | `/funnels/:id/ctas` | Lista los CTA del funnel | SA, CA, MM, DI |
| PATCH | `/funnels/:id/ctas/:blockKey` | Cambia destino, tipo de acción o `trackingId` | SA, CA, MM, DI |
| GET | `/funnels/:id/history` | Lista las versiones guardadas, con usuario y fecha | SA, CA, MM, DI |
| POST | `/funnels/:id/history` | Guarda una versión manual con un nombre; el `userId` sale de la sesión | SA, CA, MM, DI |
| POST | `/funnels/:id/history/:historyId/restore` | Copia el `snapshot` a las columnas del funnel y crea una entrada nueva, para poder deshacer | SA, CA, MM |

**Forma de las respuestas del historial** (las definió el frontend en el modo demostración; el backend de este paso todavía no existe y debe seguirlas o cambiarse aquí en el mismo commit):

- `GET /funnels/:id/history` → `{ items, total, page, pageSize }`, de la versión más nueva a la más vieja (con la misma hora, la última que se guardó primero). Cada una: `{ id, funnelId, label, createdAt, user: { id, name, email } }`. **No** trae el `snapshot`: pesa y solo hace falta al restaurar.
- `POST /funnels/:id/history` con `{ label }` (obligatorio, de 1 a 120 caracteres sin contar espacios de los lados; `422` con la ruta `label`) → `201` con la versión guardada, con una copia de `content`, `designSpec`, `brandBrief`, `seo` y `flow` tal como están en ese momento.
- `POST /funnels/:id/history/:historyId/restore` → `200` con el **funnel completo** ya restaurado. Antes de aplicar la versión guarda **cómo estaba la página** como una versión nueva con la etiqueta `Antes de restaurar «<nombre>»` (o `Antes de restaurar una versión sin nombre`, máximo 120 caracteres) para poder deshacer; luego copia el `snapshot` al funnel (solo esos cinco campos: no cambia nombre, precio, `slug`, estado ni `typeConfig`) y ajusta los CTA a los bloques restaurados, como al guardar el contenido. Una versión que no existe o es de otro funnel responde `404 HISTORY_NOT_FOUND`.
- Publicar (`POST /funnels/:id/publish`) ya guarda una versión «Publicado». Un funnel ajeno responde `404`.

**Por qué los CTA no tienen `POST`:** nacen y mueren con los bloques cuando se guarda `content`. Lo único que se edita por separado es su destino y su seguimiento.

**Cómo funciona el historial (paso 11, construido)**

- **Qué guarda una versión:** una copia de `content`, `designSpec`, `brandBrief`, `seo` y `flow` (no el nombre, el precio, la divisa, el `slug` ni `typeConfig`), con quién la guardó, su fecha y un nombre. Publicar guarda una llamada «Publicado»; `POST /funnels/:id/history` guarda una a mano.
- **`GET /funnels/:id/history`** devuelve la lista paginada (`?page=&pageSize=`), de la más nueva a la más vieja, con `{ id, funnelId, label, createdAt, user: { id, name, email } }` por versión. **No incluye la copia**, que pesa mucho y solo hace falta al restaurar.
- **`POST /funnels/:id/history`** recibe `{ label }` (1 a 120 caracteres, sin contar los espacios de los extremos; `422` si no) y responde `201` con la versión.
- **`POST /funnels/:id/history/:historyId/restore`** primero guarda cómo está la página en una versión nueva («Antes de restaurar «nombre»», o «Antes de restaurar una versión sin nombre»), después copia las cinco columnas de la versión al funnel y deja los CTA como piden los bloques restaurados (un CTA que sigue existiendo conserva su destino y su seguimiento), todo en una transacción. Responde el funnel ya restaurado. No cambia el estado: una página publicada muestra la versión restaurada al instante. Una columna que la copia no trae se queda como está (la copia se lee de forma defensiva). `404 HISTORY_NOT_FOUND` si la versión no existe o es de otro funnel.
- **Roles:** ver y guardar, super admin, administrador, marketing manager y diseñador; restaurar, los mismos menos el diseñador (cambia la página publicada). Vendedor y analista no ven el historial (`403`). Un funnel de otro cliente responde `404`.
- Guardar y restaurar quedan en `AuditLog` (`funnel.history_save`, `funnel.history_restore`, con el id de la versión).

**Cómo funcionan publicar y la página pública (paso 5, construidos)**

- **`POST /funnels/:id/publish`** (super admin, administrador del cliente y marketing manager; el diseñador no) valida el funnel y, si todo está bien, lo pasa a `published` y guarda una versión en `FunnelHistory` (etiqueta «Publicado», con el usuario y una copia de `content`, `designSpec`, `brandBrief`, `seo` y `flow`), todo en una transacción. Si algo falta responde `422 FUNNEL_NOT_READY` con `details.missing`, la lista de requisitos pendientes (`{ code, message, field? }`), que es lo que alimenta el checklist del modal de publicar. Si ya estaba publicado no hace nada y no crea otra versión.
- **Requisitos para publicar:** al menos un bloque (`CONTENT_EMPTY`); `typeConfig` completo y válido según el tipo (`TYPE_CONFIG_INCOMPLETE`); un formulario si el tipo capta datos (`FORM_MISSING`) o un botón de pago si cobra (`CHECKOUT_BUTTON_MISSING`); en funnels que cobran, precio mayor a cero (`PRICE_MISSING`) y Original Pay conectado en el workspace (`PAYMENTS_NOT_CONNECTED`); y que ningún botón de tipo enlace se quede sin destino (`CTA_DESTINATION_MISSING`). El `slug` ya no puede estar repetido porque es único en la base de datos.
- **`POST /funnels/:id/unpublish`** vuelve a borrador sin borrar nada y la página deja de verse de inmediato. También es idempotente.
- **Los cambios se ven al instante:** una página publicada se lee del mismo registro que edita el editor, así que cualquier cambio de contenido, CTA o `slug` se refleja de inmediato en la página publicada; publicar guarda una versión pero no «congela» el contenido.
- **`GET /public/pages/:slug`** devuelve `{ slug, name, objective, language, price, currency, content, designSpec, seo, ctas }`, donde `ctas` son `{ blockKey, label, actionType, destination, trackingId }` para conectar cada botón y formulario. **No** devuelve ids, workspace, marca (`brandBrief`) ni `typeConfig` (puede traer el enlace de la reunión de un webinar o el recurso de un magnet, que son para quien ya se registró). Un borrador, un slug inexistente o un slug mal formado responden el mismo `404 PAGE_NOT_FOUND`.

**Dominios.** La empresa ya cuenta con un servicio de dominios, así que Original Flow no configura ni verifica DNS ni SSL. El único dato que guarda es el `slug` del funnel, que el servicio de dominios usa como variable para construir la URL pública. Por eso `Funnel` ya no tiene campos de dominio ni existen endpoints para configurarlo.

## Endpoints públicos

Los usan las páginas publicadas, es decir, el visitante, no el dueño del funnel. No llevan sesión; el funnel se identifica por su `slug`, nunca por un `funnelId` enviado en el cuerpo, para que nadie pueda inyectar datos en otro funnel.

| Método | Ruta | Qué hace | Tablas |
| --- | --- | --- | --- |
| GET | `/public/pages/:slug` | Devuelve la página de un funnel **publicado** (contenido, diseño, seo y CTA); si está en borrador responde `404` | Funnel, CTA |
| POST | `/public/funnels/:slug/leads` | Guarda el lead del formulario en la primera etapa del workspace y registra el evento `lead_created` | Lead, LeadStage, Event |
| POST | `/public/funnels/:slug/events` | Registra eventos en lote: visitas, clics y secciones vistas | Event |

**`POST /public/funnels/:slug/leads`**

```json
{ "name": "María", "email": "maria@correo.com", "phone": "+52...", "consent": true,
  "utm": { "utm_source": "instagram", "utm_campaign": "octubre" }, "customFields": {} }
```

Se exige `consent: true` (exactamente el booleano `true`). El servicio guarda los datos del visitante pero no los escribe en los registros técnicos.

**Cómo funcionan la captura de leads y los eventos (paso 6, construidos)**

- **`POST /public/funnels/:slug/leads`** responde `201` con `{ "ok": true, "next": ... }`. El lead se guarda en la **primera etapa** del workspace (la de menor orden), con `source: web_form`, y en la misma transacción se registra el evento `lead_created` (con `properties.source` si venía `utm_source`). El correo se normaliza a minúsculas y se exige **email o teléfono**. Lo que no está en el contrato (`funnelId`, etapa, fuente, vendedor...) se ignora: el visitante nunca decide a dónde va el lead.
- **`utm`** acepta solo `utm_source`, `utm_medium`, `utm_campaign` y `referrer`; el resto se descarta. **`customFields`** admite hasta 30 campos con nombre que empiece con letra (sin guion bajo inicial) y valores de texto (máx. 1000 caracteres), número, booleano o `null`. El servidor agrega `_consentAt` (fecha y hora del consentimiento) como constancia, y el visitante no puede falsificarlo.
- **`next`** es lo que la página muestra o hace después de registrarse, y por eso **no** viaja antes en la página pública: `leads` → `{ message, redirectUrl? }`; `citas` → `{ message, redirectUrl }` con el calendario; `magnet` → `{ message, resourceFileId }`; `webinar` → `{ joinUrl, startsAt, timezone }`; `aplicacion` → `{ message }`. Si el tipo no tiene pantalla posterior, es `null`.
- **`POST /public/funnels/:slug/events`** responde `202` con `{ "accepted": n }`. Acepta de 1 a 20 eventos por petición y solo los tipos `page_view`, `section_view` y `button_click`; los demás (`lead_created`, `checkout_started`, `payment_completed`, `conversion`) los genera solo el servidor. `properties` solo conserva `source`, `section` y `blockKey` (texto); lo demás se descarta. Si un evento del lote no es válido, no se guarda ninguno. Los eventos de la página no llevan lead asociado.
- Ambos responden el mismo `404` para un funnel en borrador, inexistente o con slug mal formado, y comparten el límite de 100 kb de cuerpo. **Crear un lead tiene un límite propio, más estricto:** 10 por minuto por IP (`RATE_LIMIT_LEADS_PER_MINUTE`), además del límite general de las rutas públicas.
- **Privacidad:** el nombre, el correo y el teléfono se guardan solo en la tabla `Lead`; no aparecen en los logs (que registran el patrón de la ruta, no la URL ni el cuerpo) ni en `AuditLog`.

**`POST /public/funnels/:slug/events`** — esto alimenta los dos paneles nuevos del dashboard.

```json
{ "events": [
  { "type": "page_view", "properties": { "source": "instagram" } },
  { "type": "section_view", "properties": { "section": "beneficios" } },
  { "type": "button_click", "properties": { "blockKey": "cta-1" } }
] }
```

- **Origen de los clics:** el frontend de la página lee `utm_source` o el referente y lo manda en `properties.source`.
- **Abandono por sección:** cada sección que entra en pantalla manda un `section_view`; el dashboard compara cuántas visitas llegan a cada una.

**Protecciones:** los endpoints públicos tienen su **propia política de CORS**, separada de la de la plataforma: solo los orígenes de `PUBLIC_CORS_ORIGINS` (el servicio de dominios de la empresa) pueden leerlos desde un navegador, y vacío significa ninguno. También tienen su propio límite de peticiones por IP (`RATE_LIMIT_PUBLIC_PER_MINUTE`, 120 por minuto por defecto, `429` al excederse) y un límite de 100 kb en el cuerpo.

## Pagos con Original Pay

Los funnels de tipo `venta` cobran dentro de la misma página. Original Flow es **una sola app de Original Pay** («Original Flow»): sus credenciales (`ORIGINALPAY_TOKEN_APP` y `ORIGINALPAY_SECRET_KEY`) son del servidor, no de cada negocio. El servidor crea la orden con `POST /payment/init` (el `token_app` va en el cuerpo) y Original Pay devuelve la dirección de pago; el pago se confirma con el **aviso (webhook)** que Original Pay envía. El sistema nunca toca datos de tarjeta. Contrato: guía de integración técnica de OrigPay (docs.theoriginallab.com).

### Flujo de una compra

1. **Configuración.** El administrador habilita Original Pay en su workspace (divisa y métodos). No hay llave por negocio: si el cliente todavía manda `apiKey`, se acepta y se descarta.
2. **Compra.** El visitante pulsa el botón de pago y la página llama a `POST /public/funnels/:slug/checkout`. El servidor busca o crea el lead, toma el monto de `Funnel.price` (nunca del navegador), reutiliza la orden pendiente de ese lead o crea una nueva (`order_number` único generado aquí) y llama a `POST /payment/init` de Original Pay con `token_app`, monto, divisa, `order_number`, `product_code` (el `slug`), descripción y correo. Original Pay responde con `payment_url`; el servidor la guarda, registra `checkout_started` y la devuelve. El comprador elige el método de pago en la pantalla de Original Pay.
3. **Datos ya capturados.** Nombre y correo viajan en esa misma petición, así que el comprador no los vuelve a escribir en el pago.
4. **Aviso de pago.** Original Pay envía `POST /webhooks/original-pay` con `token_app`, `secret_key`, `order_number`, `payment_status` (`approved`, `pending`, `rejected` o `cancelled`), `payment_method`, `amount` y `currency`. El servidor autentica con `token_app` y `secret_key` (comparación sin filtrar tiempos; `401` si no coinciden), busca la orden por `order_number` (`404` si no existe) y: con `approved` (y el mismo monto y divisa, si no `409`) marca la orden `paid`, mueve el lead a la etapa con `isWon`, le pone el valor y registra `payment_completed` **una sola vez**, aunque el aviso llegue repetido; con `rejected` o `cancelled` la orden **sigue pendiente** (se puede reintentar) y se registra `payment_failed`; con `pending` no hace nada.
5. **Retorno.** Original Pay devuelve a la persona a direcciones **fijas** de la página: `/pago/retorno`, `/pago/exito` o `/pago/error`. Las tres hacen lo mismo: buscan el token de la orden (en la dirección o el que se recordó al salir a pagar) y llevan a `/p/:slug/orden/:publicToken`, que pregunta sola a `GET /public/orders/:publicToken` hasta que el aviso confirme el pago.
6. **Sin consulta de estado.** La guía de Original Pay no documenta una consulta del estado de una orden, así que el aviso es la única forma de confirmar un pago y no hay tarea de reconciliación. `init` no se reintenta solo (`order_number` es único); el timeout es de 15 segundos y, si falla, la orden queda pendiente y al volver a pulsar pagar se reutiliza.

| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| PUT | `/workspaces/:id/payments` | Habilita Original Pay: divisa y métodos de pago (`apiKey` opcional y descartada) | SA, CA |
| GET | `/workspaces/:id/payments` | Estado de la conexión (`connected`, métodos) | SA, CA |
| POST | `/public/funnels/:slug/checkout` | Crea la orden y devuelve cómo pagar | Público |
| GET | `/public/orders/:publicToken` | Estado de la orden para la página de retorno (incluye el `slug` de la página) | Público |
| POST | `/webhooks/original-pay` | Aviso de pago de Original Pay (se autentica con `token_app` y `secret_key`, sin sesión ni CORS) | Original Pay |
| GET | `/orders?workspaceId=&funnelId=&status=` | Lista de órdenes | SA, CA, MM, VE, AN |
| GET | `/orders/:id` | Detalle de una orden | SA, CA, MM, VE, AN |

**`POST /public/funnels/:slug/checkout`**

Acepta el encabezado **`Idempotency-Key`** (opcional; texto de hasta 100 caracteres; la página genera uno nuevo por intento de compra, por ejemplo un UUID). Se guarda en `Order.idempotencyKey`, único por funnel. Si llega una petición con una clave que ya existe en ese funnel, el servidor **no crea otra orden ni vuelve a llamar a Original Pay**: devuelve la respuesta de la orden original. Así un doble clic, un timeout o un reintento nunca cobran dos veces. Sin el encabezado responde `422` (`IDEMPOTENCY_KEY_REQUIRED`); con la misma clave pero otro correo o método de pago responde `409` (`IDEMPOTENCY_KEY_REUSED`).

```json
{ "name": "María", "email": "maria@correo.com", "phone": "+52...", "paymentMethod": "mercadopago", "consent": true,
  "utm": { "utm_source": "instagram" } }
```

```json
{ "publicToken": "...", "status": "pending", "paymentUrl": "https://..." }
```

**Lo que el frontend ya usa del cobro** (se definió en el modo demostración; el backend de este paso todavía no existe y debe seguirlo o cambiarse aquí en el mismo commit):

- `POST /public/funnels/:slug/checkout`: `name` y `email` obligatorios, `phone` opcional, `paymentMethod` opcional (uno de `stripe`, `paypal`, `mercadopago`, `spei_direct`, `webpay`; si falta se usa el primero de la conexión; si no lo acepta el negocio, `422` con la ruta `paymentMethod`), `consent` exactamente `true` y `utm`. El monto nunca viaja. Responde `{ publicToken, status, paymentUrl? }`; `paymentUrl` solo cuando la orden está pendiente. Una persona con una orden pendiente en ese funnel recibe esa misma orden; con una orden pagada, `409 ORDER_ALREADY_PAID`. Antes de crear la orden se busca o crea el lead en la primera etapa y se registra `lead_created` si es nuevo; al crearla, `checkout_started`.
- **`GET /public/pages/:slug` agrega `paymentMethods`** (las formas de pago de la conexión del negocio) **solo** si el funnel cobra y el negocio tiene Original Pay conectado, para que la página sepa qué ofrecer.
- `GET /public/orders/:publicToken` → `{ publicToken, slug, status: 'pending' | 'paid' | 'cancelled' | 'failed', message?, redirectUrl? }`; `message` y `redirectUrl` (el `successMessage` y el `successUrl` del `typeConfig`) solo cuando está pagada. La página de retorno es `/p/:slug/orden/:publicToken` y pregunta sola mientras siga pendiente. `404 ORDER_NOT_FOUND` si no existe.
- Al pagar: la orden pasa a `paid` con `paidAt`, el lead a la etapa con `isWon` y se registra `payment_completed`.
- `PUT /workspaces/:id/payments` → `{ currency, methods (de 1 a 5, sin repetir), apiKey? (se descarta) }` y `GET` → `{ connected, provider?, currency?, methods? }`, solo super admin y administrador.
- Los ingresos del dashboard (`/analytics/summary` y `/analytics/funnels`) salen de las órdenes `paid` por `paidAt`, por divisa.

**Errores propios del cobro:** `422` si el funnel no cobra, falta el precio o la conexión, o falta `Idempotency-Key`; `409` si la orden ya está pagada o la clave se reutilizó con otros datos; `503` si Original Pay no responde, en cuyo caso la orden queda `pending` y se puede reintentar. Los reembolsos no entran en el MVP.

### Decisiones y pendientes con Original Pay

- **Una sola app (decidido).** Original Flow usa una única app de Original Pay; el dinero de todos los negocios llega a la cuenta de esa app. Cobrar a cada cliente en su propia cuenta requeriría una app por negocio y queda fuera del MVP.
- **Credenciales y ambiente.** Las credenciales recibidas no fueron aceptadas por `api-test.origpay.com` ni por `api.origpay.com` (`Invalid token_app`); falta confirmar con Original Pay si la app está activada y en qué servidor es válida. La respuesta exitosa de `init` (`payment_url`) todavía no se ha visto de verdad.
- **Métodos de pago.** El comprador elige el método en la pantalla de Original Pay; `init` no recibe método. De momento solo Stripe está habilitado en la app.
- **Montos mínimos.** Algunas pasarelas tienen mínimo (por ejemplo Stripe en MXN); Original Pay responde con un error que el servidor devuelve como `422 PAYMENT_REQUEST_INVALID`.

**Original Auth y los compradores.** En el MVP Original Auth sirve para iniciar sesión en la plataforma. Crear una cuenta para quien compra queda fuera, porque el visitante no es usuario de Original Flow.

## Leads, etapas y analítica

### Leads y etapas

**Construidos (paso 8, parte de leads).**

| Método | Ruta | Qué hace | Roles |
| --- | --- | --- | --- |
| GET | `/leads?workspaceId=&stageId=&funnelId=&source=&q=` | Lista de leads con filtros (tablero) | SA, CA, MM, VE, AN |
| GET | `/leads/:id` | Detalle del lead | SA, CA, MM, VE, AN |
| POST | `/leads` | Alta manual de un lead | SA, CA, MM, VE |
| PATCH | `/leads/:id` | Cambia de etapa, asigna vendedor, corrige datos o valor | SA, CA, MM, VE |
| GET | `/workspaces/:id/lead-stages` | Etapas del tablero, en orden | SA, CA, MM, VE, AN |
| POST | `/workspaces/:id/lead-stages` | Agrega una etapa propia | SA, CA |
| PATCH | `/lead-stages/:id` | Renombra o reordena una etapa | SA, CA |
| DELETE | `/lead-stages/:id` | Elimina una etapa; `409` si todavía tiene leads | SA, CA |

- **`GET /leads`** exige `workspaceId` y devuelve la lista paginada (`page`, `pageSize` hasta 100), del más nuevo al más viejo, con `{ id, funnelId, funnelName, leadStageId, name, email, phone, source, utm, assignedTo, value, customFields, createdAt }` (`value` como número; `utm` y `customFields` como objeto o `null`). `q` busca (sin distinguir mayúsculas y tomando `%` y `_` literales) en nombre, correo y teléfono, hasta 100 caracteres; uno vacío no filtra. Un `funnelId` de otro negocio devuelve una lista vacía. Los leads que llegan por la página pública entran a la primera etapa.
- **`POST /leads`** recibe `{ funnelId, name?, email?, phone?, value?, leadStageId?, source?, customFields? }`: al menos un correo o un teléfono; sin etapa entra a la primera del tablero; `source` es `web_form` (por defecto) o `whatsapp`; sin UTM (no vino de una página). `404` si el funnel no es de la persona; `422` si la etapa no es de ese negocio. No guarda el consentimiento (`_consentAt`): eso solo lo pone el formulario público.
- **`PATCH /leads/:id`** acepta `leadStageId` (de ese mismo negocio), `assignedTo` (el id de alguien con acceso al negocio, o `null` para quitarlo), `name`, `email`, `phone` y `value` (0 a 9 999 999 999.99, con dos decimales; `null` lo borra), al menos uno. El lead siempre conserva un correo o un teléfono (`422` si se quedaría sin ninguno). Lo demás (funnel, fecha, UTM) no se cambia desde aquí.
- **Quién:** el analista solo mira (`403` al crear y cambiar); el diseñador no ve leads. Un lead o un negocio de otro cliente responde `404`. En `AuditLog` queda `lead.create` y `lead.update` con ids y nombres de campo (y la etapa de origen y de destino), nunca nombres, correos ni teléfonos.
- **Etapas:** todos los que ven los leads ven las etapas; las cambia solo el administrador (super admin y administrador del cliente). Cada etapa es `{ id, workspaceId, name, order, isFinal, isWon }` y la respuesta es `{ items, total, page: 1, pageSize }`. Los órdenes siempre quedan seguidos (1, 2, 3…): al agregar, mover o quitar se renumera todo en una transacción. **La etapa final (la que pasa a «cliente» al pagar) siempre queda al final del tablero:** una etapa nueva sin `order` entra justo antes de ella; con `order` (1 es la primera) entra ahí pero nunca después de la final; la final no se mueve (`409 STAGE_PROTECTED`) aunque sí se renombra. No se quita la final ni la ganada (`409 STAGE_PROTECTED`) ni una con leads (`409 STAGE_NOT_EMPTY` con `details.leads`). El nombre va de 1 a 60 caracteres.

### Analítica del dashboard

Todas aceptan `workspaceId`, `funnelId` (opcional) y un rango (`range=7d|30d|90d` o `from` y `to`). Se calculan en el servidor sobre `Lead`, `Event` y `Order`; el dashboard solo dibuja la respuesta. **Construidas (paso 8, parte de analítica).**

- **Periodo.** `range` mide los últimos 7, 30 o 90 días hasta ahora (sin `range` ni fechas, 30). Con `from` y `to` (fecha como `2026-10-01` = medianoche UTC, o con hora) se mide ese rango exacto: `from` incluido y `to` sin incluir, hasta 366 días. No se mezclan, `from` y `to` van juntos y `from` es anterior a `to` (`422` si no). **El periodo anterior** es del mismo tamaño y queda pegado al actual.
- **Quién la ve:** super admin, administrador, marketing manager, vendedor y analista; el diseñador no (`403`). Un negocio o un funnel que no son de la persona responden `404`.
- **Ingresos:** salen de las órdenes `paid` y cuentan por su fecha de pago (`paidAt`), **por divisa, sin sumar divisas distintas**; sin ventas, `revenue` y `averageTicket` son listas vacías. (Las órdenes las crea el paso 7: hasta entonces esto responde vacío.)
- **Etapas del embudo:** `checkout` y `payments` solo aparecen si algún funnel medido cobra. «Oportunidades» es la penúltima etapa del tablero y las que siguen; «Clientes», la etapa ganada (`isWon`). Cada lead cuenta en la etapa donde está hoy, si llegó en el periodo. `percentOfVisits` es `null` sin visitas y `percentOfPrevious` es `null` en la primera etapa o si la anterior está en cero.
- **Orígenes:** los 10 con más visitas (empate por nombre); `total` y `percent` cuentan todas las visitas. Una visita sin `source` es «Directo».
- **Rendimiento por funnel:** del que más leads trae al que menos (empate por nombre).

| Método | Ruta | Qué devuelve |
| --- | --- | --- |
| GET | `/analytics/summary` | Visitas, leads, conversión, ingresos y ticket promedio, con la variación frente al periodo anterior |
| GET | `/analytics/funnel-conversion` | Volumen y porcentaje por etapa: visitas, leads, oportunidades, checkout, pagos y clientes |
| GET | `/analytics/sources` | **De dónde vienen los clics:** por red o canal, con clics, porcentaje y conversión |
| GET | `/analytics/drop-off` | **Dónde abandonan:** por sección de la página, con el porcentaje que llega y los puntos que se pierden |
| GET | `/analytics/funnels` | Rendimiento de cada funnel |

**`GET /analytics/sources`**

```json
{ "total": 24318, "items": [ { "source": "instagram", "clicks": 7780, "percent": 32.0, "conversion": 4.2 } ] }
```

**`GET /analytics/drop-off?funnelId=...`**

```json
{ "items": [ { "section": "beneficios", "reachedPercent": 78, "dropPoints": 22 } ] }
```

La conversión por origen sale de cruzar los eventos `page_view` de cada `properties.source` con los leads que venían de ese origen en su `utm` (`utm_source`, o el sitio del `referrer`, o «Directo»).

**`GET /analytics/drop-off`** exige `funnelId` (`422` si falta). Las secciones salen de los bloques de la página, en su orden: `reachedPercent` es el porcentaje de las visitas con un `section_view` de esa sección (entero, hasta 100) y `dropPoints` lo que se pierde respecto a la anterior (nunca negativo; la primera parte de 100).

**Forma y definiciones** (las definió el frontend en el modo demostración; el backend de este paso todavía no existe y debe seguirlas o cambiarse aquí en el mismo commit). Todas piden `workspaceId` (`422` si falta, `404` si es de otro cliente), `range` (`7d`, `30d` o `90d`; por defecto `30d`; otro valor, `422`) y, opcionalmente, `funnelId` (`404` si no es del negocio). El periodo son los últimos N días y el «periodo anterior», los N días previos.

- `GET /analytics/summary` → `{ visits, leads, conversion, revenue, averageTicket }`. Los tres primeros son `{ value, previous }`: visitas = eventos `page_view`, leads = leads creados en el periodo y conversión = leads ÷ visitas en porcentaje con un decimal (0 si no hay visitas). `revenue` y `averageTicket` son listas **por divisa** (`[{ currency, value, previous }]`), vacías mientras no haya órdenes pagadas: cada funnel cobra en su divisa y nunca se suman monedas distintas.
- `GET /analytics/funnel-conversion` → `{ items: [{ key, label, count, percentOfVisits, percentOfPrevious }] }` con las etapas `visits`, `leads`, `opportunities`, `checkout`, `payments` y `customers` en ese orden. Oportunidades = leads en la penúltima etapa del tablero o en las siguientes; clientes = leads en una etapa `isWon`; `checkout` y `payments` (eventos `checkout_started` y `payment_completed`) solo aparecen si algún funnel del alcance cobra. Los porcentajes llevan un decimal y son `null` cuando no hay con qué dividir.
- `GET /analytics/sources` → `{ total, items }`: `total` son las visitas y `items`, hasta 10 orígenes del que más trae al que menos (con empate, por nombre) con `{ source, clicks, percent, conversion }`. El origen es `properties.source` (o «Directo» si no viene); un lead cuenta para su `utm_source` o, si no tiene, el sitio de su `referrer`, o «Directo».
- `GET /analytics/drop-off` → `{ items }`, **`funnelId` obligatorio** (`422` si falta). Una fila por bloque de la página, en su orden, con `{ section, reachedPercent, dropPoints }`: lo que llega es el porcentaje de visitas con un `section_view` de esa sección (entero, tope 100) y `dropPoints` lo que se pierde respecto a la sección anterior (la primera, respecto a 100; nunca negativo).
- `GET /analytics/funnels` → `{ items: [{ funnelId, name, objective, status, visits, leads, conversion, revenue }] }`, del que más leads trae al que menos (con empate, por nombre); incluye borradores.

## Archivos y marca con IA

Todos pasan por el backend: el frontend nunca habla directo con Media-as-a-Service ni con Original AI Engine, y las claves de ambos se quedan en el servidor. Los endpoints de IA solo **devuelven propuestas**; no guardan nada hasta que la persona elige.

| Método | Ruta | Qué hace | Servicio |
| --- | --- | --- | --- |
| POST | `/assets/upload` | Sube el logo o una imagen (multipart) y devuelve `{ fileId, url }` | Media-as-a-Service |
| DELETE | `/assets/:fileId` | Elimina un archivo | Media-as-a-Service |
| POST | `/brand/palette` | Analiza un logo ya subido y propone la paleta `{ primary, secondary, accent, background, text }` | Original AI Engine |
| POST | `/brand/logo/generate` | Para quien no tiene logo: propone 3 opciones a partir del nombre, el rubro y el estilo | Original AI Engine |
| POST | `/brand/image/generate` | Propone una imagen de marca para el encabezado | Original AI Engine |

**Flujo del onboarding con logo propio**

1. `POST /assets/upload` → `fileId`.
2. `POST /brand/palette` con ese `fileId` → paleta propuesta.
3. La persona ajusta los colores y se guarda con `PATCH /workspaces/:id` (`logoFileId` y `brandPalette`).

**Flujo sin logo**

1. `POST /brand/logo/generate` → 3 opciones.
2. La persona elige una; el cliente la sube con `POST /assets/upload` y sigue como arriba.

Cada llamada a la IA lleva `metadata` con la acción y el workspace, para poder desglosar el costo por cliente, y los endpoints comparten un límite de peticiones por workspace para no agotar la cuota.

## Orden de construcción

El orden va de lo que no depende de nada a lo que depende de todo. Cada paso termina con pruebas y un commit antes de pasar al siguiente.

| Paso | Qué se construye | Endpoints | Depende de |
| --- | --- | --- | --- |
| 1 | Base del proyecto: configuración, formato de errores, logs y migraciones con `schema.sql` | — | — |
| 2 | Sesión con Original Auth | `/auth/*`, `/me` | Paso 1 |
| 3 | Cuentas y marca | `/workspaces*` | Paso 2 |
| 4 | Funnels sin IA: registro de tipos, crear, editar `content` y `typeConfig`, CTA automáticos | `/funnel-types`, `/funnels*`, `/funnels/:id/content`, `/funnels/:id/type-config`, `/funnels/:id/ctas*` | Paso 3 |
| 5 | Publicar y ver la página | `/funnels/:id/publish`, `/public/pages/:slug` | Paso 4 |
| 6 | Captura y medición | `/public/funnels/:slug/leads`, `/public/funnels/:slug/events` | Paso 5 |
| 7 | Pagos con Original Pay (funnels de venta) | `/workspaces/:id/payments`, `/public/funnels/:slug/checkout`, `/public/orders/:publicToken`, `/orders*`, `/webhooks/original-pay` | Pasos 5 y 6, y las credenciales de la app de Original Pay |
| 8 | Dashboard y leads, ya con ingresos | `/analytics/*`, `/leads*`, `/lead-stages*` | Pasos 6 y 7 |
| 9 | Archivos y marca con IA | `/assets/*`, `/brand/*` | Paso 3 y acceso a los servicios |
| 10 | Generación del funnel con IA, usando la definición de cada tipo | `/funnels/:id/generate`, `/brand-brief`, regenerar bloque | Pasos 4 y 9 |
| 11 | Historial | `/funnels/:id/history*` | Paso 4 |

**Por qué la IA va después del paso 7.** Con los pasos 1 a 7 ya hay un producto que funciona de punta a punta, con un funnel creado a mano. La IA se conecta encima sin cambiar nada de lo anterior, y si la integración con Original AI Engine se retrasa, no bloquea el resto.

**Qué hacer en cada paso**

1. Escribir primero el esquema Zod de la entrada y de la respuesta.
2. Crear la ruta, que solo valida y delega, y el servicio, que contiene la regla y comprueba el rol.
3. Escribir las pruebas (Vitest): caso feliz, rol sin permiso, recurso de otro cliente y dato inválido.
4. Documentar el endpoint en OpenAPI, actualizar este archivo y hacer commit.

**Pendientes que bloquean pasos concretos:** las credenciales de Original Auth (paso 2), las de Media-as-a-Service y Original AI Engine (pasos 9 y 10), y el contrato con el servicio de dominios de la empresa: cómo recibe el slug de cada funnel publicado (paso 5).

## Seguridad: puntos del playbook

Estos puntos salen de revisar el diseño contra `03-seguridad.md` y `02-arquitectura-base.md` del playbook. La última columna dice cómo está cada uno; los pendientes también están en `docs/PROJECT_CONTEXT.md`, sección «Pendientes».

| Tema | Qué exige el playbook | Estado en este diseño |
| --- | --- | --- |
| Idempotencia en cobros | Toda operación de cobro acepta una clave de idempotencia: reintentar (timeout, doble clic) nunca cobra dos veces | **Resuelto en el diseño:** encabezado `Idempotency-Key` obligatorio y `Order.idempotencyKey` único por funnel (ver «Pagos con Original Pay»). Se implementa en el paso 7 |
| Dónde vive el token de sesión | Un token de sesión no debe guardarse en `localStorage`; en navegador va en cookie `HttpOnly` + `Secure` + `SameSite`, con protección CSRF en las mutaciones. Hay que confirmar con Original Auth qué mecanismo usa | Este documento dice `Authorization: Bearer <session>`; falta confirmar dónde lo guarda el frontend |
| Log operativo y log de auditoría | Dos registros separados, con tablas propias en la base de datos desde el día 1. La auditoría es de solo lectura y cubre login, cambios de configuración, creación y eliminación de recursos y toda transacción de pago | **Resuelto en el modelo:** tablas `OperationLog` y `AuditLog` (sin claves foráneas, para que sobrevivan al borrado de usuarios o funnels). `AuditLog` es de solo lectura también a nivel de base de datos (disparador). Falta escribir en ellas desde los servicios (pasos 2 y 3 en adelante) |
| Límite de peticiones | Los endpoints públicos o costosos (checkout, IA) necesitan límite, y se decide a propósito si falla abierto o cerrado | Sin Redis, el límite vive en memoria de un solo proceso: sirve con una instancia. Para checkout y los endpoints de IA conviene que falle cerrado (protegen costo real) |
| Encabezados y CORS | Lista explícita de orígenes (nunca `*` con credenciales) y encabezados de seguridad con `helmet` | **Hecho** en el servidor base (`helmet`, CORS con lista explícita validada al arrancar) |
| Secretos que se vuelven a leer | Original Flow es una sola app de Original Pay: `token_app` y `secret_key` son variables de entorno del servidor (`ORIGINALPAY_TOKEN_APP` y `ORIGINALPAY_SECRET_KEY`), nunca se guardan por negocio | **Resuelto:** ya no hay llaves de pago en la base de datos |
