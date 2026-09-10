import type { StageSection } from '../../editors/defineStageEditor.tsx';
import BackgroundSection, {
  type BackgroundSectionProps,
} from './BackgroundSection.tsx';

/** What the participant sees behind the nodes on the canvas. */
export const background =
  (props: BackgroundSectionProps = {}): StageSection =>
  () => <BackgroundSection {...props} />;
