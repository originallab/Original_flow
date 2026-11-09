import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTracker } from '@/features/publicPage/useTracker';

// Aquí `sendEvents` es una función simple y no un espía: un espía de Vitest engancha un manejador a cada
// promesa que devuelve y así taparía un rechazo que el hook dejara sin atender.
const red = vi.hoisted(() => ({ lotes: [] as { slug: string; eventos: unknown[]; keepalive: boolean }[], falla: false }));
vi.mock('@/services/publicPages', () => ({
  sendEvents: (slug: string, eventos: unknown[], keepalive = false) => {
    red.lotes.push({ slug, eventos, keepalive });
    return red.falla ? Promise.reject(new Error('Sin conexión')) : Promise.resolve({ accepted: eventos.length });
  },
}));
vi.mock('@/features/publicPage/constants', () => ({ TRACK_DELAY_MS: 25, MAX_BATCH: 20, REDIRECT_DELAY_MS: 3000 }));

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

beforeEach(() => {
  red.lotes = [];
  red.falla = false;
});
afterEach(() => vi.restoreAllMocks());

describe('useTracker', () => {
  it('junta los eventos de un rato y los manda juntos con el slug de la página', async () => {
    const { result } = renderHook(() => useTracker('mi-pagina', true));
    act(() => {
      result.current.pageView('instagram');
      result.current.sectionView('encabezado');
      result.current.buttonClick('boton');
    });
    await esperar(80);
    expect(red.lotes).toHaveLength(1);
    expect(red.lotes[0]).toMatchObject({ slug: 'mi-pagina', keepalive: false });
    expect(red.lotes[0]!.eventos).toEqual([
      { type: 'page_view', properties: { source: 'instagram' } },
      { type: 'section_view', properties: { section: 'encabezado' } },
      { type: 'button_click', properties: { blockKey: 'boton' } },
    ]);
  });

  it('manda el lote en cuanto se juntan 20 y el resto después: ninguno pasa de 20', async () => {
    const { result } = renderHook(() => useTracker('mi-pagina', true));
    act(() => {
      for (let i = 0; i < 25; i++) result.current.buttonClick(`boton-${i}`);
    });
    expect(red.lotes.map((l) => l.eventos.length)).toEqual([20]);
    await esperar(80);
    expect(red.lotes.map((l) => l.eventos.length)).toEqual([20, 5]);
  });

  it('un lote que falla no deja un error sin atender y la página sigue midiendo', async () => {
    const sinAtender: unknown[] = [];
    const escuchar = (motivo: unknown) => sinAtender.push(motivo);
    process.on('unhandledRejection', escuchar);
    try {
      red.falla = true;
      const { result } = renderHook(() => useTracker('mi-pagina', true));
      act(() => result.current.buttonClick('boton'));
      await esperar(80);
      expect(red.lotes).toHaveLength(1);
      red.falla = false;
      act(() => result.current.buttonClick('otro'));
      await esperar(80);
      expect(red.lotes).toHaveLength(2);
      expect(sinAtender).toEqual([]);
    } finally {
      process.off('unhandledRejection', escuchar);
    }
  });

  it('sin página cargada no mide nada', async () => {
    const { result } = renderHook(() => useTracker('mi-pagina', false));
    act(() => {
      result.current.pageView();
      result.current.buttonClick('boton');
    });
    await esperar(80);
    expect(red.lotes).toEqual([]);
  });
});
