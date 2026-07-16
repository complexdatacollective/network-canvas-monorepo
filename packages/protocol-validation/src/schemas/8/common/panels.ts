import { z } from 'zod';

import { FilterSchema } from '../filters';

export const panelSchema = z.strictObject({
  id: z.string(),
  title: z.string().min(1),
  filter: FilterSchema.optional(),
  dataSource: z.union([z.string(), z.literal('existing')]),
});

export type Panel = z.infer<typeof panelSchema>;
