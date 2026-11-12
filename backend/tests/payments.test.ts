import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { decryptSecret } from '../src/lib/crypto.js';
import { testDatabaseUrl } from './helpers/db.js';
import { agregarMiembro, crearNegocio, encabezados } from './helpers/negocio.js';
import { buildTestApp } from './helpers/testApp.js';

const KEY = randomBytes(32).toString('hex');
const API_KEY = 'app_ak_llave_secreta_de_prueba_123';
const BODY = { apiKey: API_KEY, currency: 'MXN', methods: ['stripe', 'mercadopago'] };

describe.skipIf(!testDatabaseUrl)('conexión de pagos con Original Pay', () => {
  const { app, prisma, config } = buildTestApp({ PAYMENT_CONFIG_ENCRYPTION_KEY: KEY });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const put = (token: string, id: string, body: object) => request(app).put(`/api/v1/workspaces/${id}/payments`).set(encabezados(token)).send(body);
  const get = (token: string, id: string) => request(app).get(`/api/v1/workspaces/${id}/payments`).set(encabezados(token));
  const negocio = () => crearNegocio(app, config);
  const miembro = (workspaceId: string, role: Parameters<typeof agregarMiembro>[4]) => agregarMiembro(app, prisma, config, workspaceId, role);

  describe('PUT /workspaces/:id/payments', () => {
    it('guarda la llave cifrada, responde sin ella y queda auditado sin la llave', async () => {
      const { token, workspace } = await negocio();
      const res = await put(token, workspace.id, BODY);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ connected: true, provider: 'original_pay', currency: 'MXN', methods: ['stripe', 'mercadopago'] });
      expect(JSON.stringify(res.body)).not.toContain(API_KEY);

      const guardado = (await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).paymentConfig as { apiKeyEnc: string };
      expect(guardado.apiKeyEnc).not.toContain(API_KEY);
      expect(JSON.stringify(guardado)).not.toContain(API_KEY);
      expect(decryptSecret(guardado.apiKeyEnc, KEY)).toBe(API_KEY);

      const auditoria = await prisma.auditLog.findMany({ where: { workspaceId: workspace.id, action: 'payments.connect' } });
      expect(auditoria).toHaveLength(1);
      expect(JSON.stringify(auditoria)).not.toContain(API_KEY);
      expect(auditoria[0]?.metadata).toEqual({ currency: 'MXN', methods: ['stripe', 'mercadopago'] });
    });

    it('volver a conectar reemplaza la conexión anterior', async () => {
      const { token, workspace } = await negocio();
      await put(token, workspace.id, BODY);
      const res = await put(token, workspace.id, { apiKey: 'app_ak_otra_llave_distinta', currency: 'USD', methods: ['paypal'] });
      expect(res.body).toMatchObject({ currency: 'USD', methods: ['paypal'] });
      const guardado = (await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).paymentConfig as { apiKeyEnc: string };
      expect(decryptSecret(guardado.apiKeyEnc, KEY)).toBe('app_ak_otra_llave_distinta');
    });

    it('rechaza con 422 una llave corta, una divisa o método no soportados, métodos vacíos o repetidos', async () => {
      const { token, workspace } = await negocio();
      const malos = [
        { ...BODY, apiKey: 'corta' },
        { ...BODY, currency: 'EUR' },
        { ...BODY, methods: [] },
        { ...BODY, methods: ['bitcoin'] },
        { ...BODY, methods: ['stripe', 'stripe'] },
        { currency: 'MXN', methods: ['stripe'] },
      ];
      for (const body of malos) expect((await put(token, workspace.id, body)).status).toBe(422);
      expect((await get(token, workspace.id)).body).toEqual({ connected: false });
    });

    it('solo el administrador conecta: marketing, vendedor y analista reciben 403 y no se guarda nada', async () => {
      const { token, workspace } = await negocio();
      for (const role of ['marketing_manager', 'vendedor', 'analista', 'disenador'] as const) {
        const otro = await miembro(workspace.id, role);
        expect((await put(otro.token, workspace.id, BODY)).status).toBe(403);
      }
      expect((await get(token, workspace.id)).body).toEqual({ connected: false });
    });

    it('un workspace de otro cliente responde 404 y sin sesión 401', async () => {
      const mio = await negocio();
      const ajeno = await negocio();
      expect((await put(mio.token, ajeno.workspace.id, BODY)).status).toBe(404);
      expect((await get(mio.token, ajeno.workspace.id)).status).toBe(404);
      expect((await request(app).put(`/api/v1/workspaces/${ajeno.workspace.id}/payments`).send(BODY)).status).toBe(401);
      expect((await get(ajeno.token, ajeno.workspace.id)).body).toEqual({ connected: false });
    });

    it('sin la clave de cifrado en el servidor responde 503 y no guarda la llave', async () => {
      const sinClave = buildTestApp();
      try {
        const n = await crearNegocio(sinClave.app, sinClave.config);
        const res = await request(sinClave.app).put(`/api/v1/workspaces/${n.workspace.id}/payments`).set(encabezados(n.token)).send(BODY);
        expect(res.status).toBe(503);
        expect(res.body.error.code).toBe('PAYMENTS_NOT_CONFIGURED');
        expect((await prisma.workspace.findUniqueOrThrow({ where: { id: n.workspace.id } })).paymentConfig).toBeNull();
      } finally {
        await sinClave.prisma.$disconnect();
      }
    });
  });

  describe('GET /workspaces/:id/payments', () => {
    it('informa el estado de la conexión y jamás devuelve la llave, ni cifrada', async () => {
      const { token, workspace } = await negocio();
      expect((await get(token, workspace.id)).body).toEqual({ connected: false });
      await put(token, workspace.id, BODY);
      const res = await get(token, workspace.id);
      expect(res.body).toEqual({ connected: true, provider: 'original_pay', currency: 'MXN', methods: ['stripe', 'mercadopago'] });
      expect(JSON.stringify(res.body)).not.toContain('apiKey');
    });

    it('una configuración guardada con otra forma se trata como no conectada', async () => {
      const { token, workspace } = await negocio();
      await prisma.workspace.update({ where: { id: workspace.id }, data: { paymentConfig: { basura: true } } });
      expect((await get(token, workspace.id)).body).toEqual({ connected: false });
    });

    it('marketing y vendedor no pueden consultar la conexión (403)', async () => {
      const { workspace } = await negocio();
      for (const role of ['marketing_manager', 'vendedor'] as const) {
        expect((await get((await miembro(workspace.id, role)).token, workspace.id)).status).toBe(403);
      }
    });
  });

  it('con pagos conectados, un funnel de venta deja de faltarle PAYMENTS_NOT_CONNECTED al publicar', async () => {
    const n = await negocio();
    const creado = await request(app).post('/api/v1/funnels').set(encabezados(n.token)).send({ workspaceId: n.workspace.id, name: 'Venta', objective: 'venta', price: 100 });
    const faltantes = async () =>
      ((await request(app).post(`/api/v1/funnels/${creado.body.id}/publish`).set(encabezados(n.token))).body.error.details.missing as { code: string }[]).map((m) => m.code);
    expect(await faltantes()).toContain('PAYMENTS_NOT_CONNECTED');
    await put(n.token, n.workspace.id, BODY);
    expect(await faltantes()).not.toContain('PAYMENTS_NOT_CONNECTED');
  });
});
