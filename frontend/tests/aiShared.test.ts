import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services/api';
import { aiErrorMessage, describeContent } from '@/shared/ai';
import { AI_BLOCK_TYPES, canRewriteWithAi } from '@/shared/aiBlocks';
import { BLOCKS } from '@/shared/blocks/catalog';

describe('qué bloques puede reescribir la IA', () => {
  it('los de texto sí; los que necesitan datos que no debe inventar, no', () => {
    for (const type of ['encabezado', 'texto', 'beneficios', 'faq', 'precios', 'formulario', 'boton', 'agenda', 'requisitos'] as const) expect(canRewriteWithAi(type)).toBe(true);
    for (const type of ['testimonios', 'logos', 'imagen', 'video', 'calendario', 'contador'] as const) expect(canRewriteWithAi(type)).toBe(false);
  });

  it('todos existen en el catálogo de bloques', () => {
    for (const type of AI_BLOCK_TYPES) expect(BLOCKS[type]).toBeDefined();
  });
});

describe('aiErrorMessage', () => {
  it.each([
    ['AI_NOT_CONFIGURED', 503, 'La IA no está disponible por ahora.'],
    ['AI_MISCONFIGURED', 503, 'La IA no está disponible por ahora.'],
    ['AI_UNAVAILABLE', 503, 'La IA no respondió. Intenta de nuevo en un momento.'],
    ['AI_BAD_RESPONSE', 503, 'La IA no devolvió algo que se pueda usar. Intenta de nuevo.'],
    ['AI_RATE_LIMITED', 429, 'Se alcanzó el límite de usos de la IA de este negocio. Intenta más tarde.'],
    ['AI_QUOTA_EXCEEDED', 429, 'Se agotó la cuota de la IA. Intenta más tarde.'],
    ['FUNNEL_PUBLISHED', 409, 'Despublica el funnel antes de volver a generar su página.'],
    ['AI_BLOCK_NOT_SUPPORTED', 422, 'La IA no puede reescribir este tipo de bloque.'],
  ])('%s → mensaje claro, sin el detalle técnico', (code, status, texto) => {
    expect(aiErrorMessage(new ApiError(status, code, 'detalle técnico del servidor'))).toBe(texto);
  });

  it('sin conexión muestra el mensaje de red; lo desconocido, uno genérico', () => {
    expect(aiErrorMessage(new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.'))).toBe('No se pudo conectar con el servidor.');
    expect(aiErrorMessage(new ApiError(500, 'RARO', 'x'))).toBe('No se pudo usar la IA. Intenta de nuevo.');
    expect(aiErrorMessage(new Error('boom'))).toBe('No se pudo usar la IA. Intenta de nuevo.');
  });
});

describe('describeContent: el texto de una propuesta en líneas legibles', () => {
  it('un encabezado: cada campo con su etiqueta', () => {
    expect(describeContent('encabezado', { title: 'Aprende datos', subtitle: 'Un curso práctico' })).toEqual([
      { label: 'Título', text: 'Aprende datos' },
      { label: 'Subtítulo', text: 'Un curso práctico' },
    ]);
  });

  it('una lista: una línea por elemento, con sus partes unidas', () => {
    const lines = describeContent('beneficios', { title: 'Qué obtienes', items: [{ title: 'Clases prácticas', description: 'Con ejercicios' }, { title: 'Soporte' }] });
    expect(lines.map((l) => l.text)).toEqual(['Qué obtienes', 'Clases prácticas — Con ejercicios', 'Soporte']);
    expect(lines[1]?.label).toMatch(/1$/);
    expect(lines[2]?.label).toMatch(/2$/);
  });

  it('ignora los valores vacíos y los que no son texto', () => {
    expect(describeContent('texto', { title: '  ', body: 'Hola', extra: { a: 1 }, vacio: null })).toEqual([{ label: 'body', text: 'Hola' }].map((l) => ({ ...l, label: describeContent('texto', { body: 'Hola' })[0]?.label })));
  });
});
