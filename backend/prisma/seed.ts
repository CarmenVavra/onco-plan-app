/**
 * Demo-/Entwicklungsdaten nach den UI-Mockups (Namen und Werte sind fiktiv).
 * Alle Konten nutzen das Passwort aus SEED_PASSWORD (siehe .env.example).
 *
 *   Ärztin:    lena.brandt@oncoplan.test
 *   Patientin: anna.mueller@oncoplan.test   (noch ohne heutigen Check-in → Live-Demo)
 */
import { PrismaClient, type AlertLevel } from '@prisma/client';
import { CryptoVault } from '../src/services/CryptoVault';
import { PasswordHasher } from '../src/services/PasswordHasher';
import { evaluateTriage } from '../src/services/TriageEngine';
import { addDays, startOfDay, therapyWeek, toDbDate } from '../src/utils/therapy';

const prisma = new PrismaClient();

interface SeedPatient {
  email: string;
  firstName: string;
  lastName: string;
  age: number;
  dx: string;
  week: number;
  phone: string;
  note: string;
  /** Temperaturen der letzten Tage, letzter Wert = heute (sofern hasToday) */
  temps: number[];
  pain: number;
  nausea: number;
  hasToday: boolean;
  /** Minuten vor jetzt für den heutigen Check-in */
  minutesAgo: number;
}

const PATIENTS: SeedPatient[] = [
  { email: 'anna.mueller@oncoplan.test', firstName: 'Anna', lastName: 'Müller', age: 51, dx: 'Mammakarzinom', week: 2, phone: '0664 233 4581', note: 'Gestern Abend leicht fröstelig.', temps: [37.1, 37.3, 37.6, 37.9, 38.2, 38.4], pain: 5, nausea: 1, hasToday: false, minutesAgo: 0 },
  { email: 'klaus.berger@oncoplan.test', firstName: 'Klaus', lastName: 'Berger', age: 64, dx: 'Bronchialkarzinom', week: 3, phone: '01 558 9021', note: 'Husten stärker als sonst.', temps: [36.9, 37.0, 37.4, 37.8, 38.1, 38.4, 38.6], pain: 4, nausea: 1, hasToday: true, minutesAgo: 22 },
  { email: 'petra.schulz@oncoplan.test', firstName: 'Petra', lastName: 'Schulz', age: 58, dx: 'Kolorektales Karzinom', week: 1, phone: '0660 774 1290', note: 'Bauchkrämpfe nach dem Frühstück.', temps: [36.8, 36.9, 37.0, 37.2, 37.1, 37.3, 37.4], pain: 8, nausea: 2, hasToday: true, minutesAgo: 60 },
  { email: 'mehmet.yilmaz@oncoplan.test', firstName: 'Mehmet', lastName: 'Yilmaz', age: 47, dx: 'Non-Hodgkin-Lymphom', week: 4, phone: '0650 904 3317', note: 'Musste zweimal erbrechen.', temps: [36.7, 36.8, 36.9, 37.0, 36.9, 37.1, 37.2], pain: 7, nausea: 3, hasToday: true, minutesAgo: 120 },
  { email: 'ingrid.hoffmann@oncoplan.test', firstName: 'Ingrid', lastName: 'Hoffmann', age: 69, dx: 'Ovarialkarzinom', week: 2, phone: '01 330 1184', note: 'Fühle mich heute besser.', temps: [36.6, 36.8, 36.7, 36.9, 37.0, 36.8, 37.0], pain: 2, nausea: 1, hasToday: true, minutesAgo: 95 },
  { email: 'jonas.weber@oncoplan.test', firstName: 'Jonas', lastName: 'Weber', age: 34, dx: 'Hodenkarzinom', week: 1, phone: '0676 221 0043', note: 'Keine Beschwerden.', temps: [36.5, 36.6, 36.8, 36.7, 36.6, 36.7, 36.8], pain: 1, nausea: 0, hasToday: true, minutesAgo: 115 },
  { email: 'sabine.koch@oncoplan.test', firstName: 'Sabine', lastName: 'Koch', age: 61, dx: 'Pankreaskarzinom', week: 5, phone: '01 914 5573', note: 'Appetit weiterhin gering.', temps: [37.0, 36.9, 37.1, 37.0, 37.2, 37.1], pain: 3, nausea: 1, hasToday: false, minutesAgo: 0 },
  // Demo-Patientin für "Alarm simulieren" (startet unauffällig)
  { email: 'erika.neumann@oncoplan.test', firstName: 'Erika', lastName: 'Neumann', age: 55, dx: 'Mammakarzinom', week: 2, phone: '0699 650 2284', note: 'Etwas müde.', temps: [36.9, 37.2, 37.5, 37.8, 38.0, 38.3], pain: 3, nausea: 1, hasToday: false, minutesAgo: 0 },
];

function birthDateForAge(age: number, now: Date): Date {
  const d = startOfDay(now);
  d.setFullYear(d.getFullYear() - age);
  d.setMonth(0, 15);
  return d;
}

/** Therapiebeginn so wählen, dass heute in der gewünschten Woche liegt (Anna: Woche 2 · Tag 10). */
function therapyStartForWeek(week: number, now: Date): Date {
  return addDays(startOfDay(now), -((week - 1) * 7 + 2));
}

