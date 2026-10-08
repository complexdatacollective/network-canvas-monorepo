import type { StageSection } from '../../defineStageEditor.tsx';
import CompletenessSection from './CompletenessSection.tsx';
import FramingSection from './FramingSection.tsx';
import NodeConfigurationSection from './NodeConfigurationSection.tsx';
import NominationPromptsSection from './NominationPromptsSection.tsx';
import PedigreePromptSection from './PedigreePromptSection.tsx';
import PedigreeSubjectSection from './PedigreeSubjectSection.tsx';
import PersonFormFieldsSection from './PersonFormFieldsSection.tsx';
import RelationshipsSection from './RelationshipsSection.tsx';

/**
 * The node type family members are, which is not changed while a narrative
 * pedigree reads this stage.
 */
export const pedigreeSubject = (): StageSection => () => (
  <PedigreeSubjectSection />
);

/**
 * The attributes the interface records about every family member, including
 * whether gender identity is asked and the kinship words each option takes.
 */
export const nodeConfiguration = (): StageSection => () => (
  <NodeConfigurationSection />
);

/** How relationships between family members are recorded. */
export const relationships = (): StageSection => () => <RelationshipsSection />;

/** The words used to describe family members. */
export const framing = (): StageSection => () => <FramingSection />;

/** The questions asked of the whole family once it is drawn. */
export const nominationPrompts = (): StageSection => () => (
  <NominationPromptsSection />
);

/** The instruction shown while the participant draws their family. */
export const pedigreePrompt = (): StageSection => () => (
  <PedigreePromptSection />
);

/** The researcher's own questions about each family member. */
export const personFormFields = (): StageSection => () => (
  <PersonFormFieldsSection />
);

/** How much of the family the participant must record before continuing. */
export const completeness = (): StageSection => () => <CompletenessSection />;
