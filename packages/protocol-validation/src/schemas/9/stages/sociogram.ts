import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { sociogramBehavioursSchema } from '../common/behaviours.ts';
import {
  imageOrCirclesBackgroundSchema,
  sociogramPromptSchema,
} from '../common/index.ts';
import { nodeStageSubjectFor } from '../common/subjects.ts';
import { FilterSchema } from '../filters/index.ts';
import { layoutReference } from '../layout-reference.ts';
import { baseStageSchema } from './base.ts';

export const sociogramStage = withUniqueObjectIds(
  baseStageSchema.extend({
    type: z.literal('Sociogram'),
    subject: nodeStageSubjectFor('Sociogram'),
    filter: FilterSchema.optional(),
    // The layout the stage places its nodes in: every prompt positions nodes
    // under this one id, whatever their type.
    layout: layoutReference(),
    background: imageOrCirclesBackgroundSchema,
    behaviours: sociogramBehavioursSchema,
    prompts: z.array(sociogramPromptSchema).min(1),
  }),
);
