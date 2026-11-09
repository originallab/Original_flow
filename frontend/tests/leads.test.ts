import { describe, expect, it } from 'vitest';
import { afterSubmitFor } from '@/shared/afterSubmit';
import { buildLeadBody, fieldForIssuePath, formFieldsOf, normalizeLead, validateLead, type FormField } from '@/shared/leads';
import { safeHttpUrl } from '@/shared/utils/safeUrl';

const paths = (body: unknown) => validateLead(body).map((i) => i.path.join('.'));
const ok = { email: 'maria@correo.com', consent: true };

describe('safeHttpUrl (enlaces que vienen de los datos)', () => {
  it.each([
    ['https://ejemplo.com/a?b=1', 'https://ejemplo.com/a?b=1'],
    ['http://ejemplo.com', 'http://ejemplo.com/'],
    ['  https://ejemplo.com  ', 'https://ejemplo.com/'],
  ])('acepta %s', (entrada, esperado) => {
    expect(safeHttpUrl(entrada)).toBe(esperado);
  });

  it.each(['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://x.com', 'file:///etc/passwd', 'vbscript:x', '//ejemplo.com', 'ejemplo.com', '', 'hola'])(
    'rechaza %j',
    (entrada) => {
      expect(safeHttpUrl(entrada)).toBeNull();
    },
  );

  it.each([undefined, null, 5, {}, []])('rechaza lo que no es texto (%j)', (entrada) => {
    expect(safeHttpUrl(entrada)).toBeNull();
  });
});

describe('validateLead (las mismas reglas del backend)', () => {
  it('un lead con correo y consentimiento es válido; con teléfono en lugar de correo también', () => {
    expect(validateLead(ok)).toEqual([]);
    expect(validateLead({ phone: '+52 55 1234 5678', consent: true })).toEqual([]);
    expect(validateLead({ ...ok, name: 'María', utm: { utm_source: 'instagram' }, customFields: { motivo: 'x', edad: 30, ok: true, nada: null } })).toEqual([]);
  });

  it('exige el consentimiento (exactamente true)', () => {
    for (const consent of [false, undefined, 'true', 1, null]) expect(paths({ email: 'a@b.co', consent }), String(consent)).toEqual(['consent']);
  });

  it('exige correo o teléfono', () => {
    expect(paths({ consent: true })).toEqual(['email']);
    expect(paths({ name: 'María', consent: true })).toEqual(['email']);
  });

  it('un correo mal escrito se marca (y no se pide además «correo o teléfono»)', () => {
    for (const mal of ['maria', 'maria@', '@correo.com', 'ma ria@correo.com', 'maria@correo']) expect(paths({ email: mal, consent: true }), mal).toEqual(['email']);
    expect(validateLead({ email: 'maria', consent: true })[0]?.message).toMatch(/correo válido/i);
  });

  it('un correo con mayúsculas y espacios alrededor es válido', () => {
    expect(validateLead({ email: '  Maria@Correo.COM ', consent: true })).toEqual([]);
  });

  it('un correo válido compensa un teléfono que falta, y un teléfono mal escrito se marca', () => {
    expect(paths({ ...ok, phone: 'abc' })).toEqual(['phone']);
    expect(paths({ ...ok, phone: '12' })).toEqual(['phone']);
    expect(paths({ ...ok, phone: '(55) 1234-5678' })).toEqual([]);
  });

  it('el nombre no puede ir vacío ni pasar de 200 caracteres', () => {
    expect(paths({ ...ok, name: '   ' })).toEqual(['name']);
    expect(paths({ ...ok, name: 'a'.repeat(201) })).toEqual(['name']);
    expect(paths({ ...ok, name: 'a'.repeat(200) })).toEqual([]);
  });

  it('los campos extra: nombres válidos, valores simples, máximo 30 y 1000 caracteres', () => {
    expect(paths({ ...ok, customFields: { '1mal': 'x' } })).toEqual(['customFields.1mal']);
    expect(paths({ ...ok, customFields: { _interno: 'x' } })).toEqual(['customFields._interno']);
    expect(paths({ ...ok, customFields: { a: { b: 1 } } })).toEqual(['customFields.a']);
    expect(paths({ ...ok, customFields: { a: 'x'.repeat(1001) } })).toEqual(['customFields.a']);
    expect(paths({ ...ok, customFields: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`c${i}`, 'x'])) })).toEqual(['customFields']);
  });

  it('lo que no es un objeto no es un lead', () => {
    for (const malo of [null, 'hola', 5, []]) expect(validateLead(malo).length, String(malo)).toBeGreaterThan(0);
  });
});

