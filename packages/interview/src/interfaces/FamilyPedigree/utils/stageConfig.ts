import { createSelector } from '@reduxjs/toolkit';
import { invariant } from 'es-toolkit';

import { getCurrentStage } from '~/selectors/session';

export const getFramingConfig = createSelector(getCurrentStage, (stage) => {
  invariant(stage.type === 'FamilyPedigree', 'Stage must be FamilyPedigree');
  return stage.framing;
});

export const getIntroScreen = createSelector(getCurrentStage, (stage) => {
  invariant(stage.type === 'FamilyPedigree', 'Stage must be FamilyPedigree');
  return stage.introScreen ?? null;
});
