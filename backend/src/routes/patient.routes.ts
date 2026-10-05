import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { Services } from '../container';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { IntakeToggleSchema, SymptomLogSchema } from '../validation/schemas';

/**
 * Schutz der Triage-Engine vor Flutung. Großzügig genug für das Nachreichen
 * einer Offline-Warteschlange, eng genug gegen Missbrauch.
 */
const symptomLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId ?? 'anonymous',
  message: { error: { code: 'RATE_LIMITED', message: 'Zu viele Einträge in kurzer Zeit. Bitte kurz warten.' } },
});

const HistoryQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

export function patientRoutes(services: Services): Router {
  const router = Router();
  // Guards pro Route (nicht router.use), damit andere unter /api gemountete Router unberührt bleiben.
  const guard = [authenticate, requireRole('PATIENT')];

  /** POST /api/symptoms – täglicher Check-in */
  router.post('/symptoms', ...guard, symptomLimiter, async (req, res) => {
    const input = SymptomLogSchema.parse(req.body);
    const result = await services.symptoms.createForPatientUser(currentUser(req).userId, input);
    res.status(result.duplicate ? 200 : 201).json(result);
  });

  router.get('/patient/home', ...guard, async (req, res) => {
    res.json(await services.patients.home(currentUser(req).userId));
  });

  router.get('/patient/symptoms', ...guard, async (req, res) => {
    const { days } = HistoryQuerySchema.parse(req.query);
    res.json(await services.patients.history(currentUser(req).userId, days));
  });

  router.put('/patient/medications/intake', ...guard, async (req, res) => {
    const { planId, time, taken } = IntakeToggleSchema.parse(req.body);
    const patientId = await services.patients.profileIdForUser(currentUser(req).userId);
    await services.medications.setTaken(patientId, planId, time, taken);
    res.status(204).end();
  });

  return router;
}
