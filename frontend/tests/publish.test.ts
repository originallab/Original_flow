import { describe, expect, it } from 'vitest';
import type { FunnelObjective } from '@/services/funnels';
import { OBJECTIVES } from '@/services/funnels';
import { BLOCKS } from '@/shared/blocks/catalog';
import type { Block, BlockType } from '@/shared/blocks/types';
import { pruneToFields, validateFields } from '@/shared/blocks/validate';
import { FUNNEL_TYPES, validateTypeConfig } from '@/shared/funnelTypes';
import { findPublishProblems, type PublishInput } from '@/shared/publish';
import { canEditFunnels, canPublishFunnels } from '@/shared/utils/permissions';

const bloque = (type: BlockType, key: string = type): Block => ({ key, type, order: 1, content: BLOCKS[type].create(), style: {} });
const paths = (objective: FunnelObjective, config: unknown) => validateTypeConfig(objective, config).map((i) => i.path.join('.'));

/** Una configuración completa y válida para cada tipo. */
const COMPLETA: Record<string, Record<string, unknown>> = {
  leads: { thankYou: { message: '¡Gracias!' } },
  venta: { offer: {}, paymentMethods: ['Tarjeta'], successMessage: '¡Gracias!' },
  citas: { calendarUrl: 'https://cal.test/x', durationMin: 30, confirmationMessage: 'Listo' },
  magnet: { resourceFileId: 'archivo-1', deliveryMessage: 'Aquí está' },
  webinar: { startsAt: '2030-01-01T18:00:00.000Z', timezone: 'America/Mexico_City', joinUrl: 'https://meet.test/x', agenda: [] },
  aplicacion: { questions: [{ id: 'motivo', label: '¿Por qué?', type: 'textarea', required: true }], successMessage: 'Recibido' },
};

