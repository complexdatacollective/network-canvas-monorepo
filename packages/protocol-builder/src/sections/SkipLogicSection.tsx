import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';

import SkipLogicDestinationField from '../fields/SkipLogicDestinationField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import { QueryRuleSetField } from '../rules/RuleSetField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';

/**
 * What this host calls a stage.
 *
 * Architect says "stage"; Studio says "screen". Each string is whole rather
 * than assembled from a noun and a frame, so a host can say the thing its
 * researchers already read everywhere else in it. Only the strings that name a
 * stage are overridable — the rest describe rules and actions, which are
 * called the same thing in every host.
 */
export type SkipLogicCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  showLabel: string;
  skipLabel: string;
  destinationLabel: string;
  destinationHint: string;
}>;

const DEFAULT_COPY: SkipLogicCopy = {
  sectionTitle: 'Skip logic',
  description:
    'Determine whether this stage is shown, and where the interview continues when it is skipped.',
  showLabel: 'Show this stage',
  skipLabel: 'Skip this stage',
  destinationLabel: 'When this stage is skipped',
  destinationHint:
    'Choose where the interview should continue. Only later stages can be selected.',
};

/**
 * Skip logic is one value of the stage with three parts, and it is all or
 * nothing: the protocol schema requires an action and a rule set together, so
 * a stage cannot hold half of it. Switching the capability off therefore
 * removes all three, leaving `skipLogic` absent rather than an object with
 * pieces missing.
 */
const SKIP_LOGIC_CAPABILITY: SectionCapability = {
  fields: ['skipLogic.action', 'skipLogic.filter', 'skipLogic.destination'],
  confirmClear: {
    title: 'This will clear your skip logic',
    description:
      'This will clear your skip logic, and delete any rules you have created. Do you want to continue?',
    confirmLabel: 'Clear skip logic',
  },
};

export type SkipLogicSectionProps = Readonly<{
  /**
   * Where a stage being created will be inserted, counting from zero.
   *
   * Only a stage the interview does not contain yet needs this: an existing
   * stage's position is read from the stage order. It decides which stages are
   * later than this one, and so which of them the interview may continue at.
   */
  position?: number;
  copy?: Partial<SkipLogicCopy>;
}>;

/**
 * Whether this stage runs, and what happens when it does not.
 *
 * One of the three sections every stage editor composes, and the only one that
 * is a capability: a stage without skip logic always runs, which is what most
 * stages do, so the researcher switches it on to say otherwise.
 *
 * The rules and the destination both read the protocol — the codebook for what
 * a rule can ask about, the stage order for where the interview may continue —
 * through the editor's own context. Nothing here takes a stage path, a
 * selector, or a host store.
 */
export default function SkipLogicSection({
  position,
  copy,
}: SkipLogicSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={words.description}
      capability={SKIP_LOGIC_CAPABILITY}
    >
      <ProtocolField<typeof RadioGroupField>
        name="skipLogic.action"
        label="Action"
        hint="What should happen when the rules match?"
        component={RadioGroupField}
        options={[
          { value: 'SHOW', label: words.showLabel },
          { value: 'SKIP', label: words.skipLabel },
        ]}
        required
      />
      <ProtocolField<typeof QueryRuleSetField>
        name="skipLogic.filter"
        label="Rules"
        hint="Create one or more rules to determine when the action should occur."
        component={QueryRuleSetField}
        required
      />
      <ProtocolField<typeof SkipLogicDestinationField>
        name="skipLogic.destination"
        label={words.destinationLabel}
        hint={words.destinationHint}
        component={SkipLogicDestinationField}
        position={position}
      />
    </BuilderSection>
  );
}
