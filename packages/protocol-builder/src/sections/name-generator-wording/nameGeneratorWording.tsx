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
import BuilderSection from '../BuilderSection.tsx';
import {
  startingWording,
  useSuppliedStageWording,
} from '../supplied-wording/suppliedStageWording.ts';

type NameGeneratorType =
  | 'NameGenerator'
  | 'NameGeneratorQuickAdd'
  | 'NameGeneratorRoster';

export const nameGeneratorWordingMessages = defineMessages({
  title: {
    id: 'protocolBuilder.nameGeneratorWording.title',
    defaultMessage: 'Messages',
    description:
      'Heading of the section holding the words a name generator shows a participant about its limits, its side panels, its search and its quick-add field. A name generator is a stage that asks the participant to name people.',
  },
  description: {
    id: 'protocolBuilder.nameGeneratorWording.description',
    defaultMessage:
      'These start with wording Network Canvas supplies, which you can change. Each one appears only where its limit, panel or field is part of this stage.',
    description:
      'Description of the messages section of a name generator. Each message starts with wording Network Canvas supplies in each of the protocol’s languages that it has.',
  },
  minNoticeLabel: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeLabel',
    defaultMessage: 'Minimum not reached',
    description:
      'Label of the field holding the message shown when the participant tries to continue having named fewer people than the stage’s minimum.',
  },
  minNoticeHint: {
    id: 'protocolBuilder.nameGeneratorWording.minNoticeHint',
    defaultMessage:
      'Shown when the participant tries to continue before naming the fewest people this stage asks for.',
    description:
      'Guidance under the field holding the message shown when the participant has not yet named the stage’s minimum number of people.',
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
      'Shown once the participant has named the most people this stage allows.',
    description:
      'Guidance under the field holding the message shown when the stage’s maximum number of people has been named.',
  },
  externalErrorLabel: {
    id: 'protocolBuilder.nameGeneratorWording.externalErrorLabel',
    defaultMessage: 'Data could not be loaded',
    description:
      'Label of the field holding the message shown when a list of people from a data file could not be loaded.',
  },
  externalErrorHint: {
    id: 'protocolBuilder.nameGeneratorWording.externalErrorHint',
    defaultMessage:
      'Shown in place of a list of people from a data file when that file could not be loaded.',
    description:
      'Guidance under the field holding the message shown in place of a list of people from a data file that could not be loaded.',
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
      'Shown beside the name field, saying how to finish adding a person.',
    description:
      'Guidance under the field holding the line shown beside the quick-add name field.',
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
      'Shown in the list of people to add when there is nothing left to add from it.',
    description:
      'Guidance under the field holding the message shown when there is nothing left to add from a roster.',
  },
  searchLabelLabel: {
    id: 'protocolBuilder.nameGeneratorWording.searchLabelLabel',
    defaultMessage: 'Search label',
    description:
      'Label of the field holding the search box’s placeholder, which a screen reader also reads out.',
  },
  searchLabelHint: {
    id: 'protocolBuilder.nameGeneratorWording.searchLabelHint',
    defaultMessage: 'The placeholder shown in the search box.',
    description:
      'Guidance under the field holding the search box’s placeholder.',
  },
  searchNoMatchLabel: {
    id: 'protocolBuilder.nameGeneratorWording.searchNoMatchLabel',
    defaultMessage: 'No search results',
    description:
      'Label of the field holding the message shown when a search matches nothing.',
  },
  searchNoMatchHint: {
    id: 'protocolBuilder.nameGeneratorWording.searchNoMatchHint',
    defaultMessage: 'Shown when a search matches nothing.',
    description: 'Guidance under the field holding the no-match message.',
  },
});

/** Where a stage holds each setting, which the form names by path. */
const MIN_NODES = 'behaviours.minNodes';
const MAX_NODES = 'behaviours.maxNodes';
const SEARCH_OPTIONS = 'searchOptions';

const isExternalPanel = (panel: unknown): boolean =>
  typeof panel === 'object' &&
  panel !== null &&
  Reflect.get(panel, 'dataSource') !== undefined &&
  Reflect.get(panel, 'dataSource') !== 'existing';

/**
 * The words a name generator shows about its limits, its side panels, its
 * quick-add field, and a roster's list and search. Each appears only where its
 * part of the stage is on, and each starts as Network Canvas's wording.
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
  const panels = useStageValue('panels');
  const searchOptions = useStageValue(SEARCH_OPTIONS);

  const minValidation = useMemo<CustomFieldValidation>(
    () => localizedMessageValidation(NODE_COUNT_ARGUMENTS, intl),
    [intl],
  );

  // A roster always reads its people from a data file; a name generator
  // reads them only from a side panel that has one.
  const readsExternalData =
    stageType === 'NameGeneratorRoster' ||
    (Array.isArray(panels) && panels.some(isExternalPanel));
  const hasMinimum = typeof minNodes === 'number' && minNodes > 0;
  const hasMaximum = typeof maxNodes === 'number';
  const hasSearch = searchOptions !== undefined;

  return (
    <BuilderSection
      title={intl.formatMessage(nameGeneratorWordingMessages.title)}
      description={intl.formatMessage(nameGeneratorWordingMessages.description)}
    >
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
          {readsExternalData && (
            <Field<typeof LocalizedInputField>
              name="externalDataError"
              component={LocalizedInputField}
              label={intl.formatMessage(
                nameGeneratorWordingMessages.externalErrorLabel,
              )}
              hint={intl.formatMessage(
                nameGeneratorWordingMessages.externalErrorHint,
              )}
              initialValue={startingWording(
                committedFields,
                'externalDataError',
                supplied,
              )}
              required={REQUIRED}
            />
          )}
          {stageType === 'NameGeneratorQuickAdd' && (
            <Field<typeof LocalizedInputField>
              name="quickAddHint"
              component={LocalizedInputField}
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
          {hasSearch && (
            <>
              <Field<typeof LocalizedInputField>
                name="searchLabel"
                component={LocalizedInputField}
                label={intl.formatMessage(
                  nameGeneratorWordingMessages.searchLabelLabel,
                )}
                hint={intl.formatMessage(
                  nameGeneratorWordingMessages.searchLabelHint,
                )}
                initialValue={startingWording(
                  committedFields,
                  'searchLabel',
                  supplied,
                )}
                required={REQUIRED}
              />
              <Field<typeof LocalizedInputField>
                name="searchNoMatch"
                component={LocalizedInputField}
                label={intl.formatMessage(
                  nameGeneratorWordingMessages.searchNoMatchLabel,
                )}
                hint={intl.formatMessage(
                  nameGeneratorWordingMessages.searchNoMatchHint,
                )}
                initialValue={startingWording(
                  committedFields,
                  'searchNoMatch',
                  supplied,
                )}
                required={REQUIRED}
              />
            </>
          )}
        </>
      )}
    </BuilderSection>
  );
}
