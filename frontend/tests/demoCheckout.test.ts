import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFunnelsPerformance, getSummary, getFunnelConversion } from '@/services/analytics';
import { apiFetch, type ApiError } from '@/services/api';
import { createFunnel, publishFunnel, saveContent, saveTypeConfig, updateFunnel } from '@/services/funnels';
import { listLeads, listLeadStages } from '@/services/leads';
import { connectPayments, getPaymentsStatus } from '@/services/payments';
import { getOrder, getPublicPage, sendLead, startCheckout } from '@/services/publicPages';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import { startDemo } from './helpers/demoApp';
import { bloque, editarBaseDeDemostracion, leerBaseDeDemostracion } from './helpers/publicApp';
import { CONEXION, ENLACE_DE_COMPRA, MENSAJE_DE_COMPRA as MENSAJE, pagar, tienda } from './helpers/tiendaApp';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

const falla = async (promesa: Promise<unknown>) => (await promesa.catch((e: unknown) => e)) as ApiError;
const CLAVE = 'clave-de-compra-0001';
const COMPRADOR = { name: 'María Pérez', email: 'maria@correo.com', consent: true } as const;

const ordenes = () => leerBaseDeDemostracion().orders;

describe('modo demostración: conectar Original Pay', () => {
  it('sin conectar dice «no conectado»; al conectar guarda divisa y métodos y nunca devuelve la llave', async () => {
    const { token, workspace } = await tienda({ conectar: false, publicar: false });
    expect(await getPaymentsStatus(token, workspace.id)).toEqual({ connected: false });
    const estado = await connectPayments(token, workspace.id, { ...CONEXION, methods: ['stripe', 'webpay'] });
    expect(estado).toEqual({ connected: true, provider: 'original_pay', currency: 'MXN', methods: ['stripe', 'webpay'] });
    expect(await getPaymentsStatus(token, workspace.id)).toEqual(estado);
    expect(JSON.stringify(leerBaseDeDemostracion())).not.toContain(CONEXION.apiKey);
  });

  it.each([
    [{ apiKey: 'corta', currency: 'MXN', methods: ['stripe'] }, 'apiKey'],
    [{ apiKey: 'x'.repeat(501), currency: 'MXN', methods: ['stripe'] }, 'apiKey'],
    [{ apiKey: 'sk_test_12345678', currency: 'EUR', methods: ['stripe'] }, 'currency'],
    [{ apiKey: 'sk_test_12345678', currency: 'MXN', methods: [] }, 'methods'],
    [{ apiKey: 'sk_test_12345678', currency: 'MXN', methods: ['stripe', 'stripe'] }, 'methods'],
    [{ apiKey: 'sk_test_12345678', currency: 'MXN', methods: ['bitcoin'] }, 'methods'],
  ])('rechaza %o por su %s', async (cuerpo, campo) => {
    const { token, workspace } = await tienda({ conectar: false, publicar: false });
    const error = await falla(connectPayments(token, workspace.id, cuerpo as never));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(campo);
    expect((await getPaymentsStatus(token, workspace.id)).connected).toBe(false);
  });

  it('un negocio ajeno responde 404 y sin sesión 401', async () => {
    const { workspace } = await tienda({ conectar: false, publicar: false });
    const ajeno = await startDemo({ email: 'beto@correo.com', name: 'Beto' });
    expect((await falla(getPaymentsStatus(ajeno.token, workspace.id))).status).toBe(404);
    expect((await falla(connectPayments(ajeno.token, workspace.id, { ...CONEXION, methods: ['stripe'] }))).status).toBe(404);
    expect((await falla(getPaymentsStatus('token-falso', workspace.id))).status).toBe(401);
  });

  it('un funnel que cobra solo se publica con Pay conectado', async () => {
    const { token, funnel } = await tienda({ conectar: false, publicar: false });
    const error = await falla(publishFunnel(token, funnel.id));
    expect(error.code).toBe('FUNNEL_NOT_READY');
    expect(JSON.stringify(error.details)).toContain('PAYMENTS_NOT_CONNECTED');
  });

  it('la página pública ofrece las formas de pago solo si el funnel cobra y el negocio tiene Pay conectado', async () => {
    const { slug } = await tienda();
    expect((await getPublicPage(slug)).paymentMethods).toEqual(['stripe', 'mercadopago']);
    editarBaseDeDemostracion((db) => {
      db.payments = {};
    });
    expect(await getPublicPage(slug)).not.toHaveProperty('paymentMethods');
  });
});

