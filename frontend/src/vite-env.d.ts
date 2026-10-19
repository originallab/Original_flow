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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
