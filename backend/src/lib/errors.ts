/**
 * Error de la aplicación. Los servicios lo lanzan con un código estable; el
 * manejador de errores lo convierte en la respuesta HTTP. Así los servicios
 * nunca conocen HTTP: solo dicen qué pasó.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = {},
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(code = 'BAD_REQUEST', message = 'La petición no es válida', details?: unknown) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(code = 'UNAUTHORIZED', message = 'Autenticación requerida o inválida') {
    return new AppError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message = 'No tienes permiso para realizar esta acción') {
    return new AppError(403, code, message);
  }

  /** También se usa cuando el recurso existe pero es de otro cliente (playbook 03, IDOR). */
  static notFound(code = 'NOT_FOUND', message = 'Recurso no encontrado') {
    return new AppError(404, code, message);
  }

  static conflict(code = 'CONFLICT', message = 'La operación entra en conflicto con el estado actual', details?: unknown) {
    return new AppError(409, code, message, details);
  }

  static unprocessable(code = 'VALIDATION_ERROR', message = 'Los datos enviados no son válidos', details?: unknown) {
    return new AppError(422, code, message, details);
  }

  static tooManyRequests(code = 'RATE_LIMITED', message = 'Demasiadas peticiones; intenta más tarde') {
    return new AppError(429, code, message);
  }

  static serviceUnavailable(code = 'SERVICE_UNAVAILABLE', message = 'Un servicio del que depende esta operación no responde') {
    return new AppError(503, code, message);
  }
}

/** Forma de toda respuesta de error de la API. */
export interface ErrorBody {
  success: false;
  error: { code: string; message: string; details: unknown };
  requestId: string;
}
