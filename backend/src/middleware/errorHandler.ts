import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(AppError.notFound('Endpunkt nicht gefunden.'));
};

/**
 * Zentrale Fehlerbehandlung: Rohe Fehlermeldungen oder Stacktraces
 * verlassen niemals den Server.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.publicMessage } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Die Eingaben sind unvollständig oder ungültig.',
        fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  logger.error('Unbehandelter Fehler', {
    method: req.method,
    path: req.path,
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : undefined,
  });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Ein interner Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' },
  });
};
