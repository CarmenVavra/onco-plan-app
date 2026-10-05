import { z } from 'zod';

/**
 * Zentrale, validierte Konfiguration. Die Anwendung startet nicht,
 * wenn Pflichtvariablen fehlen oder ungültig sind (Fail-fast, IEC 62304).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET muss mindestens 32 Zeichen lang sein'),
  JWT_EXPIRES_IN_HOURS: z.coerce.number().positive().default(8),
  DATABASE_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'DATABASE_ENCRYPTION_KEY muss aus 64 Hex-Zeichen bestehen'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  CLINIC_NAME: z.string().default('Onkologische Ambulanz'),
  CLINIC_DEPARTMENT: z.string().default('Onkologie'),
  CLINIC_HOTLINE: z.string().default('112'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type AppEnv = z.infer<typeof EnvSchema>;

function loadEnv(): AppEnv {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ungültige Umgebungsvariablen:\n${problems}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.DEMO_MODE) {
    throw new Error('DEMO_MODE darf in Produktion nicht aktiv sein.');
  }
  return parsed.data;
}

export const env: AppEnv = loadEnv();
