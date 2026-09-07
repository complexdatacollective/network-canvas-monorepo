import { z } from 'zod';

export const AUDIT_ALERT_MAX_RECIPIENTS = 10;

export const AuditAlertPolicySchema = z.enum([
  'contact_access',
  'credential_access',
  'repeated_denials',
]);
export const AuditAlertRecipientSchema = z
  .strictObject({
    memberId: z.string().min(1).max(255),
    inApp: z.boolean(),
    email: z.boolean(),
  })
  .refine(
    (recipient) => recipient.inApp || recipient.email,
    'Select at least one channel.',
  );
export const AuditAlertRecipientsSchema = z
  .array(AuditAlertRecipientSchema)
  .max(AUDIT_ALERT_MAX_RECIPIENTS)
  .refine(
    (rows) => new Set(rows.map((row) => row.memberId)).size === rows.length,
    'Recipients must be unique.',
  );
export type AuditAlertRecipient = z.infer<typeof AuditAlertRecipientSchema>;
export const AuditAlertSettingsSchema = z.strictObject({
  revision: z.uuid().nullable(),
  recipients: AuditAlertRecipientsSchema,
  eligibleMembers: z
    .array(
      z.strictObject({
        memberId: z.string(),
        name: z.string(),
        email: z.string(),
      }),
    )
    .max(100),
  eligibleMembersTruncated: z.boolean(),
  emailAvailable: z.boolean(),
});
export type AuditAlertSettings = z.infer<typeof AuditAlertSettingsSchema>;
export const UpdateAuditAlertSettingsSchema = z.strictObject({
  teamId: z.string().min(1).max(255),
  revision: z.uuid().nullable(),
  recipients: AuditAlertRecipientsSchema,
});
export const AuditAlertListInputSchema = z.strictObject({
  teamId: z.string().min(1).max(255),
  cursor: z
    .string()
    .refine(
      (value) =>
        /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
    )
    .optional(),
});
export const AuditAlertItemSchema = z.strictObject({
  id: z.uuid(),
  sequence: z.string(),
  policy: AuditAlertPolicySchema,
  createdAt: z.date(),
  inApp: z.boolean(),
  readAt: z.date().nullable(),
  emailState: z
    .enum(['pending', 'delivered', 'failed', 'uncertain', 'suppressed'])
    .nullable(),
  emailDeliveryId: z.uuid().nullable(),
  emailAcknowledgedAt: z.date().nullable(),
});
export type AuditAlertItem = z.infer<typeof AuditAlertItemSchema>;
export const AuditAlertListSchema = z.strictObject({
  items: z.array(AuditAlertItemSchema).max(50),
  nextCursor: z.string().nullable(),
});
export const AuditAlertReadInputSchema = z.strictObject({
  teamId: z.string().min(1).max(255),
  alertId: z.uuid(),
});
export const AuditAlertAcknowledgeInputSchema = z.strictObject({
  teamId: z.string().min(1).max(255),
  deliveryId: z.uuid(),
});
