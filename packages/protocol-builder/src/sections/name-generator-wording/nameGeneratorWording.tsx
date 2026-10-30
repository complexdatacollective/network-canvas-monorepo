import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { CustomFieldValidation } from '@codaco/fresco-ui/form/store/types';
import { NODE_COUNT_ARGUMENTS } from '@codaco/protocol-validation';

import type { StageSection } from '../../editors/defineStageEditor.tsx';
import LocalizedMessageField, {
  localizedMessageValidation,
} from '../../fields/LocalizedMessageField.tsx';
import { LocalizedInputField } from '../../fields/LocalizedStringField.tsx';
import { REQUIRED } from '../../form/requiredField.ts';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import StageWordingSection from '../supplied-wording/StageWordingSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../supplied-wording/suppliedStageWording.ts';

type NameGeneratorType =
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster';

export const nameGeneratorWordingMessages = defineMessages({
  minNoticeLabel: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeLabel',
    defaultMessage: 'Minimum not reached',
    description:
      'Label of the field holding the message shown when the participant tries to continue having named fewer people than the stage’s minimum.',
  },
  minNoticeHint: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeHint',
    defaultMessage:
      'Shown when the participant tries to continue before adding as many nodes as this stage asks for.',
    description:
      'Hint under the setting holding the minimum not reached message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  maxNoticeLabel: {
    id: 'protocolBuilder.nameGeneratorWording.maxNoticeLabel',
    defaultMessage: 'Maximum reached',
    description:
      'Label of the field holding the message shown once the participant has named the most people this stage allows.',
  },
  maxNoticeHint: {
    id: 'protocolBuilder.nameGeneratorWording.maxNoticeHint',
    defaultMessage:
      'Shown once the participant has added as many nodes as this stage allows.',
    description:
      'Hint under the setting holding the maximum reached message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  quickAddHintLabel: {
    id: 'protocolBuilder.nameGeneratorWording.quickAddHintLabel',
    defaultMessage: 'Quick-add hint',
    description:
      'Label of the field holding the line shown beside the quick-add name field, telling the participant how to finish.',
  },
  quickAddHintHint: {
    id: 'protocolBuilder.nameGeneratorWording.quickAddHintHint',
    defaultMessage:
      'Shown beside the quick-add box, telling the participant how to finish adding a node.',
    description:
      'Hint under the setting holding the quick-add hint, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
  allAddedLabel: {
    id: 'protocolBuilder.nameGeneratorWording.allAddedLabel',
    defaultMessage: 'Everything added',
    description:
      'Label of the field holding the message shown when every person on a roster has already been added.',
  },
  allAddedHint: {
    id: 'protocolBuilder.nameGeneratorWording.allAddedHint',
    defaultMessage:
      'Shown in the roster list once everything in it has been added.',
    description:
      'Hint under the setting holding the everything added message, in the Customize built-in wording section of a Name Generator stage editor. It tells the researcher where the participant sees this text and what it is for.',
  },
});

/** Where a stage holds each setting, which the form names by path. */
const MIN_NODES = 'behaviours.minNodes';
const MAX_NODES = 'behaviours.maxNodes';

/**
 * The words a name generator shows about its limits, its quick-add field and
 * a roster's list. Each appears only where its part of the stage is on, and
 * each starts as Network Canvas's wording. The words a roster's search and a
 * list from a data file show are the protocol's interface text.
 */
export const nameGeneratorWording =
  (stageType: NameGeneratorType): StageSection =>
  () => <NameGeneratorWordingSection stageType={stageType} />;

function NameGeneratorWordingSection({
  stageType,
}: Readonly<{ stageType: NameGeneratorType }>) {
  const intl = useAppIntl();
  const { committedFields } = useStageEditorForm();
  const supplied = useSuppliedStageWording(stageType);
  const minNodes = useStageValue(MIN_NODES);
  const maxNodes = useStageValue(MAX_NODES);

  const minValidation = useMemo<CustomFieldValidation>(
    () => localizedMessageValidation(NODE_COUNT_ARGUMENTS, intl),
    [intl],
  );

  const hasMinimum = typeof minNodes === 'number' && minNodes > 0;
  const hasMaximum = typeof maxNodes === 'number';

  const paths = [
    ...(hasMinimum ? ['minNodesNotice'] : []),
    ...(hasMaximum ? ['maxNodesNotice'] : []),
    ...(stageType === 'NameGeneratorQuickAdd' ? ['quickAddHint'] : []),
    ...(stageType === 'NameGeneratorRoster' ? ['allAddedNotice'] : []),
  ];

  return (
    <StageWordingSection stageType={stageType} paths={paths}>
      {supplied !== undefined && (
        <>
          {hasMinimum && (
            <Field<typeof LocalizedMessageField>
              name="minNodesNotice"
              component={LocalizedMessageField}
              label={intl.formatMessage(
                nameGeneratorWordingMessages.minNoticeLabel,
              )}
              hint={intl.formatMessage(
                nameGeneratorWordingMessages.minNoticeHint,
              )}
              arguments={NODE_COUNT_ARGUMENTS}
              initialValue={startingWording(
                committedFields,
                'minNodesNotice',
                supplied,
              )}
              required={REQUIRED}
              custom={minValidation}
            />
          )}
          {hasMaximum && (
            <Field<typeof LocalizedInputField>
              name="maxNodesNotice"
              component={LocalizedInputField}
              wraps
              label={intl.formatMessage(
                nameGeneratorWordingMessages.maxNoticeLabel,
              )}
              hint={intl.formatMessage(
                nameGeneratorWordingMessages.maxNoticeHint,
              )}
              initialValue={startingWording(
                committedFields,
                'maxNodesNotice',
                supplied,
              )}
              required={REQUIRED}
            />
          )}
          {stageType === 'NameGeneratorQuickAdd' && (
            <Field<typeof LocalizedInputField>
              name="quickAddHint"
              component={LocalizedInputField}
              wraps
              label={intl.formatMessage(
                nameGeneratorWordingMessages.quickAddHintLabel,
              )}
              hint={intl.formatMessage(
                nameGeneratorWordingMessages.quickAddHintHint,
              )}
              initialValue={startingWording(
                committedFields,
                'quickAddHint',
                supplied,
              )}
              required={REQUIRED}
            />
          )}
          {stageType === 'NameGeneratorRoster' && (
            <Field<typeof LocalizedInputField>
              name="allAddedNotice"
              component={LocalizedInputField}
              wraps
              label={intl.formatMessage(
                nameGeneratorWordingMessages.allAddedLabel,
              )}
              hint={intl.formatMessage(
                nameGeneratorWordingMessages.allAddedHint,
              )}
              initialValue={startingWording(
                committedFields,
                'allAddedNotice',
                supplied,
              )}
              required={REQUIRED}
            />
          )}
        </>
      )}
    </StageWordingSection>
  );
}
