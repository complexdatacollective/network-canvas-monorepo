import type { StageSection } from '../../editors/defineStageEditor.tsx';
import SubjectSection, { type SubjectSectionProps } from './SubjectSection.tsx';

/** Which part of the network this stage is about. */
export const subjectPicker =
  (props: SubjectSectionProps): StageSection =>
  () => <SubjectSection {...props} />;
