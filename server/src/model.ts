import { z } from 'zod';

export const apps = ['whatsapp', 'instagram', 'messenger'] as const;
export const sources = ['accessibility', 'notification'] as const;
export const observationSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.uuid(), deviceId: z.uuid(),
  app: z.enum(apps), packageName: z.string().min(1).max(150),
  source: z.enum(sources), simulated: z.boolean(),
  direction: z.enum(['incoming', 'outgoing', 'unknown']),
  deliveryState: z.enum(['observed', 'pending', 'sent', 'unknown']),
  text: z.string().min(1).max(32768),
  conversation: z.object({ id: z.string().max(512).nullable(), title: z.string().max(512).nullable(), isGroup: z.boolean().nullable() }).strict(),
  sender: z.string().max(512).nullable(), recipient: z.string().max(512).nullable(),
  observedAt: z.iso.datetime({ offset: true }),
  messageAt: z.iso.datetime({ offset: true }).nullable(),
  displayedTime: z.string().max(150).nullable(),
  appVersion: z.string().max(100), adapterVersion: z.string().max(100),
  confidence: z.enum(['structured', 'heuristic', 'unknown']),
  evidence: z.array(z.string().max(200)).max(20),
  relatedEventId: z.uuid().nullable(),
}).strict();
export type Observation = z.infer<typeof observationSchema>;
export const batchSchema = z.object({ items: z.array(z.object({ eventId: z.uuid(), envelope: z.string().min(20).max(200000) }).strict()).min(1).max(100) }).strict();
export type ItemStatus = 'accepted' | 'already_received' | 'rejected_permanent' | 'retryable';
export class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
