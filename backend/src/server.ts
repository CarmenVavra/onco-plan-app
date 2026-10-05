import { createServer, type RequestListener } from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { createServices } from './container';
import { prisma } from './lib/prisma';
import { logger } from './lib/logger';
import { SocketAlertNotifier } from './services/AlertNotifier';
import { createSocketServer } from './socket';

async function main(): Promise<void> {
  await prisma.$connect();

  // Socket.io und Express teilen sich einen Port. Socket.io umhüllt den bestehenden
  // Request-Listener; die Express-App wird erst danach (mit dem Notifier) erzeugt.
  let handleRequest: RequestListener = (_req, res) => {
    res.statusCode = 503;
    res.end();
  };
  const httpServer = createServer((req, res) => handleRequest(req, res));
  const io = createSocketServer(httpServer);
  const services = createServices(prisma, new SocketAlertNotifier(io));
  handleRequest = createApp(services);

  httpServer.listen(env.PORT, () => {
    logger.info(`OncoPlan-Backend läuft auf http://localhost:${env.PORT}`, { demoMode: env.DEMO_MODE });
  });

  const shutdown = (signal: string): void => {
    logger.info('Fahre herunter', { signal });
    void io.close();
    httpServer.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.error('Start fehlgeschlagen', { errorMessage: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
