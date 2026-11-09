import { describe, expect, it } from 'vitest';
import { formatValue, fullDate, leadContact, leadTitle, mailtoOf, originOf, relativeDate, telOf, visibleCustomFields } from '@/features/leads/leadDisplay';
import type { Lead } from '@/services/leads';
import { canManageLeads, canViewLeads } from '@/shared/utils/permissions';

const lead = (cambios: Partial<Lead> = {}): Lead => ({
  id: 'l1',
  funnelId: 'f1',
  funnelName: 'Curso',
  leadStageId: 's1',
  name: 'María Pérez',
  email: 'maria@correo.com',
  phone: '55 1234 5678',
  source: 'web_form',
  utm: null,
  assignedTo: null,
  value: null,
  customFields: null,
  createdAt: '2026-10-21T10:00:00.000Z',
  ...cambios,
});

describe('leadTitle y leadContact', () => {
  it('usa el nombre; sin nombre, el correo; sin correo, el teléfono; sin nada, «Sin nombre»', () => {
    expect(leadTitle(lead())).toBe('María Pérez');
    expect(leadTitle(lead({ name: null }))).toBe('maria@correo.com');
    expect(leadTitle(lead({ name: '  ', email: null }))).toBe('55 1234 5678');
    expect(leadTitle(lead({ name: null, email: null, phone: null }))).toBe('Sin nombre');
  });

  it('los datos de contacto no repiten lo que ya es el título', () => {
    expect(leadContact(lead())).toEqual(['maria@correo.com', '55 1234 5678']);
    expect(leadContact(lead({ name: null }))).toEqual(['55 1234 5678']);
    expect(leadContact(lead({ name: null, phone: null }))).toEqual([]);
    expect(leadContact(lead({ email: ' ', phone: null }))).toEqual([]);
  });
});

describe('enlaces de contacto', () => {
  it('solo se enlazan los correos y teléfonos con la forma esperada', () => {
    expect(mailtoOf('maria@correo.com')).toBe('mailto:maria@correo.com');
    expect(mailtoOf(' maria@correo.com ')).toBe('mailto:maria@correo.com');
    for (const raro of ['javascript:alert(1)', 'a@b', 'maria@correo.com?cc=otro@x.com&body=hola', 'a@b.com?subject=hola&body=x', 'a@b.com#x', 'maria%0A@correo.com', 'ma ria@correo.com', '', null]) {
      expect(mailtoOf(raro), String(raro)).toBeNull();
    }
    expect(telOf('55 1234 5678')).toBe('tel:5512345678');
    expect(telOf('+52 (55) 1234-5678')).toBe('tel:+52(55)1234-5678');
    for (const raro of ['javascript:alert(1)', '123', 'abc', '55 1234 5678;ext=1', '', null]) {
      expect(telOf(raro), String(raro)).toBeNull();
    }
  });
});

describe('originOf', () => {
  it('la fuente de la campaña, si no el sitio de donde llegó, si no «Directo»', () => {
    expect(originOf(lead({ utm: { utm_source: ' instagram ', referrer: 'https://google.com' } }))).toBe('instagram');
    expect(originOf(lead({ utm: { referrer: 'https://www.google.com/search?q=datos' } }))).toBe('www.google.com');
    expect(originOf(lead({ utm: { referrer: 'esto no es una dirección' } }))).toBe('Directo');
    expect(originOf(lead({ utm: { utm_source: '  ' } }))).toBe('Directo');
    expect(originOf(lead({ utm: null }))).toBe('Directo');
  });
});

describe('relativeDate', () => {
  const ahora = Date.parse('2026-10-21T12:00:00.000Z');
  const hace = (ms: number) => new Date(ahora - ms).toISOString();
  const min = 60_000;
  const hora = 60 * min;
  const dia = 24 * hora;

  it.each([
    [0, 'hace un momento'],
    [30_000, 'hace un momento'],
    [-5 * min, 'hace un momento'], // el reloj del servidor va adelantado
    [5 * min, 'hace 5 minutos'],
    [59 * min, 'hace 59 minutos'],
    [60 * min, 'hace 1 hora'],
    [3 * hora, 'hace 3 horas'],
    [24 * hora, 'ayer'],
    [3 * dia, 'hace 3 días'],
  ])('hace %s ms → «%s»', (ms, texto) => {
    expect(relativeDate(hace(ms), ahora)).toBe(texto);
  });

  it('pasada una semana muestra la fecha, y una fecha inválida no muestra nada', () => {
    expect(relativeDate(hace(8 * dia), ahora)).toMatch(/oct/);
    expect(relativeDate('no es una fecha', ahora)).toBe('');
    expect(fullDate('no es una fecha')).toBe('');
    expect(fullDate('2026-10-21T10:00:00.000Z')).toMatch(/2026/);
  });
});

describe('visibleCustomFields y formatValue', () => {
  it('muestra lo que dejó escrito, con la etiqueta legible, y oculta los campos internos y los vacíos', () => {
    const campos = visibleCustomFields(lead({ customFields: { mensaje: 'Hola', _consentAt: '2026-10-21', pais_de_origen: 'Chile', edad: 31, acepta: true, rechaza: false, vacio: '  ', nada: null } }));
    expect(campos).toEqual([
      { label: 'Mensaje', value: 'Hola' },
      { label: 'Pais de origen', value: 'Chile' },
      { label: 'Edad', value: '31' },
      { label: 'Acepta', value: 'Sí' },
      { label: 'Rechaza', value: 'No' },
    ]);
    expect(visibleCustomFields(lead({ customFields: null }))).toEqual([]);
  });

  it('el valor no lleva símbolo de moneda y tiene hasta dos decimales', () => {
    expect(formatValue(1500)).toBe('1500');
    expect(formatValue(1500.456)).toBe('1500,46');
    expect(formatValue(0)).toBe('0');
  });
});

describe('permisos sobre leads', () => {
  it.each([
    ['super_admin', true, true],
    ['client_admin', true, true],
    ['marketing_manager', true, true],
    ['vendedor', true, true],
    ['analista', true, false],
    ['disenador', false, false],
    [undefined, false, false],
  ])('%s: ver=%s, mover=%s', (rol, ver, mover) => {
    expect(canViewLeads(rol)).toBe(ver);
    expect(canManageLeads(rol)).toBe(mover);
  });
});