describe('tipos de funnel', () => {
  it('hay una definición para cada tipo, con las mismas banderas que el backend', () => {
    expect(Object.keys(FUNNEL_TYPES).sort()).toEqual([...OBJECTIVES].sort());
    expect(FUNNEL_TYPES.venta).toMatchObject({ available: true, charges: true, primaryCta: 'checkout' });
    expect(FUNNEL_TYPES.leads).toMatchObject({ available: true, charges: false, primaryCta: 'form_submit' });
    expect(FUNNEL_TYPES.upsell).toMatchObject({ available: false, charges: true });
    expect(FUNNEL_TYPES.libre).toMatchObject({ available: false, primaryCta: null });
  });

  it.each(Object.keys(COMPLETA))('una configuración completa de «%s» es válida', (tipo) => {
    expect(validateTypeConfig(tipo as FunnelObjective, COMPLETA[tipo])).toEqual([]);
  });

  it.each(Object.keys(COMPLETA))('«%s» sin configurar no es válida (hay que completarla)', (tipo) => {
    expect(validateTypeConfig(tipo as FunnelObjective, null).length).toBeGreaterThan(0);
    expect(validateTypeConfig(tipo as FunnelObjective, {}).length).toBeGreaterThan(0);
  });

  it('la configuración inicial de leads, venta y aplicación ya es válida; las demás piden lo que no se puede inventar', () => {
    for (const tipo of ['leads', 'venta', 'aplicacion'] as const) expect(validateTypeConfig(tipo, FUNNEL_TYPES[tipo].initial()), tipo).toEqual([]);
    expect(paths('citas', FUNNEL_TYPES.citas.initial())).toEqual(['calendarUrl']);
    expect(paths('webinar', FUNNEL_TYPES.webinar.initial())).toEqual(['joinUrl']);
    expect(paths('magnet', FUNNEL_TYPES.magnet.initial())).toEqual(['resourceFileId']);
  });

  it('leads: el mensaje es obligatorio y el enlace opcional debe ser válido', () => {
    expect(paths('leads', {})).toEqual(['thankYou.message']);
    expect(paths('leads', { thankYou: {} })).toEqual(['thankYou.message']);
    expect(paths('leads', { thankYou: { message: 'ok', redirectUrl: 'no' } })).toEqual(['thankYou.redirectUrl']);
    expect(paths('leads', { thankYou: { message: 'ok', redirectUrl: 'https://x.test' } })).toEqual([]);
    expect(paths('leads', { thankYou: { message: 'a'.repeat(501) } })).toEqual(['thankYou.message']);
  });

  it('venta: al menos una forma de pago, máximo diez, precio anterior positivo', () => {
    const base = COMPLETA.venta!;
    expect(paths('venta', { ...base, paymentMethods: [] })).toEqual(['paymentMethods']);
    expect(paths('venta', { ...base, paymentMethods: Array.from({ length: 11 }, () => 'x') })).toEqual(['paymentMethods']);
    expect(paths('venta', { ...base, paymentMethods: ['a'.repeat(41)] })).toEqual(['paymentMethods.0']);
    expect(paths('venta', { ...base, offer: { compareAtPrice: 0 } })).toEqual(['offer.compareAtPrice']);
    expect(paths('venta', { ...base, offer: { compareAtPrice: 1999 } })).toEqual([]);
  });

  it('citas: la duración es un entero de 5 a 480 minutos', () => {
    const base = COMPLETA.citas!;
    for (const mala of [4, 481, 30.5, '30']) expect(paths('citas', { ...base, durationMin: mala }), String(mala)).toEqual(['durationMin']);
    for (const buena of [5, 480, 45]) expect(paths('citas', { ...base, durationMin: buena })).toEqual([]);
    expect(validateTypeConfig('citas', { ...base, durationMin: 4 })[0]?.message).toBe('Debe ser un número entero, entre 5 y 480.');
  });

  it('webinar: fecha ISO, zona y enlace obligatorios; los temas de la agenda necesitan título', () => {
    const base = COMPLETA.webinar!;
    expect(paths('webinar', { ...base, startsAt: 'mañana' })).toEqual(['startsAt']);
    expect(paths('webinar', { ...base, joinUrl: 'x' })).toEqual(['joinUrl']);
    expect(paths('webinar', { ...base, timezone: '' })).toEqual(['timezone']);
    expect(paths('webinar', { ...base, agenda: [{ time: '10:00' }] })).toEqual(['agenda.0.title']);
    expect(paths('webinar', { ...base, agenda: [{ title: 'Tema' }] })).toEqual([]);
    const { agenda: _omitida, ...sinAgenda } = base;
    expect(paths('webinar', sinAgenda)).toEqual([]);
  });

  it('aplicación: al menos una pregunta, identificadores válidos y sin repetir', () => {
    const base = COMPLETA.aplicacion!;
    const pregunta = (id: string) => ({ id, label: '¿Algo?', type: 'text', required: false });
    expect(paths('aplicacion', { ...base, questions: [] })).toEqual(['questions']);
    expect(paths('aplicacion', { ...base, questions: [pregunta('Mala Id')] })).toEqual(['questions.0.id']);
    expect(paths('aplicacion', { ...base, questions: [pregunta('uno'), pregunta('uno')] })).toEqual(['questions']);
    expect(paths('aplicacion', { ...base, questions: [pregunta('uno'), pregunta('dos')] })).toEqual([]);
    expect(paths('aplicacion', { ...base, questions: [{ ...pregunta('uno'), type: 'select', options: ['A', ''] }] })).toEqual(['questions.0.options.1']);
    expect(paths('aplicacion', { ...base, questions: [{ ...pregunta('uno'), type: 'otro' }] })).toEqual(['questions.0.type']);
  });

  it('los tipos que todavía no están disponibles no tienen ajustes', () => {
    expect(FUNNEL_TYPES.upsell.fields).toEqual([]);
    expect(FUNNEL_TYPES.libre.fields).toEqual([]);
  });

  it('pruneToFields descarta lo que el tipo no define, también dentro de grupos y listas', () => {
    const limpio = pruneToFields(FUNNEL_TYPES.leads.fields, { thankYou: { message: 'ok', basura: 1 }, otra: 2 });
    expect(limpio).toEqual({ thankYou: { message: 'ok' } });
    const preguntas = pruneToFields(FUNNEL_TYPES.aplicacion.fields, { questions: [{ id: 'a', label: 'x', type: 'text', required: false, extra: 1 }], successMessage: 'ok', otro: 1 });
    expect(preguntas).toEqual({ questions: [{ id: 'a', label: 'x', type: 'text', required: false }], successMessage: 'ok' });
  });

  it('validateFields exige un objeto', () => {
    expect(validateFields(FUNNEL_TYPES.leads.fields, 'hola')).toHaveLength(1);
  });
});

