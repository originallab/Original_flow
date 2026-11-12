import { Router } from 'express';
import { paymentWebhookBodySchema } from '../schemas/webhooks.schemas.js';
import type { PaymentWebhookService } from '../services/paymentWebhook.service.js';

/** Avisos que otros servicios envían al servidor. No llevan sesión: se autentican con sus propias credenciales. */
export function createWebhooksRouter(payments: PaymentWebhookService): Router {
  const router = Router();

  router.post('/original-pay', async (req, res) => {
    res.json(await payments.handle(paymentWebhookBodySchema.parse(req.body)));
  });

  return router;
}
