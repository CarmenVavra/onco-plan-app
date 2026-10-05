import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { env } from './config/env';
import { logger } from './lib/logger';
import { doctorRoom, type ServerToClientEvents } from './services/AlertNotifier';
import { AUTH_COOKIE, type SessionUser, verifySessionToken } from './services/AuthTokenService';

interface SocketData {
  user: SessionUser;
}

export type OncoSocketServer = Server<Record<string, never>, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Socket.io-Server. Authentifizierung über dasselbe HTTP-Only-Cookie wie REST.
 * Ärzte werden serverseitig ihrem Raum zugeordnet – Clients können keine
 * fremden Räume betreten (es gibt kein "join-room"-Event).
 */
export function createSocketServer(httpServer: HttpServer): OncoSocketServer {
  const io: OncoSocketServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    serveClient: false,
  });

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = verifySessionToken(cookies[AUTH_COOKIE]);
    if (!user) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    if (user.role !== 'DOCTOR') {
      next(new Error('FORBIDDEN'));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data.user;
    void socket.join(doctorRoom(userId));
    logger.info('Socket verbunden', { userId });
    socket.on('disconnect', () => logger.info('Socket getrennt', { userId }));
  });

  return io;
}