describe('normalizeLead', () => {
  it('recorta, pone el correo en minúsculas y se queda solo con los UTM permitidos', () => {
    const lead = normalizeLead({
      name: '  María  ',
      email: '  Maria@Correo.COM ',
      consent: true,
      utm: { utm_source: ' instagram ', utm_medium: '', referrer: 'https://x.com', utm_campaign: 'c', otra: 'x' } as never,
      customFields: { motivo: 'hola' },
    });
    expect(lead).toEqual({ name: 'María', email: 'maria@correo.com', utm: { utm_source: 'instagram', referrer: 'https://x.com', utm_campaign: 'c' }, customFields: { motivo: 'hola' } });
  });

  it('corta los UTM al largo permitido y no inventa campos que no vinieron', () => {
    const lead = normalizeLead({ email: 'a@b.co', consent: true, utm: { utm_source: 'x'.repeat(300), referrer: 'r'.repeat(400) } });
    expect(lead.utm.utm_source).toHaveLength(100);
    expect(lead.utm.referrer).toHaveLength(300);
    expect(lead).not.toHaveProperty('name');
    expect(lead).not.toHaveProperty('phone');
  });
});

describe('formulario → lead', () => {
  const campos: FormField[] = [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, options: [] },
    { name: 'email', label: 'Correo', type: 'email', required: true, options: [] },
    { name: 'telefono', label: 'Teléfono', type: 'tel', required: false, options: [] },
    { name: 'motivo', label: '¿Por qué?', type: 'textarea', required: false, options: [] },
    { name: 'pais', label: 'País', type: 'select', required: false, options: ['México', 'Chile'] },
  ];

  it('el correo es el email, el teléfono el phone, «nombre» el name y lo demás son campos extra', () => {
    const lead = buildLeadBody(campos, { nombre: 'María', email: 'maria@correo.com', telefono: '555 1234', motivo: 'Quiero aprender', pais: 'México' }, true, { utm_source: 'ig' });
    expect(lead).toEqual({
      consent: true,
      utm: { utm_source: 'ig' },
      name: 'María',
      email: 'maria@correo.com',
      phone: '555 1234',
      customFields: { motivo: 'Quiero aprender', pais: 'México' },
    });
  });

  it('lo vacío o con solo espacios no se manda', () => {
    const lead = buildLeadBody(campos, { nombre: '  ', email: 'a@b.co', telefono: '', motivo: ' ' }, true);
    expect(lead).toEqual({ consent: true, utm: {}, email: 'a@b.co', customFields: {} });
  });

  it('si hay dos campos de correo, solo el primero es el email; el otro va a los extra', () => {
    const doble: FormField[] = [
      { name: 'correo1', label: 'Correo', type: 'email', required: true, options: [] },
      { name: 'correo2', label: 'Otro correo', type: 'email', required: false, options: [] },
    ];
    expect(buildLeadBody(doble, { correo1: 'a@b.co', correo2: 'c@d.co' }, true)).toMatchObject({ email: 'a@b.co', customFields: { correo2: 'c@d.co' } });
  });

  it('un campo que se llama «name» o «nombre_completo» también es el nombre; uno de texto con otro nombre no', () => {
    const otros: FormField[] = [
      { name: 'empresa', label: 'Empresa', type: 'text', required: false, options: [] },
      { name: 'nombre_completo', label: 'Nombre completo', type: 'text', required: false, options: [] },
    ];
    expect(buildLeadBody(otros, { empresa: 'Acme', nombre_completo: 'Ana Pérez' }, true)).toMatchObject({ name: 'Ana Pérez', customFields: { empresa: 'Acme' } });
  });

  it('el lead armado con el formulario pasa la validación del servidor', () => {
    expect(validateLead(buildLeadBody(campos, { nombre: 'María', email: 'maria@correo.com' }, true))).toEqual([]);
  });

  it('formFieldsOf lee los campos del bloque sin fiarse de su forma', () => {
    const leidos = formFieldsOf({ fields: [{ name: 'a', label: 'A', type: 'email', required: true }, { name: 'b', type: 'raro' }, { label: 'sin nombre' }, 'basura', null, { name: 'c', label: 'C', type: 'select', options: ['x', 3, 'y'] }] });
    expect(leidos).toEqual([
      { name: 'a', label: 'A', type: 'email', required: true, options: [] },
      { name: 'b', label: 'b', type: 'text', required: false, options: [] },
      { name: 'c', label: 'C', type: 'select', required: false, options: ['x', 'y'] },
    ]);
    expect(formFieldsOf({})).toEqual([]);
    expect(formFieldsOf({ fields: 'no' })).toEqual([]);
  });

  it('fieldForIssuePath lleva cada problema del servidor a su campo', () => {
    expect(fieldForIssuePath('email', campos)).toBe('email');
    expect(fieldForIssuePath('phone', campos)).toBe('telefono');
    expect(fieldForIssuePath('name', campos)).toBe('nombre');
    expect(fieldForIssuePath('customFields.motivo', campos)).toBe('motivo');
    expect(fieldForIssuePath('customFields.noExiste', campos)).toBeNull();
    expect(fieldForIssuePath('consent', campos)).toBeNull();
    expect(fieldForIssuePath('email', [{ name: 'nombre', label: 'N', type: 'text', required: false, options: [] }])).toBeNull();
  });
});

