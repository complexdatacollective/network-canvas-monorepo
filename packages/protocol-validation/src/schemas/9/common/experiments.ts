import { z } from 'zod';

/**
 * Features released within schema 9 that a protocol has to turn on. None is
 * defined yet. The object is strict so that an app refuses a protocol relying
 * on an experiment it does not implement; a new experiment is an optional key
 * added here.
 */
export const ExperimentsSchema = z.strictObject({});

export type Experiments = z.infer<typeof ExperimentsSchema>;
