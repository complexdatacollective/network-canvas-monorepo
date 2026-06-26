import { faker } from '@faker-js/faker';

import { getNodeVariableId } from '~/utils/mock-seeds';
import { z } from '~/utils/zod-mock-extension';

const directions = ['asc', 'desc'] as const;

export const SortRuleSchema = z
  .strictObject({
    // A sort key: a roster data-source column, a magic sort key (e.g. '*'), or
    // a codebook variable depending on the stage. Not a guaranteed codebook
    // reference, so it is not existence-validated as one.
    property: z.string(),
    direction: z.enum(['asc', 'desc']),
  })
  .generateMock(() => ({
    property: getNodeVariableId(),
    direction: faker.helpers.arrayElement(directions),
  }));

export type SortRule = z.infer<typeof SortRuleSchema>;

export const SortOrderSchema = z.array(SortRuleSchema);

export type SortOrder = z.infer<typeof SortOrderSchema>;
