/** Error de la API con el formato del backend: { success:false, error:{ code, message, details }, requestId }. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = {},
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * Los errores de validación del backend (422) traen `details: [{ path, message }]`. Devuelve el
   * mensaje de cada campo, por ejemplo `{ name: '...', 'brandPalette.primary': '...' }`.
   */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const errors: Record<string, string> = {};
    for (const item of this.details as { path?: unknown; message?: unknown }[]) {
      if (typeof item?.path === 'string' && typeof item.message === 'string' && !(item.path in errors)) errors[item.path] = item.message;
    }
    return errors;
  }
}