describe('modo demostración: POST /public/funnels/:slug/checkout', () => {
  it('crea la orden con el precio del funnel (nunca del navegador), el lead en la primera etapa y el evento de inicio', async () => {
    const { token, workspace, slug } = await tienda({ price: 499.5 });
    const respuesta = await startCheckout(slug, { ...COMPRADOR, email: '  Maria@Correo.COM ', paymentMethod: 'mercadopago', ...({ amount: 1 } as object) }, CLAVE);
    expect(respuesta).toMatchObject({ status: 'pending' });
    expect(respuesta.publicToken).toBeTruthy();
    expect(respuesta.paymentUrl).toMatch(new RegExp(`/demo/pago/${respuesta.publicToken}$`));
    expect(ordenes()).toHaveLength(1);
    expect(ordenes()[0]).toMatchObject({ amount: 499.5, currency: 'MXN', status: 'pending', paymentMethod: 'mercadopago', customerEmail: 'maria@correo.com', idempotencyKey: CLAVE, paidAt: null });
    const [primera] = await listLeadStages(token, workspace.id);
    const { items } = await listLeads(token, workspace.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ email: 'maria@correo.com', name: 'María Pérez', leadStageId: primera!.id });
    expect(leerBaseDeDemostracion().events.map((e) => e.type)).toEqual(['lead_created', 'checkout_started']);
  });

  it('sin indicar la forma de pago usa la primera del negocio', async () => {
    const { slug } = await tienda();
    await startCheckout(slug, COMPRADOR, CLAVE);
    expect(ordenes()[0]!.paymentMethod).toBe('stripe');
  });

  it('exige la clave de idempotencia de 8 a 64 caracteres', async () => {
    const { slug } = await tienda();
    for (const clave of [undefined, 'corta', 'x'.repeat(65)]) {
      const error = await falla(apiFetch(`/public/funnels/${slug}/checkout`, { method: 'POST', body: COMPRADOR, headers: clave ? { 'Idempotency-Key': clave } : {} }));
      expect(error.status, String(clave)).toBe(422);
      expect(error.code, String(clave)).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
    expect(ordenes()).toHaveLength(0);
  });

  it('repetir una compra ya pagada devuelve su estado, sin enlace de pago', async () => {
    const { slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(publicToken, 'paid');
    expect(await startCheckout(slug, COMPRADOR, CLAVE)).toEqual({ publicToken, status: 'paid' });
  });

  it('un funnel que no cobra nunca ofrece formas de pago, aunque el negocio tenga Pay conectado', async () => {
    const { token, workspace } = await tienda();
    const leads = await createFunnel(token, { workspaceId: workspace.id, name: 'Solo leads', objective: 'leads' });
    await saveContent(token, leads.id, [bloque('encabezado'), bloque('formulario', 'formulario', undefined, 2)]);
    await saveTypeConfig(token, leads.id, FUNNEL_TYPES.leads.initial());
    await publishFunnel(token, leads.id);
    expect(await getPublicPage(leads.slug)).not.toHaveProperty('paymentMethods');
  });

  it('un funnel que no cobra, sin precio o sin Pay conectado responde 422 y no crea nada', async () => {
    const { token, workspace, slug } = await tienda();
    const leads = await createFunnel(token, { workspaceId: workspace.id, name: 'Solo leads', objective: 'leads' });
    await saveContent(token, leads.id, [bloque('encabezado'), bloque('formulario', 'formulario', undefined, 2)]);
    await saveTypeConfig(token, leads.id, FUNNEL_TYPES.leads.initial());
    await publishFunnel(token, leads.id);
    expect((await falla(startCheckout(leads.slug, COMPRADOR, CLAVE))).code).toBe('FUNNEL_DOES_NOT_CHARGE');
    editarBaseDeDemostracion((db) => {
      db.funnels.find((f: Record<string, any>) => f.slug === slug).price = null;
    });
    expect((await falla(startCheckout(slug, COMPRADOR, CLAVE))).code).toBe('PRICE_MISSING');
    editarBaseDeDemostracion((db) => {
      db.funnels.find((f: Record<string, any>) => f.slug === slug).price = 500;
      db.payments = {};
    });
    expect((await falla(startCheckout(slug, COMPRADOR, CLAVE))).code).toBe('PAYMENTS_NOT_CONNECTED');
    expect(ordenes()).toHaveLength(0);
  });

  it('un funnel en borrador o que no existe responde el mismo 404', async () => {
    const { token, funnel, slug } = await tienda();
    await import('@/services/funnels').then(({ unpublishFunnel }) => unpublishFunnel(token, funnel.id));
    expect((await falla(startCheckout(slug, COMPRADOR, CLAVE))).code).toBe('PAGE_NOT_FOUND');
    expect((await falla(startCheckout('no-existe', COMPRADOR, CLAVE))).code).toBe('PAGE_NOT_FOUND');
  });

  it.each([
    [{ ...COMPRADOR, name: '' }, 'name'],
    [{ ...COMPRADOR, name: 'x'.repeat(201) }, 'name'],
    [{ ...COMPRADOR, email: 'no-es-correo' }, 'email'],
    [{ ...COMPRADOR, phone: 'abc' }, 'phone'],
    [{ ...COMPRADOR, consent: false }, 'consent'],
    [{ ...COMPRADOR, paymentMethod: 'bitcoin' }, 'paymentMethod'],
    [{ ...COMPRADOR, paymentMethod: 'paypal' }, 'paymentMethod'], // válido, pero el negocio no lo acepta
  ])('rechaza %o por su %s', async (cuerpo, campo) => {
    const { slug } = await tienda();
    const error = await falla(startCheckout(slug, cuerpo as never, CLAVE));
    expect(error.status).toBe(422);
    expect(error.fieldErrors()).toHaveProperty(campo);
    expect(ordenes()).toHaveLength(0);
  });

  it('un reintento con la misma clave y los mismos datos devuelve la misma orden, sin cobrar dos veces', async () => {
    const { slug } = await tienda();
    const primera = await startCheckout(slug, COMPRADOR, CLAVE);
    const segunda = await startCheckout(slug, { ...COMPRADOR, email: 'MARIA@correo.com' }, CLAVE);
    expect(segunda).toEqual(primera);
    expect(ordenes()).toHaveLength(1);
    expect(leerBaseDeDemostracion().events.filter((e) => e.type === 'checkout_started')).toHaveLength(1);
  });

  it('la misma clave con otro correo u otra forma de pago responde 409', async () => {
    const { slug } = await tienda();
    await startCheckout(slug, { ...COMPRADOR, paymentMethod: 'stripe' }, CLAVE);
    for (const otro of [{ ...COMPRADOR, email: 'otra@correo.com', paymentMethod: 'stripe' as const }, { ...COMPRADOR, paymentMethod: 'mercadopago' as const }]) {
      const error = await falla(startCheckout(slug, otro, CLAVE));
      expect(error.status).toBe(409);
      expect(error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
    expect(ordenes()).toHaveLength(1);
  });

  it('con otra clave, la persona que ya tenía una orden pendiente sigue con la misma', async () => {
    const { slug } = await tienda();
    const primera = await startCheckout(slug, COMPRADOR, CLAVE);
    const segunda = await startCheckout(slug, COMPRADOR, 'otra-clave-distinta');
    expect(segunda.publicToken).toBe(primera.publicToken);
    expect(ordenes()).toHaveLength(1);
  });

  it('usa el lead que esa persona ya había dejado en el formulario en vez de crear otro', async () => {
    const { token, workspace, slug } = await tienda();
    await sendLead(slug, { consent: true, name: 'María', email: 'maria@correo.com' });
    await startCheckout(slug, COMPRADOR, CLAVE);
    expect((await listLeads(token, workspace.id)).total).toBe(1);
  });

  it('quien ya pagó no puede comprar otra vez (409)', async () => {
    const { slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(publicToken, 'paid');
    const error = await falla(startCheckout(slug, COMPRADOR, 'clave-nueva-0002'));
    expect(error.status).toBe(409);
    expect(error.code).toBe('ORDER_ALREADY_PAID');
  });

  it('después de un pago fallido se puede intentar de nuevo con otra orden', async () => {
    const { slug } = await tienda();
    const primera = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(primera.publicToken, 'failed');
    const segunda = await startCheckout(slug, COMPRADOR, 'clave-nueva-0002');
    expect(segunda.publicToken).not.toBe(primera.publicToken);
    expect(ordenes()).toHaveLength(2);
  });
});

describe('modo demostración: la orden y la pasarela de mentira', () => {
  it('una orden pendiente se ve pendiente, sin mensaje ni enlace', async () => {
    const { slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    expect(await getOrder(publicToken)).toEqual({ publicToken, status: 'pending' });
  });

  it('una orden que no existe responde 404', async () => {
    await tienda();
    const error = await falla(getOrder('no-existe'));
    expect(error.status).toBe(404);
    expect(error.code).toBe('ORDER_NOT_FOUND');
  });

  it('pagar marca la orden, mueve al lead a la etapa ganada, registra el pago y devuelve el mensaje y el enlace de después de comprar', async () => {
    const { token, workspace, slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    expect(await pagar(publicToken, 'paid')).toMatchObject({ status: 'paid', slug });
    expect(await getOrder(publicToken)).toEqual({ publicToken, status: 'paid', message: MENSAJE, redirectUrl: ENLACE_DE_COMPRA });
    expect(ordenes()[0]!.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const etapas = await listLeadStages(token, workspace.id);
    expect((await listLeads(token, workspace.id)).items[0]!.leadStageId).toBe(etapas.find((e) => e.isWon)!.id);
    expect(leerBaseDeDemostracion().events.map((e) => e.type)).toContain('payment_completed');
  });

  it('un pago fallido deja al lead donde estaba y no registra pago', async () => {
    const { token, workspace, slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(publicToken, 'failed');
    expect(await getOrder(publicToken)).toEqual({ publicToken, status: 'failed' });
    const [primera] = await listLeadStages(token, workspace.id);
    expect((await listLeads(token, workspace.id)).items[0]!.leadStageId).toBe(primera!.id);
    expect(leerBaseDeDemostracion().events.map((e) => e.type)).not.toContain('payment_completed');
  });

  it('una orden que ya no está pendiente no cambia', async () => {
    const { slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(publicToken, 'paid');
    await pagar(publicToken, 'failed');
    await pagar(publicToken, 'paid');
    expect((await getOrder(publicToken)).status).toBe('paid');
    expect(leerBaseDeDemostracion().events.filter((e) => e.type === 'payment_completed')).toHaveLength(1);
  });

  it('la página de la pasarela de mentira recibe el monto, la divisa y la dirección de la página', async () => {
    const { slug } = await tienda({ price: 750 });
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    expect(await apiFetch(`/public/_demo/orders/${publicToken}`)).toEqual({ slug, name: 'Curso en línea', amount: 750, currency: 'MXN', status: 'pending' });
    expect((await falla(pagar(publicToken, 'quizas' as never))).status).toBe(422);
    expect((await falla(apiFetch('/public/_demo/orders/no-existe'))).status).toBe(404);
  });
});

describe('modo demostración: los ingresos del dashboard salen de las órdenes pagadas', () => {
  const consulta = (workspaceId: string) => ({ workspaceId, range: '30d' as const });

  it('suma lo pagado por divisa, con el ticket promedio, y no cuenta lo pendiente ni lo fallido', async () => {
    const { token, workspace, slug } = await tienda({ price: 500 });
    for (const [i, resultado] of (['paid', 'paid', 'failed', undefined] as const).entries()) {
      const { publicToken } = await startCheckout(slug, { ...COMPRADOR, email: `cliente${i}@correo.com` }, `clave-de-compra-${i}000`);
      if (resultado) await pagar(publicToken, resultado);
    }
    await updateFunnel(token, (await getPublicFunnelId(token, workspace.id)), { price: 800 });
    const resumen = await getSummary(token, consulta(workspace.id));
    expect(resumen.revenue).toEqual([{ currency: 'MXN', value: 1000, previous: 0 }]);
    expect(resumen.averageTicket).toEqual([{ currency: 'MXN', value: 500, previous: 0 }]);
    expect((await getFunnelsPerformance(token, consulta(workspace.id)))[0]!.revenue).toEqual([{ currency: 'MXN', value: 1000, previous: 0 }]);
  });

  it('compara con el periodo anterior y lista cada divisa por separado', async () => {
    const { token, workspace, slug } = await tienda({ price: 500 });
    const a = await startCheckout(slug, { ...COMPRADOR, email: 'a@correo.com' }, 'clave-de-compra-aaaa');
    const b = await startCheckout(slug, { ...COMPRADOR, email: 'b@correo.com' }, 'clave-de-compra-bbbb');
    await pagar(a.publicToken, 'paid');
    await pagar(b.publicToken, 'paid');
    editarBaseDeDemostracion((db) => {
      db.orders[1].paidAt = new Date(Date.now() - 40 * 86_400_000).toISOString(); // periodo anterior
      db.orders[1].currency = 'USD';
    });
    const resumen = await getSummary(token, consulta(workspace.id));
    expect(resumen.revenue).toEqual([
      { currency: 'MXN', value: 500, previous: 0 },
      { currency: 'USD', value: 0, previous: 500 },
    ]);
    expect(resumen.averageTicket).toEqual([
      { currency: 'MXN', value: 500, previous: 0 },
      { currency: 'USD', value: 0, previous: 500 },
    ]);
  });

  it('el embudo cuenta el inicio de la compra, los pagos y a los clientes', async () => {
    const { token, workspace, slug } = await tienda();
    const { publicToken } = await startCheckout(slug, COMPRADOR, CLAVE);
    await pagar(publicToken, 'paid');
    const etapas = await getFunnelConversion(token, consulta(workspace.id));
    expect(etapas.map((e) => [e.key, e.count])).toEqual([['visits', 0], ['leads', 1], ['opportunities', 1], ['checkout', 1], ['payments', 1], ['customers', 1]]);
  });
});

async function getPublicFunnelId(token: string, workspaceId: string) {
  const { listFunnels } = await import('@/services/funnels');
  return (await listFunnels(token, workspaceId))[0]!.id;
}