async function main(): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD ist nicht gesetzt (siehe .env.example).');
  const passwordHash = await PasswordHasher.hash(password);
  const now = new Date();

  await prisma.medicationIntake.deleteMany();
  await prisma.triageAlert.deleteMany();
  await prisma.symptomLog.deleteMany();
  await prisma.medicationPlan.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.user.deleteMany();

  const doctor = await prisma.user.create({
    data: { email: 'lena.brandt@oncoplan.test', passwordHash, role: 'DOCTOR', firstName: 'Lena', lastName: 'Brandt' },
  });
  // Zweite Ärztin – prüft die Datenisolation (sieht Lenas Patient:innen nicht).
  await prisma.user.create({
    data: { email: 'tobias.richter@oncoplan.test', passwordHash, role: 'DOCTOR', firstName: 'Tobias', lastName: 'Richter' },
  });

  for (const p of PATIENTS) {
    const therapyStart = therapyStartForWeek(p.week, now);
    const user = await prisma.user.create({
      data: { email: p.email, passwordHash, role: 'PATIENT', firstName: p.firstName, lastName: p.lastName },
    });
    const profile = await prisma.patientProfile.create({
      data: {
        userId: user.id,
        birthDate: toDbDate(birthDateForAge(p.age, now)),
        cancerType: p.dx,
        therapyStart: toDbDate(therapyStart),
        assignedDoctorId: doctor.id,
        phoneEncrypted: CryptoVault.encrypt(p.phone),
      },
    });

    // Historie: Tage vor heute (morgens um 08:00), heute ggf. mit Minuten-Offset
    const historyCount = p.hasToday ? p.temps.length - 1 : p.temps.length;
    for (let i = 0; i < p.temps.length; i++) {
      const isToday = p.hasToday && i === p.temps.length - 1;
      const daysAgo = historyCount - i;
      const loggedAt = isToday ? new Date(now.getTime() - p.minutesAgo * 60_000) : addDays(startOfDay(now), -daysAgo);
      if (!isToday) loggedAt.setHours(8, 5, 0, 0);
      const fever = p.temps[i] ?? 37;
      const pain = isToday ? p.pain : Math.max(0, p.pain - 2);
      const nausea = isToday ? p.nausea : Math.max(0, p.nausea - 1);

      const log = await prisma.symptomLog.create({
        data: {
          patientId: profile.id,
          loggedAt,
          feverCelsius: fever,
          painLevel: pain,
          nauseaLevel: nausea,
          symptomNotes: i === p.temps.length - 1 ? CryptoVault.encrypt(p.note) : null,
        },
      });

      // Gleiche Regeln wie die Live-Engine; historische Alarme gelten als erledigt.
      const triage = evaluateTriage({ feverCelsius: fever, painLevel: pain, nauseaLevel: nausea, therapyWeek: therapyWeek(therapyStart, loggedAt) });
      if (triage.level) {
        await prisma.triageAlert.create({
          data: {
            patientId: profile.id,
            symptomLogId: log.id,
            level: triage.level as AlertLevel,
            status: isToday ? 'ACTIVE' : 'RESOLVED',
            triggerReason: triage.reason,
            createdAt: loggedAt,
            ...(isToday ? {} : { acknowledgedBy: doctor.id, acknowledgedAt: loggedAt, resolvedAt: loggedAt }),
          },
        });
      }
    }
  }

  // Einnahmeplan (Anna, nach Mockup 1a)
  const anna = await prisma.patientProfile.findFirstOrThrow({ where: { user: { email: 'anna.mueller@oncoplan.test' } } });
  const start = anna.therapyStart; // bereits DATE (UTC-Mitternacht)
  const end = toDbDate(addDays(startOfDay(now), 60));
  const annaPlans = [
    { medicationName: 'Capecitabin', dosage: '1.150 mg', frequencyCron: '0 8 * * *', hint: 'nach dem Frühstück' },
    { medicationName: 'Ondansetron', dosage: '8 mg', frequencyCron: '0 8 * * *', hint: 'gegen Übelkeit' },
    { medicationName: 'Dexamethason', dosage: '4 mg', frequencyCron: '0 13 * * *', hint: 'zum Mittagessen' },
    { medicationName: 'Capecitabin', dosage: '1.150 mg', frequencyCron: '0 20 * * *', hint: 'nach dem Abendessen' },
    { medicationName: 'Ondansetron', dosage: '8 mg', frequencyCron: '0 20 * * *', hint: 'bei Bedarf' },
  ];
  for (const plan of annaPlans) {
    const created = await prisma.medicationPlan.create({ data: { ...plan, patientId: anna.id, startDate: start, endDate: end } });
    if (plan.frequencyCron === '0 8 * * *') {
      const at = startOfDay(now);
      at.setHours(8, 0, 0, 0);
      await prisma.medicationIntake.create({ data: { planId: created.id, scheduledAt: at, takenAt: at } });
    }
  }

  // Standard-Plan für alle anderen (Dashboard-Detail "Medikationsplan")
  const others = await prisma.patientProfile.findMany({ where: { id: { not: anna.id } } });
  for (const p of others) {
    await prisma.medicationPlan.createMany({
      data: [
        { patientId: p.id, medicationName: 'Capecitabin', dosage: '1.150 mg', frequencyCron: '0 8,20 * * *', hint: 'nach dem Essen', startDate: start, endDate: end },
        { patientId: p.id, medicationName: 'Ondansetron', dosage: '8 mg', frequencyCron: '0 8 * * *', hint: 'gegen Übelkeit', startDate: start, endDate: end },
      ],
    });
  }

  console.log(`Seed abgeschlossen: 2 Ärzt:innen, ${PATIENTS.length} Patient:innen.`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
