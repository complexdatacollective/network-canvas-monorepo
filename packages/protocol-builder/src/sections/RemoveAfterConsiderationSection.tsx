import BooleanField from '@codaco/fresco-ui/form/fields/Boolean';

import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection from './BuilderSection.tsx';

/** The schema holds this stage's one behaviour inside its own object. */
const FIELD = 'behaviours.removeAfterConsideration';

/**
 * The section's own words.
 *
 * Held here rather than offered to a caller: a host override seam takes plain
 * strings, which `extractMessages` cannot see, and the package refuses one
 * (`src/__tests__/hostCopyOverrides.test.ts`). Nothing ever passed one either.
 * Still English literals, because this section is one of family E's yet to be
 * converted — see the `removeAfterConsideration` row in `src/locales/ID_MAP.md`.
 */
const WORDS = Object.freeze({
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: 'Node availability',
  description:
    'Decide what happens to a person once the participant has finished considering them.',
  fieldLabel: 'After a person has been considered',
  fieldHint:
    'Removing them keeps the remaining choices short. Keeping them lets the participant revisit an answer.',
  removeLabel: 'Remove them from the list',
  keepLabel: 'Keep them in the list',
});

/**
 * What becomes of a person the participant has already been asked about.
 *
 * Not a capability: the protocol schema requires an answer either way, so
 * there is nothing here to switch off — a One-to-Many Dyad Census that does
 * not say is a stage the schema refuses. Both answers are therefore offered
 * as choices rather than one being a switch with an implied default.
 *
 * Ported from Architect's `RemoveAfterConsideration`. Where it sits in the
 * editor is the one thing that differs, and the editor that mounts it says
 * why: Architect lists this section before the prompts, and
 * `OneToManyDyadCensusStageEditor` deliberately puts it after them.
 */
export default function RemoveAfterConsiderationSection() {
  return (
    <BuilderSection title={WORDS.sectionTitle} description={WORDS.description}>
      <ProtocolField<typeof BooleanField>
        name={FIELD}
        component={BooleanField}
        label={WORDS.fieldLabel}
        hint={WORDS.fieldHint}
        required
        options={[
          { value: true, label: WORDS.removeLabel },
          { value: false, label: WORDS.keepLabel },
        ]}
      />
    </BuilderSection>
  );
}