describe('requisitos para publicar', () => {
  const listo = (objective: FunnelObjective, extra: Partial<PublishInput> = {}): PublishInput => {
    const formulario = FUNNEL_TYPES[objective].primaryCta === 'form_submit';
    return {
      objective,
      price: objective === 'venta' ? 100 : null,
      typeConfig: COMPLETA[objective],
      blocks: [bloque('encabezado'), ...(formulario ? [bloque('formulario')] : [bloque('boton')])],
      ctas: objective === 'venta' ? [{ blockKey: 'boton', actionType: 'checkout', destination: null }] : [],
      hasPayments: objective === 'venta' ? true : null,
      ...extra,
    };
  };
  const codigos = (input: PublishInput) => findPublishProblems(input).map((p) => p.code);

  it.each(['leads', 'citas', 'magnet', 'webinar', 'aplicacion', 'venta'] as const)('un funnel de «%s» completo no tiene pendientes', (tipo) => {
    expect(codigos(listo(tipo))).toEqual([]);
  });

  it('una página sin bloques no se puede publicar', () => {
    expect(codigos(listo('leads', { blocks: [] }))).toContain('CONTENT_EMPTY');
  });

  it('sin los ajustes del tipo completos dice cuáles campos faltan', () => {
    const problemas = findPublishProblems(listo('citas', { typeConfig: null }));
    expect(problemas.map((p) => p.code)).toContain('TYPE_CONFIG_INCOMPLETE');
    const ajustes = problemas.find((p) => p.code === 'TYPE_CONFIG_INCOMPLETE')!;
    expect(ajustes.message).toBe('Faltan ajustes del tipo de funnel: calendarUrl, durationMin, confirmationMessage');
    expect(ajustes.field).toBe('typeConfig');
  });

  it('los tipos que captan datos necesitan un formulario', () => {
    for (const tipo of ['leads', 'citas', 'magnet', 'webinar', 'aplicacion'] as const) {
      expect(codigos(listo(tipo, { blocks: [bloque('encabezado')] })), tipo).toContain('FORM_MISSING');
    }
  });

  it('una venta necesita un botón de pago (un CTA con acción «checkout»)', () => {
    expect(codigos(listo('venta', { ctas: [{ blockKey: 'boton', actionType: 'scroll_to', destination: null }] }))).toContain('CHECKOUT_BUTTON_MISSING');
    expect(codigos(listo('venta', { ctas: [] }))).toContain('CHECKOUT_BUTTON_MISSING');
  });

  it('una venta necesita un precio mayor a cero', () => {
    for (const precio of [null, 0, -5]) expect(codigos(listo('venta', { price: precio })), String(precio)).toContain('PRICE_MISSING');
    expect(codigos(listo('venta', { price: 0.5 }))).not.toContain('PRICE_MISSING');
  });

  it('una venta necesita Original Pay conectado; si no se sabe (null) no se marca', () => {
    expect(codigos(listo('venta', { hasPayments: false }))).toContain('PAYMENTS_NOT_CONNECTED');
    expect(codigos(listo('venta', { hasPayments: null }))).not.toContain('PAYMENTS_NOT_CONNECTED');
    expect(codigos(listo('leads', { hasPayments: false }))).not.toContain('PAYMENTS_NOT_CONNECTED');
  });

  it('un botón de tipo enlace sin destino marca cuál es', () => {
    const problemas = findPublishProblems(listo('leads', { ctas: [{ blockKey: 'boton-2', actionType: 'url', destination: null }] }));
    expect(problemas).toContainEqual({ code: 'CTA_DESTINATION_MISSING', message: 'El botón "boton-2" no tiene destino', field: 'boton-2' });
    expect(codigos(listo('leads', { ctas: [{ blockKey: 'b', actionType: 'url', destination: 'https://x.test' }] }))).toEqual([]);
    expect(codigos(listo('leads', { ctas: [{ blockKey: 'b', actionType: 'scroll_to', destination: null }] }))).toEqual([]);
  });

  it('junta todos los pendientes a la vez', () => {
    const todos = codigos({ objective: 'venta', price: null, typeConfig: null, blocks: [], ctas: [], hasPayments: false });
    expect(todos).toEqual(['CONTENT_EMPTY', 'TYPE_CONFIG_INCOMPLETE', 'CHECKOUT_BUTTON_MISSING', 'PRICE_MISSING', 'PAYMENTS_NOT_CONNECTED']);
  });
});

describe('permisos sobre funnels', () => {
  it.each([
    ['super_admin', true, true],
    ['client_admin', true, true],
    ['marketing_manager', true, true],
    ['disenador', true, false],
    ['vendedor', false, false],
    ['analista', false, false],
    [undefined, false, false],
  ])('%s: editar=%s, publicar=%s', (rol, editar, publicar) => {
    expect(canEditFunnels(rol)).toBe(editar);
    expect(canPublishFunnels(rol)).toBe(publicar);
  });
});
