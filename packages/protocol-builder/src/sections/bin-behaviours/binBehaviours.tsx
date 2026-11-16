import type { StageSection } from '../../editors/defineStageEditor.tsx';
import BinBehavioursSection from './BinBehavioursSection.tsx';
import BinWordingSection from './BinWordingSection.tsx';

/** How the participant places nodes in the stage's bins. */
export const binBehaviours = (): StageSection => () => <BinBehavioursSection />;

/** The words a bin stage shows, in its "Customize built-in wording" section. */
export const binWording =
  (stageType: BinStageType): StageSection =>
  () => <BinWordingSection stageType={stageType} />;

export type BinStageType = 'OrdinalBin' | 'CategoricalBin';
