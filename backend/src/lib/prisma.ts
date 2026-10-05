import { PrismaClient } from '@prisma/client';

/** Einzige PrismaClient-Instanz der Anwendung (Connection-Pool). */
export const prisma = new PrismaClient();
