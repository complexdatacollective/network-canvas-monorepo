import { z } from 'zod';

// `z.json()` is a self-referencing lazy schema, which the localized-string
// walker (`collectLocalizedStrings`) would unwrap forever. The value is
// checked through it instead, and the type states what that guarantees: a
// JSON object, assignable to a JSON column.
type JsonValue = z.infer<ReturnType<typeof z.json>>;
const jsonSchema = z.json();
const JsonObjectSchema = z.custom<Record<string, JsonValue>>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    jsonSchema.safeParse(value).success,
  'Expected a JSON object.',
);

/**
 * Features released within schema 9 that a protocol has to turn on. Each
 * experiment is an optional key, present when the protocol turns it on. The
 * object is strict so that an app refuses a protocol relying on an experiment
 * it does not implement; a new experiment is an optional key added here.
 *
 * What is inside an experiment is deliberately not defined by the schema. The
 * contents belong to the app that implements the experiment and may change
 * between versions of that app without a schema change, so the schema accepts
 * any JSON object and the app reads it defensively.
 */
export const ExperimentsSchema = z.strictObject({
  protocolReview: JsonObjectSchema.optional(),
});

export type Experiments = z.infer<typeof ExperimentsSchema>;
