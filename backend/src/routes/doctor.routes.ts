import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import type { Services } from '../container';
import { toBundle, toFhirObservations, toFhirPatient } from '../fhir/fhirMapper';
import { AppError } from '../lib/errors';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { dbDateToIso } from '../utils/therapy';
import { AlertStatusSchema, UuidParamSchema } from '../validation/schemas';

const FhirSubjectQuerySchema = z.object({
  subject: z.string().regex(/^Patient\/[0-9a-f-]{36}$/i, 'Erwartet subject=Patient/{id}'),
});

const DEMO_PATIENT_EMAIL = 'erika.neumann@oncoplan.test';

export function doctorRoutes(services: Services): Router {
  const router = Router();
  // Guards pro Route (nicht router.use), damit andere unter /api gemountete Router unberührt bleiben.
  const guard = [authenticate, requireRole('DOCTOR')];

  router.get('/doctor/overview', ...guard, async (req, res) => {
    res.json(await services.doctors.overview(currentUser(req).userId));
  });

  router.get('/doctor/patients/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    res.json(await services.doctors.detail(currentUser(req).userId, id));
  });

  router.get('/alerts', ...guard, async (req, res) => {
    res.json(await services.alerts.history(currentUser(req).userId));
  });

  /** PATCH /api/alerts/:id – Alarm quittieren oder erledigen */
  router.patch('/alerts/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    const { status } = AlertStatusSchema.parse(req.body);
    await services.alerts.updateStatus(currentUser(req).userId, id, status);
    res.status(204).end();
  });

  /** HL7 FHIR R4 – Patient */
  router.get('/fhir/Patient/:id', ...guard, async (req, res) => {
    const { id } = UuidParamSchema.parse(req.params);
    await services.doctors.assertAssigned(currentUser(req).userId, id);
    const profile = await services.prisma.patientProfile.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    res.type('application/fhir+json').json(toFhirPatient({ id: profile.id, ...profile.user, birthDate: dbDateToIso(profile.birthDate) }));
  });

  /** HL7 FHIR R4 – Observation-Suche: /api/fhir/Observation?subject=Patient/{id} */
  router.get('/fhir/Observation', ...guard, async (req, res) => {
    const { subject } = FhirSubjectQuerySchema.parse(req.query);
    const patientId = subject.slice('Patient/'.length);
    await services.doctors.assertAssigned(currentUser(req).userId, patientId);
    const logs = await services.prisma.symptomLog.findMany({
      where: { patientId },
      orderBy: { loggedAt: 'desc' },
      take: 30,
    });
    const baseUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}/api/fhir`;
    res.type('application/fhir+json').json(toBundle(logs.flatMap(toFhirObservations), baseUrl));
  });

  /**
   * Nur Demo-Modus: erzeugt über die echte Pipeline (Speichern → Triage → Socket)
   * einen kritischen Check-in der Demo-Patientin.
   */
  router.post('/demo/simulate-alert', ...guard, async (req, res) => {
    if (!env.DEMO_MODE) throw AppError.notFound('Endpunkt nicht gefunden.');
    const demo = await services.prisma.patientProfile.findFirst({
      where: { user: { email: DEMO_PATIENT_EMAIL }, assignedDoctorId: currentUser(req).userId },
      select: { id: true },
    });
    if (!demo) throw AppError.notFound('Demo-Patientin nicht vorhanden. Bitte Seed ausführen.');
    const result = await services.symptoms.createForProfile(demo.id, {
      feverCelsius: 38.7,
      painLevel: 4,
      nauseaLevel: 2,
      symptomNotes: 'Fieber trotz Paracetamol nicht gesunken.',
    });
    res.status(201).json(result);
  });

  return router;
}
