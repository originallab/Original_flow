import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';

afterEach(() => vi.restoreAllMocks());

describe('sessionStore', () => {
  it('guarda, lee y borra el token', () => {
    expect(sessionStore.get()).toBeNull();
    sessionStore.set('abc');
    expect(sessionStore.get()).toBe('abc');
    sessionStore.clear();
    expect(sessionStore.get()).toBeNull();
  });

  it('guarda en sessionStorage (se borra al cerrar la pestaña) y nunca en localStorage', () => {
    sessionStore.set('abc');
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
  });

  it('si el almacenamiento está bloqueado no lanza errores', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(sessionStore.get()).toBeNull();
    expect(() => sessionStore.set('abc')).not.toThrow();
    expect(() => sessionStore.clear()).not.toThrow();
  });
});
