import { z } from 'zod';

import {
  IntroductionPanelSchema,
  TitlelessFormSchema,
} from '../common/index.ts';
import { withStageSubjectResolution } from '../stage-subject-resolution.ts';
import { baseStageSchema } from './base.ts';

// The only stage whose subject is fixed rather than authored: an ego form
// always collects against the interview's ego, so its form fields carry no
// `subject` to resolve against.
export const egoFormStage = withStageSubjectResolution(
  baseStageSchema.extend({
    type: z.literal('EgoForm'),
    form: TitlelessFormSchema,
    introductionPanel: IntroductionPanelSchema,
  }),
  { from: 'ego' },
);
