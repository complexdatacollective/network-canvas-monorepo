import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';

import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection from './BuilderSection.tsx';

/** The schema holds this stage's one behaviour inside its own object. */
const FIELD = 'behaviours.removeAfterConsideration';

export type RemoveAfterConsiderationCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  removeLabel: string;
  keepLabel: string;
}>;

const DEFAULT_COPY: RemoveAfterConsiderationCopy = {
  sectionTitle: 'Node availability',
  description:
    'Decide what happens to a person once the participant has finished considering them.',
  fieldLabel: 'After a person has been considered',
  fieldHint:
    'Removing them keeps the remaining choices short. Keeping them lets the participant revisit an answer.',
  removeLabel: 'Remove them from the list',
  keepLabel: 'Keep them in the list',
};

export type RemoveAfterConsiderationSectionProps = Readonly<{
  copy?: Partial<RemoveAfterConsiderationCopy>;
}>;

/**
 * What becomes of a person the participant has already been asked about.
 *
 * Not a capability: the protocol schema requires an answer either way, so
 * there is nothing here to switch off — a One-to-Many Dyad Census that does
 * not say is a stage the schema refuses. Both answers are therefore offered
 * as choices rather than one being a switch with an implied default.
 *
 * Ported from Architect's `RemoveAfterConsideration`.
 */
export default function RemoveAfterConsiderationSection({
  copy,
}: RemoveAfterConsiderationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof BooleanField>
        name={FIELD}
        component={BooleanField}
        label={words.fieldLabel}
        hint={words.fieldHint}
        required
        options={[
          { value: true, label: words.removeLabel },
          { value: false, label: words.keepLabel },
        ]}
      />
    </BuilderSection>
  );
}
