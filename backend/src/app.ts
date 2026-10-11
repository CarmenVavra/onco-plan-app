import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Services } from './container';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth.routes';
import { doctorRoutes } from './routes/doctor.routes';
import { patientAdminRoutes } from './routes/patient-admin.routes';
import { patientRoutes } from './routes/patient.routes';

/** Gebautes Angular-Frontend; wird in Produktion vom selben Origin ausgeliefert. */
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist/frontend/browser');

export function createApp(services: Services): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/auth', authRoutes(services));
  app.use('/api', patientRoutes(services));
  app.use('/api', doctorRoutes(services));
  app.use('/api', patientAdminRoutes(services));
  app.use('/api', notFoundHandler);

  // Bei jeder Anfrage prüfen (nicht nur beim Start): Beim Deployment kann der
  // Frontend-Ordner kurz fehlen, ohne dass der Server danach neu starten muss.
  const indexHtml = path.join(FRONTEND_DIST, 'index.html');
  app.use(express.static(FRONTEND_DIST, { index: false, maxAge: '1h' }));
  // SPA-Fallback: alle übrigen GET-Anfragen liefern die Angular-App aus.
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res, next) => {
    if (!existsSync(indexHtml)) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });

  app.use(errorHandler);
  return app;
}