describe('afterSubmitFor (lo que sigue después de registrarse)', () => {
  it('leads: el mensaje de agradecimiento y, si hay, a dónde ir después', () => {
    expect(afterSubmitFor('leads', { thankYou: { message: '¡Gracias!' } })).toEqual({ message: '¡Gracias!' });
    expect(afterSubmitFor('leads', { thankYou: { message: 'Hola', redirectUrl: 'https://x.test' } })).toEqual({ message: 'Hola', redirectUrl: 'https://x.test' });
  });

  it('citas: confirmación y el calendario', () => {
    expect(afterSubmitFor('citas', { calendarUrl: 'https://cal.test/a', durationMin: 30, confirmationMessage: 'Listo' })).toEqual({ message: 'Listo', redirectUrl: 'https://cal.test/a' });
  });

  it('magnet: mensaje y el archivo del recurso', () => {
    expect(afterSubmitFor('magnet', { resourceFileId: 'f1', deliveryMessage: 'Aquí está' })).toEqual({ message: 'Aquí está', resourceFileId: 'f1' });
  });

  it('webinar: el enlace, la fecha y la zona (sin mensaje)', () => {
    expect(afterSubmitFor('webinar', { startsAt: '2030-01-01T18:00:00.000Z', timezone: 'America/Mexico_City', joinUrl: 'https://meet.test/x', agenda: [] })).toEqual({
      joinUrl: 'https://meet.test/x',
      startsAt: '2030-01-01T18:00:00.000Z',
      timezone: 'America/Mexico_City',
    });
  });

  it('aplicación: el mensaje de éxito', () => {
    expect(afterSubmitFor('aplicacion', { questions: [{ id: 'm', label: '¿?', type: 'text', required: false }], successMessage: 'Recibido' })).toEqual({ message: 'Recibido' });
  });

  it('con ajustes incompletos, sin ajustes o en un tipo sin pantalla posterior devuelve null', () => {
    expect(afterSubmitFor('leads', null)).toBeNull();
    expect(afterSubmitFor('leads', { thankYou: {} })).toBeNull();
    expect(afterSubmitFor('citas', { durationMin: 30 })).toBeNull();
    expect(afterSubmitFor('venta', { offer: {}, paymentMethods: ['Tarjeta'], successMessage: 'Gracias' })).toBeNull();
    expect(afterSubmitFor('upsell', {})).toBeNull();
  });
});
