import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import {
  type MessageArguments,
  SNAPSHOT_CONDITION_ARGUMENTS,
  SNAPSHOT_INHERITANCE_ARGUMENTS,
  suppliedStageSettingApplies,
} from '@codaco/protocol-validation';

import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../../fields/LocalizedMessageField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import {
  startingWording,
  useSuppliedStageWording,
} from '../../../form/suppliedStageWording.ts';
import { WordingRow, type WordingSetting } from '../../../form/WordingRow.tsx';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { narrativePedigreeMessages as messages } from './narrativePedigreeMessages.ts';

const STAGE_TYPE = 'NarrativePedigree';

/** The words that are not messages with placeholders: each is plain text. */
const TEXT: readonly WordingSetting[] = [
  { path: 'keyHeading', label: messages.keyHeadingLabel },
  { path: 'tooltips.clearFocus', label: messages.clearFocusTooltipLabel },
  { path: 'tooltips.saveSnapshot', label: messages.saveSnapshotTooltipLabel },
  { path: 'conditionText.heading', label: messages.conditionHeadingLabel },
  {
    path: 'conditionText.instruction',
    label: messages.conditionInstructionLabel,
  },
  {
    path: 'conditionText.notation.affected',
    label: messages.affectedNotationLabel,
  },
  {
    path: 'conditionText.notation.obligateAffected',
    label: messages.obligateAffectedNotationLabel,
  },
  {
    path: 'conditionText.notation.obligateCarrier',
    label: messages.obligateCarrierNotationLabel,
  },
  {
    path: 'conditionText.notation.atRiskAffected',
    label: messages.atRiskAffectedNotationLabel,
    hint: messages.atRiskHint,
  },
  {
    path: 'conditionText.notation.atRiskCarrier',
    label: messages.atRiskCarrierNotationLabel,
    hint: messages.atRiskHint,
  },
  {
    path: 'conditionText.notation.unknown',
    label: messages.unknownNotationLabel,
  },
];

/** The snapshot titles, which are messages that fill in the pedigree's own names. */
const SNAPSHOT_TITLES = [
  {
    path: 'conditionText.snapshotCondition',
    label: messages.snapshotConditionLabel,
    hint: messages.snapshotConditionHint,
    arguments: SNAPSHOT_CONDITION_ARGUMENTS,
  },
  {
    path: 'conditionText.snapshotInheritance',
    label: messages.snapshotInheritanceLabel,
    hint: messages.snapshotInheritanceHint,
    arguments: SNAPSHOT_INHERITANCE_ARGUMENTS,
  },
] as const;

/**
 * The words a participant reads on the pedigree. The at-risk entries of the
 * key are asked only while the pedigree shows at-risk statuses, the same
 * configuration that makes the protocol require them. Each starts with Network
 * Canvas's wording.
 */
export default function WordingSection() {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(STAGE_TYPE);
  const stage = {
    type: STAGE_TYPE,
    showAtRiskStatuses: useStageValue('showAtRiskStatuses'),
  };

  const validations = useMemo(
    () =>
      new Map<MessageArguments, CustomFieldValidation>(
        [SNAPSHOT_CONDITION_ARGUMENTS, SNAPSHOT_INHERITANCE_ARGUMENTS].map(
          (declaration) => [
            declaration,
            localizedMessageValidation(declaration, intl),
          ],
        ),
      ),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.wordingTitle)}
      description={intl.formatMessage(messages.wordingDescription)}
    >
      {supplied !== undefined && (
        <>
          {TEXT.filter((setting) =>
            suppliedStageSettingApplies(stage, setting.path.split('.')),
          ).map((setting) => (
            <WordingRow
              key={setting.path}
              setting={setting}
              initialValue={startingWording(
                committedFields,
                setting.path,
                supplied,
              )}
            />
          ))}
          {SNAPSHOT_TITLES.map((title) => (
            <Field<typeof LocalizedMessageField>
              key={title.path}
              name={title.path}
              component={LocalizedMessageField}
              label={intl.formatMessage(title.label)}
              hint={intl.formatMessage(title.hint)}
              arguments={title.arguments}
              initialValue={startingWording(
                committedFields,
                title.path,
                supplied,
              )}
              required={REQUIRED}
              custom={validations.get(title.arguments)}
            />
          ))}
        </>
      )}
    </BuilderSection>
  );
}
