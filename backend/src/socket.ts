import type { Server as HttpServer } from 'node:http';
import { parse as parseCookie } from 'cookie';
import { Server } from 'socket.io';
import { env } from './config/env';
import { logger } from './lib/logger';
import { doctorRoom, type ServerToClientEvents } from './services/AlertNotifier';
import { AUTH_COOKIE, type SessionUser, verifySessionToken } from './services/AuthTokenService';
import {
  type CallClientEvents,
  type CallParticipant,
  type CallServerEvents,
  type CallService,
  type CallTransport,
  patientRoom,
} from './services/CallService';

interface SocketData {
  user: SessionUser;
}

export type OncoSocketServer = Server<CallClientEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Socket.io-Server. Authentifizierung über dasselbe HTTP-Only-Cookie wie REST.
 * Jede Verbindung wird serverseitig genau einem Raum zugeordnet (Ärzt:in → "doctor_{id}",
 * Patient:in → "patient_{id}"). Clients können keine fremden Räume betreten
 * (es gibt kein "join-room"-Event).
 */
export function createSocketServer(httpServer: HttpServer): OncoSocketServer {
  const io: OncoSocketServer = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    serveClient: false,
    // SDP-Nachrichten sind wenige KB groß – mehr braucht kein Client zu senden
    maxHttpBufferSize: 64 * 1024,
  });

  io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
    const user = verifySessionToken(cookies[AUTH_COOKIE]);
    if (!user) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    if ((user.role !== 'DOCTOR' && user.role !== 'PATIENT') || user.mustChangePassword) {
      next(new Error('FORBIDDEN'));
      return;
    }
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data.user;
    void socket.join(role === 'DOCTOR' ? doctorRoom(userId) : patientRoom(userId));
    logger.info('Socket verbunden', { userId, role });
    socket.on('disconnect', () => logger.info('Socket getrennt', { userId }));
  });

  return io;
}

/** Socket.io als Transport der Anruf-Signalisierung */
export function socketCallTransport(io: OncoSocketServer): CallTransport {
  return {
    emit<E extends keyof CallServerEvents>(target: string, event: E, payload: Parameters<CallServerEvents[E]>[0]) {
      // Die Event-Typen sind in CallServerEvents festgelegt; Socket.io kann den generischen Schlüssel nicht auflösen.
      (io.to(target).emit as (ev: string, data: unknown) => boolean)(event, payload);
    },
    roomSize: (room) => io.sockets.adapter.rooms.get(room)?.size ?? 0,
  };
}

/**
 * Anruf-Events pro Verbindung. Wer sendet, bestimmt der Server aus dem Sitzungs-Cookie –
 * Rollen- und Zugehörigkeitsprüfungen übernimmt der CallService.
 */
export function registerCallHandlers(io: OncoSocketServer, calls: CallService): void {
  io.on('connection', (socket) => {
    const { userId, role } = socket.data.user;
    if (role !== 'DOCTOR' && role !== 'PATIENT') return;
    const me: CallParticipant = { userId, role, socketId: socket.id };
    const guarded =
      <A extends unknown[]>(name: string, handler: (...args: A) => void | Promise<void>) =>
      (...args: A): void => {
        Promise.resolve()
          .then(() => handler(...args))
          .catch((err: unknown) =>
            logger.error('Anruf-Event fehlgeschlagen', {
              event: name,
              errorMessage: err instanceof Error ? err.message : String(err),
            }),
          );
      };

    if (role === 'PATIENT') calls.patientConnected(userId, socket.id);

    socket.on(
      'call:start',
      guarded('call:start', async (payload, ack) => {
        const result = await calls.start(me, payload);
        if (typeof ack === 'function') ack(result);
      }),
    );
    socket.on(
      'call:accept',
      guarded('call:accept', (payload, ack) => {
        const result = calls.accept(me, payload);
        if (typeof ack === 'function') ack(result);
      }),
    );
    socket.on('call:decline', guarded('call:decline', (payload) => calls.decline(me, payload)));
    socket.on('call:hangup', guarded('call:hangup', (payload) => calls.hangup(me, payload)));
    socket.on('call:signal', guarded('call:signal', (payload) => calls.relaySignal(me, payload)));
    socket.on('call:media', guarded('call:media', (payload) => calls.relayMedia(me, payload)));
    socket.on('disconnect', () => calls.socketDisconnected(socket.id));
  });
}
