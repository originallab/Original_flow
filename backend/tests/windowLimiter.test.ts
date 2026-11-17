import { describe, expect, it } from 'vitest';
import { createWindowLimiter } from '../src/lib/windowLimiter.js';

describe('límite de usos por ventana', () => {
  it('permite hasta el máximo por clave y rechaza lo que sigue', () => {
    const limiter = createWindowLimiter({ max: 2, windowMs: 1000, now: () => 0 });
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a')]).toEqual([true, true, false]);
  });

  it('cada clave tiene su propio cupo', () => {
    const limiter = createWindowLimiter({ max: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('b')).toBe(true);
    expect(limiter.take('a')).toBe(false);
  });

  it('el cupo se recupera cuando pasa la ventana, y un rechazo no lo gasta', () => {
    let ahora = 0;
    const limiter = createWindowLimiter({ max: 1, windowMs: 1000, now: () => ahora });
    expect(limiter.take('a')).toBe(true);
    ahora = 500;
    expect(limiter.take('a')).toBe(false);
    ahora = 1001;
    expect(limiter.take('a')).toBe(true);
    ahora = 1500;
    expect(limiter.take('a')).toBe(false);
  });
});
