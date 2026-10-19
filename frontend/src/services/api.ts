/**
 * Cliente de la API del backend. Todo `fetch` de la aplicación pasa por aquí (nunca desde un
 * componente): cada entidad tiene su archivo en services/ y lo consumen solo los hooks.
 */
import { ApiError } from './apiError';
import { demoRequest, isDemoMode } from './demo';

const BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';

export { ApiError };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Token de sesión (Authorization: Bearer). */
  token?: string | null;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, { method = 'GET', body, token, signal }: RequestOptions = {}): Promise<T> {
  // Modo demostración (solo en desarrollo): responde la propia aplicación, sin servidor.
  // El `import.meta.env.DEV` explícito permite que Vite elimine todo esto de la compilación de producción.
  if (import.meta.env.DEV && isDemoMode()) return demoRequest<T>(path, { method, body, token });

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }

  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = data as { error?: { code?: string; message?: string; details?: unknown }; requestId?: string } | null;
    // 502/503/504 sin el formato del backend: el servidor no está (por ejemplo, el proxy de desarrollo sin backend detrás).
    if (!envelope?.error && [502, 503, 504].includes(response.status)) {
      throw new ApiError(response.status, 'SERVER_UNAVAILABLE', 'No se pudo conectar con el servidor. Intenta de nuevo en un momento.');
    }
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN_ERROR',
      envelope?.error?.message ?? 'Ocurrió un error inesperado',
      envelope?.error?.details,
      envelope?.requestId,
    );
  }
  return data as T;
}
