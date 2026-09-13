import { z } from 'zod';

import { TeamScopedSchema } from './schemas.ts';

/** Runtime events that are backed by a production command in this build. */
export const WebhookEventTypeSchema = z.enum(['study.created']);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

/** Historical seed values remain readable but cannot be newly configured. */
export const LegacyWebhookEventTypeSchema = z.enum([
  'session.completed',
  'session.abandoned',
  'participant.enrolled',
  'wave.opened',
  'consent.withdrawn',
]);
export const StoredWebhookEventTypeSchema = z.union([
  WebhookEventTypeSchema,
  LegacyWebhookEventTypeSchema,
]);
export type StoredWebhookEventType = z.infer<
  typeof StoredWebhookEventTypeSchema
>;

export const StudyCreatedWebhookEventSchema = z
  .strictObject({
    type: z.literal('study.created'),
    teamId: z.string().min(1).max(255),
    studyId: z.uuid(),
    resourceId: z.uuid(),
  })
  .meta({ id: 'StudyCreatedWebhookEvent' });

const WebhookEventTypesSchema = z
  .array(WebhookEventTypeSchema)
  .min(1)
  .max(50)
  .refine((values) => new Set(values).size === values.length);

const StoredWebhookEventTypesSchema = z
  .array(StoredWebhookEventTypeSchema)
  .min(1)
  .max(50)
  .refine((values) => new Set(values).size === values.length);

export const WebhookSubscriptionSchema = z.strictObject({
  id: z.uuid(),
  studyId: z.uuid().nullable(),
  url: z.url({ protocol: /^https$/ }),
  description: z.string().trim().min(1).max(500).nullable(),
  eventTypes: StoredWebhookEventTypesSchema,
  state: z.enum(['active', 'disabled']),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

export const CreateWebhookSubscriptionInputSchema = TeamScopedSchema.extend({
  subscriptionId: z.uuid(),
  studyId: z.uuid().nullable().optional(),
  url: z.url({ protocol: /^https$/ }),
  description: z.string().trim().min(1).max(500).nullable().optional(),
  eventTypes: WebhookEventTypesSchema,
  // Generated client-side so the secret never needs a separate reveal route.
  secret: z.string().regex(/^whsec_[A-Za-z0-9_-]{43}$/),
});

export const CreateWebhookSubscriptionResultSchema = z.strictObject({
  subscription: WebhookSubscriptionSchema,
});

export const DisableWebhookSubscriptionInputSchema = TeamScopedSchema.extend({
  subscriptionId: z.uuid(),
});

export const DisableWebhookSubscriptionResultSchema = z.strictObject({
  subscriptionId: z.uuid(),
  state: z.literal('disabled'),
});
