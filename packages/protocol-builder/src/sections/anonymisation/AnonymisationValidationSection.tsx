import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from '../BuilderSection.tsx';
import { anonymisationMessages } from './anonymisationMessages.ts';
import PassphraseRulesControl, {
  passphraseRulesIssue,
} from './PassphraseRulesControl.tsx';

/** The schema keeps the passphrase rules under one optional key. */
const VALIDATION_FIELD = 'validation';

const rulesValidation = {
  custom: messageRuleValidation([passphraseRulesIssue]),
};

export type AnonymisationValidationCopy = Readonly<{
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  /**
   * Descriptors, because `BuilderSection` renders them: the warning a
   * researcher reads before losing the rules must be translated like every
   * other sentence on the stage.
   */
  confirmClearTitle: MessageDescriptor;
  confirmClearDescription: MessageDescriptor;
  confirmClearLabel: MessageDescriptor;
}>;

const DEFAULT_COPY: AnonymisationValidationCopy = {
  sectionTitle: 'Passphrase rules',
  description:
    'Require the passphrase to be a certain length. Without any rules, a participant may choose anything.',
  fieldLabel: 'Passphrase rules',
  fieldHint:
    'A longer passphrase is harder to guess and harder to remember. A participant who forgets it cannot recover the answers it protects.',
  confirmClearTitle: anonymisationMessages.passphraseRulesClearTitle,
  confirmClearDescription:
    anonymisationMessages.passphraseRulesClearDescription,
  confirmClearLabel: anonymisationMessages.passphraseRulesClearConfirm,
};

export type AnonymisationValidationSectionProps = Readonly<{
  copy?: Partial<AnonymisationValidationCopy>;
}>;

/**
 * Whether the passphrase has to meet any requirements.
 *
 * A capability, because the schema's own answer to "no rules" is that the key
 * is not there: a stage may perfectly well let a participant choose whatever
 * they like. Switching it off therefore throws the rules away rather than
 * remembering them, and says so first.
 */
export default function AnonymisationValidationSection({
  copy,
}: AnonymisationValidationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const capability: SectionCapability = {
    fields: [VALIDATION_FIELD],
    confirmClear: {
      title: words.confirmClearTitle,
      description: words.confirmClearDescription,
      confirmLabel: words.confirmClearLabel,
    },
  };

  return (
    <BuilderSection
      title={words.sectionTitle}
      description={words.description}
      capability={capability}
    >
      <ProtocolField<typeof PassphraseRulesControl>
        name={VALIDATION_FIELD}
        component={PassphraseRulesControl}
        label={words.fieldLabel}
        hint={words.fieldHint}
        {...rulesValidation}
      />
    </BuilderSection>
  );
}
