import { z } from 'zod';

import { FormSchema } from '../common/index.ts';
import { withStageSubjectResolution } from '../stage-subject-resolution.ts';
import { baseStageSchema } from './base.ts';

// The only stage whose subject is fixed rather than authored: an ego form
// always collects against the interview's ego, so its form fields carry no
// `subject` to resolve against. Its form's title is the heading shown above
// the questions.
export const egoFormStage = withStageSubjectResolution(
  baseStageSchema.extend({
    type: z.literal('EgoForm'),
    form: FormSchema,
  }),
  { from: 'ego' },
);
