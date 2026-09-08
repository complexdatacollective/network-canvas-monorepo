import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import Validations from '~/components/Validations/Validations';
const messages = defineMessages({
  passphraseValidation: {
    id: 'architect.sections.anonymisation.anonymisationValidation.passphraseValidation',
    defaultMessage: 'Passphrase validation',
    description:
      'The title text in components / sections / Anonymisation / AnonymisationValidation.',
  },
  chooseWhichValidationRulesApplyTo: {
    id: 'architect.sections.anonymisation.anonymisationValidation.chooseWhichValidationRulesApplyTo',
    defaultMessage: 'Choose which validation rules apply to the passphrase.',
    description:
      'The description text in components / sections / Anonymisation / AnonymisationValidation.',
  },
});

type ValidationValue = boolean | number | string | null;
type ValidationMap = Record<string, ValidationValue>;

const hasEntries = (value: ValidationMap | undefined): boolean =>
  !!value && Object.keys(value).length > 0;

const AnonymisationValidation = ({
  stagePath,
  interfaceType,
}: StageEditorSectionProps) => {
  const intl = useAppIntl();
  // The Field's own `initialValue` is registration-time only and must not
  // track live edits, or every keystroke would re-register the field. Before
  // the field has ever registered, the committed value chooses the toggle's
  // initial state. Once it is known to the form, its live value wins even
  // when that value is the `undefined` tombstone written by close/redo.
  const initialValidation = useStageInitialValue<ValidationMap>('validation');
  const liveValidation = useStageFormValue<ValidationMap>('validation');
  const hasValidationField = useFormStore(
    (store) => store.getFieldState('validation') !== undefined,
  );
  const hasValidation = hasValidationField
    ? hasEntries(liveValidation)
    : hasEntries(initialValidation);
  return (
    <Section
      toggleable
      title={intl.formatMessage(messages.passphraseValidation)}
      description={intl.formatMessage(
        messages.chooseWhichValidationRulesApplyTo,
      )}
      defaultOpen={hasValidation}
    >
      <Validations
        name="validation"
        initialValue={initialValidation}
        variableType="passphrase"
        entity="ego"
        // The stage editor reinitializes in place when the edited stage
        // changes, and keeps same-interface sections mounted — so without
        // stage identity the rule list would carry one passphrase's
        // uncommitted rows onto the next stage's saved rules. `stagePath` is
        // the edited stage's own slot, and is null only before it exists.
        scopeId={stagePath ?? `new-${interfaceType}`}
      />
    </Section>
  );
};
export default AnonymisationValidation;
