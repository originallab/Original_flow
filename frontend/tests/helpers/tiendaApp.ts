import { sessionStore } from '@/features/auth/sessionStore';
import { apiFetch } from '@/services/api';
import { createFunnel, publishFunnel, saveContent, saveTypeConfig } from '@/services/funnels';
import { connectPayments } from '@/services/payments';
import { FUNNEL_TYPES } from '@/shared/funnelTypes';
import type { PaymentMethod } from '@/shared/payments';
import { startDemo } from './demoApp';
import { bloque } from './publicApp';

export const CONEXION = { apiKey: 'sk_test_12345678', currency: 'MXN', methods: ['stripe', 'mercadopago'] } as const;
export const MENSAJE_DE_COMPRA = '¡Gracias por tu compra!';
export const ENLACE_DE_COMPRA = 'https://gracias.test/compra';

/**
 * Un negocio con un funnel de venta («Curso en línea», con un botón «Comprar ahora») y, por defecto, Original Pay
 * conectado y la página publicada. Con `sinSesion` deja la aplicación como la vería quien compra.
 */
export async function tienda({ price = 500, conectar = true, publicar = true, sinSesion = false, metodos = [...CONEXION.methods] }: { price?: number | null; conectar?: boolean; publicar?: boolean; sinSesion?: boolean; metodos?: PaymentMethod[] } = {}) {
  const { token, workspace } = await startDemo();
  const funnel = await createFunnel(token, { workspaceId: workspace.id, name: 'Curso en línea', objective: 'venta', ...(price === null ? {} : { price }), currency: 'MXN' });
  await saveContent(token, funnel.id, [bloque('encabezado', 'encabezado', { title: 'Aprende datos', subtitle: 'En 30 días' }), bloque('boton', 'boton', { label: 'Comprar ahora' }, 2)]);
  await saveTypeConfig(token, funnel.id, { ...FUNNEL_TYPES.venta.initial(), successUrl: ENLACE_DE_COMPRA });
  if (conectar) await connectPayments(token, workspace.id, { ...CONEXION, methods: metodos });
  if (publicar) await publishFunnel(token, funnel.id);
  if (sinSesion) sessionStore.clear();
  return { token, workspace, funnel, slug: funnel.slug };
}

/** Termina el pago de una orden en la «pasarela» de mentira. */
export const pagar = (publicToken: string, outcome: 'paid' | 'failed') => apiFetch<{ status: string; slug: string }>(`/public/_demo/orders/${publicToken}/pay`, { method: 'POST', body: { outcome } });
