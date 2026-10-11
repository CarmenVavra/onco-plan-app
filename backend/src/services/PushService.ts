import type { PrismaClient } from '@prisma/client';
import webpush, { WebPushError } from 'web-push';
import type { PushConfigDto } from '../dto';
import { logger } from '../lib/logger';
import type { PushSubscriptionInput } from '../validation/schemas';

/** Höchstzahl gespeicherter Geräte pro Konto – ältere Abos werden verdrängt. */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

export interface PushMessage {
  title: string;
  body: string;
  /** Wird beim Antippen der Mitteilung geöffnet */
  url: string;
  /** Gleiche Tags ersetzen sich auf dem Gerät (keine doppelten Mitteilungen) */
  tag: string;
  /** Wie lange der Push-Dienst die Nachricht für ein offline Gerät aufhebt */
  ttlSeconds: number;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = 'sent' | 'expired' | 'failed';

/** Abstraktion über den Versand, damit Erinnerungen ohne Netzwerk testbar bleiben. */
export interface PushSender {
  readonly publicKey: string | null;
  send(target: PushTarget, message: PushMessage): Promise<PushResult>;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Versand über das Web-Push-Protokoll (RFC 8030/8291). Inhalte sind Ende-zu-Ende verschlüsselt –
 * der Push-Dienst des Browsers (Google, Mozilla …) sieht nur den Chiffretext.
 * Das Format entspricht dem, was der Angular-Service-Worker (ngsw) als Mitteilung anzeigt.
 */
export class WebPushSender implements PushSender {
  readonly publicKey: string | null;
  private readonly vapid: VapidConfig | null;

  constructor(vapid: VapidConfig | undefined) {
    this.vapid = vapid ?? null;
    this.publicKey = vapid?.publicKey ?? null;
    // Prüft das Schlüsselformat beim Start (Fail-fast statt Fehler beim ersten Versand)
    if (vapid) webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  }

  async send(target: PushTarget, message: PushMessage): Promise<PushResult> {
    if (!this.vapid) return 'failed';
    const payload = JSON.stringify({
      notification: {
        title: message.title,
        body: message.body,
        icon: '/app-icons/oncoplan.svg',
        tag: message.tag,
        lang: 'de',
        data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: message.url } } },
      },
    });
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
        TTL: Math.max(60, Math.floor(message.ttlSeconds)),
        urgency: 'normal',
        timeout: 10_000,
      });
      return 'sent';
    } catch (error) {
      if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) return 'expired';
      logger.warn('Push-Versand fehlgeschlagen', {
        pushHost: new URL(target.endpoint).hostname,
        statusCode: error instanceof WebPushError ? error.statusCode : undefined,
      });
      return 'failed';
    }
  }
}

/** Verwaltung der Push-Abonnements (ein Eintrag pro Gerät/Browser). */
export class PushService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: PushSender,
  ) {}

  config(): PushConfigDto {
    return { publicKey: this.sender.publicKey };
  }

  /** Ein Endpoint gehört immer genau einem Konto (Gerätewechsel zwischen Konten übernimmt ihn). */
  async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    const data = { userId, p256dh: input.keys.p256dh, auth: input.keys.auth };
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...data },
      update: data,
    });
    const surplus = await this.prisma.pushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_SUBSCRIPTIONS_PER_USER,
      select: { id: true },
    });
    if (surplus.length > 0) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: surplus.map((s) => s.id) } } });
    }
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Sendet an alle Geräte des Kontos; abgelaufene Abos werden entfernt. Liefert die Zahl erreichter Geräte. */
  async notifyUser(userId: string, message: PushMessage): Promise<number> {
    if (!this.sender.publicKey) return 0;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });
    let delivered = 0;
    for (const sub of subscriptions) {
      const result = await this.sender.send(sub, message);
      if (result === 'sent') delivered++;
      if (result === 'expired') await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
    }
    return delivered;
  }
}
