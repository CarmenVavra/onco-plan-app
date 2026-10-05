import { Router } from 'express';
import type { Services } from '../container';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { MedicationPlanSchema, PatientMasterSchema, UuidParamSchema } from '../validation/schemas';

/** Stammdaten- und Medikationspflege – nur für Ärzt:innen und nur für eigene Patient:innen. */
export function patientAdminRoutes({ patientAdmin }: Services): Router {
  const router = Router();
  // Guards pro Route (nicht router.use), damit andere unter /api gemountete Router unberührt bleiben.
  const guard = [authenticate, requireRole('DOCTOR')];

  /** Auswahlliste für "zuständige Ärztin / zuständiger Arzt" */
  router.get('/doctor/doctors', ...guard, async (_req, res) => {
    res.json(await patientAdmin.listDoctors());
  });

  router.post('/doctor/patients', ...guard, async (req, res) => {
    const input = PatientMasterSchema.parse(req.body);
    res.status(201).json(await patientAdmin.create(currentUser(req).userId, input));
  });

  router.get('/doctor/patients/:id/master', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    res.json(await patientAdmin.getMaster(currentUser(req).userId, id));
  });

  router.put('/doctor/patients/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = PatientMasterSchema.parse(req.body);
    await patientAdmin.update(currentUser(req).userId, id, input);
    res.status(204).end();
  });

  router.post('/doctor/patients/:id/password-reset', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    res.json(await patientAdmin.resetPassword(currentUser(req).userId, id));
  });

  router.post('/doctor/patients/:id/medications', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = MedicationPlanSchema.parse(req.body);
    res.status(201).json(await patientAdmin.addMedication(currentUser(req).userId, id, input));
  });

  router.put('/doctor/medications/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    const input = MedicationPlanSchema.parse(req.body);
    res.json(await patientAdmin.updateMedication(currentUser(req).userId, id, input));
  });

  /** Beendet den Eintrag (bzw. löscht ihn, falls er noch nicht begonnen hat) */
  router.delete('/doctor/medications/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    await patientAdmin.endMedication(currentUser(req).userId, id);
    res.status(204).end();
  });

  return router;
}
