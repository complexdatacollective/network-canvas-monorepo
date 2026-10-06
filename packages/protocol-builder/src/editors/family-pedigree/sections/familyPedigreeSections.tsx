import type { StageSection } from '../../defineStageEditor.tsx';
import CompletenessSection from './CompletenessSection.tsx';
import NodeConfigurationSection from './NodeConfigurationSection.tsx';
import PedigreePromptSection from './PedigreePromptSection.tsx';
import PersonFormFieldsSection from './PersonFormFieldsSection.tsx';
import RelationshipsSection from './RelationshipsSection.tsx';

/** The attributes the interface records about every family member. */
export const nodeConfiguration = (): StageSection => () => (
  <NodeConfigurationSection />
);

/** How relationships between family members are recorded. */
export const relationships = (): StageSection => () => <RelationshipsSection />;

/** The instruction shown on the canvas. */
export const pedigreePrompt = (): StageSection => () => (
  <PedigreePromptSection />
);

/** The researcher's own questions about each family member. */
export const personFormFields = (): StageSection => () => (
  <PersonFormFieldsSection />
);

/** How much of the family the participant must record before continuing. */
export const completeness = (): StageSection => () => <CompletenessSection />;
