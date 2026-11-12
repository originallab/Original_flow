# Guía de despliegue (EasyPanel)

Para quien despliega. Son tres servicios: base de datos PostgreSQL, backend y frontend. Rama: `feat/despliegue` (hasta que se una a `prod`). Todos los valores marcados como `<…>` los entrega la persona del equipo por un canal privado; **nunca van en Git**.

## 1. Base de datos

- Servicio PostgreSQL **16**.
- Anotar el usuario, la clave, el nombre de la base y el host interno para armar `DATABASE_URL`:
  `postgresql://<usuario>:<clave>@<host-interno>:5432/<base>`

## 2. Backend

- Origen: GitHub, rama `feat/despliegue`, ruta de compilación `backend/` (usa `backend/Dockerfile`), puerto `3000`.
- Al arrancar aplica solas las migraciones pendientes. Si una falla, el contenedor no arranca y el error queda en el registro.
- Variables de entorno (en ejecución):

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La del paso 1 |
| `AUTH_MODE` | `real` |
| `ORIGINALAUTH_TOKEN_APP` | `<token_app real>` |
| `ORIGINALAUTH_SECRET_KEY` | `<secret_key real>` |
| `TRUST_PROXY_HOPS` | `1` (hay un proxy delante) |
| `CORS_ORIGINS` | La dirección **exacta** del frontend, con `https://` y sin `/` al final |
| `PUBLIC_CORS_ORIGINS` | La misma dirección del frontend (páginas públicas `/p/…`) |
| `LOG_LEVEL` | `info` |

- **No** poner `NODE_ENV` (la imagen ya trae `production`; con `development` aceptaría credenciales de desarrollo).
- **Quitar** cualquier credencial de desarrollo (`token-app-de-desarrollo`, `cambia-este-secreto-local`) y `AUTH_MODE=mock_callback`.
- Comprobar: `https://<backend>/health` responde 200 con `{"status":"ok"}`.

## 3. Frontend

- Origen: GitHub, rama `feat/despliegue`, ruta de compilación `frontend/` (usa `frontend/Dockerfile`), puerto `8080`.
- Estas variables se **fijan al compilar** (build args), no en ejecución. Si cambian, hay que reconstruir; si el archivo `index-*.js` no cambia de nombre, reconstruir **sin caché**.

| Build arg | Valor |
| --- | --- |
| `VITE_API_URL` | `https://<backend>/api/v1` (con `/api/v1`) |
| `VITE_TOKEN_APP` | `<token_app real>` (es público; el mismo del backend) |
| `VITE_ORIGINALAUTH_LOGIN_URL` | `https://originalauth.com/login?token_app={token_app}&session={session}` (tal cual, con las llaves) |

- **No** definir `VITE_DEMO_MODE`, `VITE_AUTH_MODE` ni `VITE_MOCK_*`. `VITE_ORIGINALAUTH_CLIENT_ID` no hace falta.
- Comprobar: `https://<frontend>/health` responde 200 y la pantalla de acceso muestra «Continuar con Original Auth».

## 4. Original Auth

Original Auth debe tener registradas estas direcciones (ya solicitadas):

- Callback: `POST https://<backend>/api/v1/auth/callback`
- Retorno correcto: `https://<frontend>/auth/return`
- Retorno con error: `https://<frontend>/auth/error`

## 5. Verificación

Con el backend y el frontend arriba, desde cualquier máquina con `curl` (solo lectura, no escribe datos):

```bash
bash scripts/verificar-despliegue.sh https://<frontend> https://<backend>
```

Revisa salud, CORS (permite al frontend y rechaza a otros orígenes), que el frontend esté compilado contra el backend correcto y que no lleve el modo demostración. Todas las líneas deben salir con `OK`.

## 6. Problemas comunes

| Síntoma | Causa probable |
| --- | --- |
| Backend responde 500 en la sesión o páginas públicas | La base está vacía o sin migraciones: revisar el registro de arranque |
| El navegador bloquea las llamadas (CORS) | `CORS_ORIGINS` no coincide exacto con la dirección del frontend |
| El front no ofrece «Continuar con Original Auth» | Falta `VITE_TOKEN_APP` o `VITE_ORIGINALAUTH_LOGIN_URL` al compilar, o la plantilla no lleva `{session}` |
| El front sigue igual tras reconstruir | Caché de compilación: reconstruir sin caché |
| El backend no arranca en producción | Falta `ORIGINALAUTH_*` o `AUTH_MODE` no es `real` |
