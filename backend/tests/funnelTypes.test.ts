import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES, readBlocks, validateBlockContent, type BlockType } from '../src/funnel-types/blocks.js';
import { describeFunnelTypes, FUNNEL_TYPES } from '../src/funnel-types/index.js';
import { slugify } from '../src/lib/slug.js';

const URL_OK = 'https://ejemplo.com/pagina';

const VALID_TYPE_CONFIG = {
  leads: { thankYou: { message: 'Gracias por registrarte' } },
  venta: { paymentMethods: ['stripe'], successMessage: 'Compra lista' },
  citas: { calendarUrl: URL_OK, durationMin: 30, confirmationMessage: 'Cita agendada' },
  magnet: { resourceFileId: 'file_1', deliveryMessage: 'Descárgalo aquí' },
  webinar: { startsAt: '2026-11-01T18:00:00-06:00', timezone: 'America/Mexico_City', joinUrl: URL_OK },
  aplicacion: { questions: [{ id: 'nombre', label: '¿Cómo te llamas?', type: 'text' }], successMessage: 'Recibido' },
} as const;

const VALID_BLOCK_CONTENT: Record<BlockType, object> = {
  encabezado: { title: 'Aprende datos' },
  texto: { body: 'Un párrafo' },
  imagen: { url: URL_OK, alt: 'Foto' },
  video: { url: URL_OK },
  formulario: { fields: [{ name: 'email', label: 'Correo', type: 'email' }], submitLabel: 'Enviar' },
  boton: { label: 'Reservar' },
  contador: { endsAt: '2026-11-01T18:00:00Z' },
  precios: { plans: [{ name: 'Único', price: 4200 }] },
  testimonios: { items: [{ name: 'Ana', quote: 'Excelente' }] },
  faq: { items: [{ question: '¿Cuánto dura?', answer: '4 semanas' }] },
  logos: { fileIds: ['file_1'] },
  beneficios: { items: [{ title: 'Clases en vivo' }] },
  calendario: { url: URL_OK },
  agenda: { items: [{ title: 'Apertura' }] },
  requisitos: { items: ['Tener computadora'] },
};

describe('registro de tipos de funnel', () => {
  it('define los 8 tipos y marca solo upsell y libre como no disponibles', () => {
    expect(Object.keys(FUNNEL_TYPES)).toHaveLength(8);
    const noDisponibles = Object.values(FUNNEL_TYPES).filter((t) => !t.available).map((t) => t.id).sort();
    expect(noDisponibles).toEqual(['libre', 'upsell']);
  });

  it('solo venta (y upsell) cobran', () => {
    const cobran = Object.values(FUNNEL_TYPES).filter((t) => t.charges).map((t) => t.id).sort();
    expect(cobran).toEqual(['upsell', 'venta']);
  });

  for (const [tipo, config] of Object.entries(VALID_TYPE_CONFIG)) {
    it(`typeConfig de ${tipo}: acepta una configuración válida y rechaza un objeto vacío`, () => {
      const schema = FUNNEL_TYPES[tipo as keyof typeof FUNNEL_TYPES].typeConfigSchema;
      expect(schema.safeParse(config).success).toBe(true);
      expect(schema.safeParse({}).success).toBe(false);
    });
  }

  it('venta no guarda el precio en typeConfig: la fuente de verdad es Funnel.price', () => {
    const parsed = FUNNEL_TYPES.venta.typeConfigSchema.parse({ ...VALID_TYPE_CONFIG.venta, price: 999 }) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('price');
  });

  it('aplicacion rechaza ids de pregunta repetidos', () => {
    const pregunta = { id: 'nombre', label: 'Nombre', type: 'text' };
    const res = FUNNEL_TYPES.aplicacion.typeConfigSchema.safeParse({ questions: [pregunta, pregunta], successMessage: 'ok' });
    expect(res.success).toBe(false);
  });

  it('describeFunnelTypes devuelve el esquema de typeConfig como JSON serializable', () => {
    const tipos = describeFunnelTypes();
    expect(tipos).toHaveLength(8);
    const venta = tipos.find((t) => t.id === 'venta');
    expect(venta?.typeConfigSchema).toMatchObject({ type: 'object' });
    expect(() => JSON.stringify(tipos)).not.toThrow();
  });
});

describe('catálogo de bloques', () => {
  it('hay un ejemplo válido para cada tipo de bloque', () => {
    expect(Object.keys(VALID_BLOCK_CONTENT).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  for (const tipo of BLOCK_TYPES) {
    it(`${tipo}: acepta contenido válido`, () => {
      expect(validateBlockContent(tipo, VALID_BLOCK_CONTENT[tipo])).toEqual([]);
    });
  }

  // `calendario` es opcional en todo (puede apoyarse en typeConfig.calendarUrl), por eso no está aquí.
  for (const tipo of BLOCK_TYPES.filter((t) => t !== 'calendario')) {
    it(`${tipo}: rechaza contenido vacío`, () => {
      expect(validateBlockContent(tipo, {}).length).toBeGreaterThan(0);
    });
  }

  it('conserva campos que el editor agregue sin que el esquema los conozca', () => {
    expect(validateBlockContent('encabezado', { title: 'Hola', colorFondo: '#fff' })).toEqual([]);
  });

  it('readBlocks devuelve lista vacía ante datos con forma inesperada en vez de fallar', () => {
    expect(readBlocks(null)).toEqual([]);
    expect(readBlocks('texto')).toEqual([]);
    expect(readBlocks({ blocks: 'no-es-lista' })).toEqual([]);
    expect(readBlocks({ blocks: [{ key: 'a', type: 'inexistente' }] })).toEqual([]);
  });
});

describe('slugify', () => {
  it('quita acentos, pasa a minúsculas y usa guiones', () => {
    expect(slugify('Curso de Análisis de Datos!')).toBe('curso-de-analisis-de-datos');
  });

  it('un nombre sin letras o demasiado corto cae en "funnel"', () => {
    expect(slugify('!!')).toBe('funnel');
    expect(slugify('ab')).toBe('funnel');
  });

  it('limita la longitud y no termina en guion', () => {
    const slug = slugify('a'.repeat(49) + ' ' + 'b'.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith('-')).toBe(false);
  });
});
