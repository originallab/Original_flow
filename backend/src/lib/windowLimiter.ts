/**
 * Límite de usos por clave y ventana de tiempo, en memoria de un solo proceso (sin Redis: hay una
 * instancia). Sirve para acotar el gasto en la IA por negocio. Si el despliegue pasa a varias
 * instancias hay que cambiarlo por un contador compartido.
 */
export function createWindowLimiter({ max, windowMs, now = Date.now }: { max: number; windowMs: number; now?: () => number }) {
  const hits = new Map<string, number[]>();

  return {
    /** Registra un uso y devuelve false si la clave ya agotó su cupo en la ventana. */
    take(key: string): boolean {
      const current = now();
      const recent = (hits.get(key) ?? []).filter((at) => at > current - windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(current);
      hits.set(key, recent);
      return true;
    },
  };
}

export type WindowLimiter = ReturnType<typeof createWindowLimiter>;
