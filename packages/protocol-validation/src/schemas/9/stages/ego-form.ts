import { z } from 'zod';

import { withUniqueObjectIds } from '../../../utils/protocolObjectIds.ts';
import { TitlelessFormSchema } from '../common/index.ts';
import { withStageSubjectResolution } from '../stage-subject-resolution.ts';
import { baseStageSchema } from './base.ts';

// The only stage whose subject is fixed rather than authored: an ego form
// always collects against the interview's ego, so its form fields carry no
// `subject` to resolve against. Any heading or introduction is part of the
// form's text, so the form has no title.
export const egoFormStage = withStageSubjectResolution(
  withUniqueObjectIds(
    baseStageSchema.extend({
      type: z.literal('EgoForm'),
      form: TitlelessFormSchema,
    }),
  ),
  { from: 'ego' },
);
