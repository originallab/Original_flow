/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dirección base de la API. */
  readonly VITE_API_URL?: string;
  /** `true`: modo demostración (la app responde sola, sin backend), SOLO en desarrollo. */
  readonly VITE_DEMO_MODE?: string;
  /** `mock_callback`: Original Auth simulado, SOLO en desarrollo. */
  readonly VITE_AUTH_MODE?: string;
  /** Credenciales inventadas del acceso simulado; deben coincidir con las del backend local. Solo en desarrollo. */
  readonly VITE_MOCK_TOKEN_APP?: string;
  readonly VITE_MOCK_SECRET_KEY?: string;
  /** Acceso REAL a Original Auth: el `token_app` de la aplicación (público; el `secret_key` solo vive en el backend). */
  readonly VITE_TOKEN_APP?: string;
  /** Acceso REAL: el `cliente id` que entrega Original Auth (público); solo si la plantilla de la dirección lleva `{client_id}`. */
  readonly VITE_ORIGINALAUTH_CLIENT_ID?: string;
  /** Acceso REAL: plantilla de la dirección de inicio de sesión de Original Auth, con `{session}` (y `{token_app}` y `{client_id}` si los pide). */
  readonly VITE_ORIGINALAUTH_LOGIN_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
