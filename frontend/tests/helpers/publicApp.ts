import { act, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { sessionStore } from '@/features/auth/sessionStore';
import { createFunnel, publishFunnel, saveContent, saveTypeConfig, type Funnel, type FunnelObjective } from '@/services/funnels';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block, BlockType } from '@/shared/blocks/types';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { startDemo } from './demoApp';

export const CONFIGS: Record<string, Record<string, unknown>> = {
  leads: { thankYou: { message: '¡Te esperamos!' } },
  citas: { calendarUrl: 'https://cal.test/ana', durationMin: 30, confirmationMessage: 'Cita reservada' },
  magnet: { resourceFileId: 'archivo-1', deliveryMessage: 'Aquí está tu guía' },
  webinar: { startsAt: '2030-03-05T18:00:00.000Z', timezone: 'America/Mexico_City', joinUrl: 'https://meet.test/evento', agenda: [] },
  aplicacion: { questions: [{ id: 'motivo', label: '¿Por qué?', type: 'text', required: false }], successMessage: 'Recibimos tu aplicación' },
};

export const bloque = (type: BlockType, key: string = type, content?: Record<string, unknown>, order = 1): Block => ({ key, type, order, content: content ?? BLOCKS[type].create(), style: {} });

/** El formulario de los ejemplos: nombre, correo, teléfono (opcional) y un mensaje. */
export const FORMULARIO = bloque('formulario', 'formulario', {
  title: 'Déjanos tus datos',
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true },
    { name: 'email', label: 'Correo', type: 'email', required: true },
    { name: 'telefono', label: 'Teléfono', type: 'tel', required: false },
    { name: 'mensaje', label: 'Mensaje', type: 'textarea', required: false },
  ],
  submitLabel: 'Quiero mi lugar',
});

export interface PublicSetup {
  token: string;
  funnel: Funnel;
  slug: string;
}

/**
 * Un funnel publicado. Deja la aplicación SIN sesión (como la ve un visitante) y con la red apagada
 * (el modo demostración responde solo).
 */
export async function publicarFunnel({ objective = 'leads', blocks, typeConfig, name = 'Mentoría de datos' }: { objective?: FunnelObjective; blocks?: Block[]; typeConfig?: Record<string, unknown>; name?: string } = {}): Promise<PublicSetup> {
  const { token, workspace } = await startDemo();
  const funnel = await createFunnel(token, { workspaceId: workspace.id, name, objective });
  await saveContent(token, funnel.id, blocks ?? [bloque('encabezado', 'encabezado', { title: 'Aprende datos', subtitle: 'En 30 días' }), FORMULARIO]);
  await saveTypeConfig(token, funnel.id, typeConfig ?? CONFIGS[objective] ?? FUNNEL_TYPES[objective].initial());
  await publishFunnel(token, funnel.id);
  sessionStore.clear();
  return { token, funnel, slug: funnel.slug };
}

/** Cambia algo directamente en la base de demostración (lo que el servidor real haría por otro camino). */
export function editarBaseDeDemostracion(cambiar: (db: any) => void) {
  const db = JSON.parse(localStorage.getItem('of-demo-db')!);
  cambiar(db);
  localStorage.setItem('of-demo-db', JSON.stringify(db));
}

export const leerBaseDeDemostracion = () => JSON.parse(localStorage.getItem('of-demo-db')!) as { leads: Record<string, any>[]; events: Record<string, any>[]; funnels: Record<string, any>[]; ctas: Record<string, any>[]; leadStages: Record<string, any>[]; workspaces: Record<string, any>[]; members: Record<string, any>[]; orders: Record<string, any>[]; payments: Record<string, any>; history: Record<string, any>[] };

/** Un `IntersectionObserver` de mentira: deja decidir qué secciones «entran en pantalla». */
export function simularIntersectionObserver() {
  const observadores: { callback: IntersectionObserverCallback; elementos: Element[] }[] = [];
  class Falso {
    elementos: Element[] = [];
    constructor(public callback: IntersectionObserverCallback) {
      observadores.push(this);
    }
    observe(el: Element) {
      this.elementos.push(el);
    }
    unobserve() {}
    disconnect() {
      this.elementos = [];
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', Falso);
  const observados = () => observadores.flatMap((o) => o.elementos.map((el) => (el as HTMLElement).dataset.blockKey));
  /** Avisa a los observadores de que estos bloques entraron (o salieron de) pantalla, cuando ya estén registrados. */
  const avisar = async (claves: string[], isIntersecting: boolean) => {
    await waitFor(() => expect(observados()).toEqual(expect.arrayContaining(claves)));
    act(() => {
      for (const observador of observadores) {
        const objetivos = observador.elementos.filter((el) => claves.includes((el as HTMLElement).dataset.blockKey ?? ''));
        if (objetivos.length > 0) observador.callback(objetivos.map((target) => ({ isIntersecting, target }) as unknown as IntersectionObserverEntry), observador as unknown as IntersectionObserver);
      }
    });
  };
  return {
    /** Hace que estos bloques entren en pantalla. */
    entrar: (...claves: string[]) => avisar(claves, true),
    /** Hace que estos bloques salgan de la pantalla (no cuenta como visto). */
    salir: (...claves: string[]) => avisar(claves, false),
    observados,
  };
}
