import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireRole } from '../../http/middlewares/security.js';
import { validate } from '../../http/middlewares/validation.js';

const prompt = z.string().trim().min(1).max(600);
const chatInput = z.strictObject({
  message: prompt,
  previous: z.array(prompt).max(4).default([]),
});

export function createAiRoutes({ assistant, authenticated }) {
  const router = Router();
  router.use(authenticated, requireRole('buyer'));
  router.post(
    '/chat',
    validate(chatInput),
    rateLimit({
      windowMs: 60_000,
      limit: 6,
      keyGenerator: (req) => req.user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) =>
        res.status(429).json({
          code: 'AI_RATE_LIMITED',
          message: 'Ai trimis prea multe mesaje. Revino într-un minut.',
          requestId: req.requestId,
        }),
    }),
    async (req, res) =>
      res.json(await assistant.chat(req.user.id, req.validated)),
  );
  router.post(
    '/cart-proposals/:id/confirm',
    validate(z.object({ id: z.uuid() }), 'params'),
    async (req, res) =>
      res.json(await assistant.confirm(req.user.id, req.validated.id)),
  );
  return router;
}
