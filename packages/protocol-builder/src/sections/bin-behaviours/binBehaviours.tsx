import type { StageSection } from '../../editors/defineStageEditor.tsx';
import BinBehavioursSection from './BinBehavioursSection.tsx';

/** How the participant places nodes in the stage's bins. */
export const binBehaviours =
  (stageType: BinStageType): StageSection =>
  () => <BinBehavioursSection stageType={stageType} />;

export type BinStageType = 'OrdinalBin' | 'CategoricalBin';
