import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import { getSortOrderOptionGetter } from '../CategoricalBinPrompts/optionGetters';
import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';
const messages = defineMessages({
  promptConfiguration: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.promptConfiguration',
    defaultMessage: 'Prompt configuration',
    description:
      'The title text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  writeTheParticipantPromptAndSelect: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.writeTheParticipantPromptAndSelect',
    defaultMessage:
      'Write the participant prompt and select the edge type created for chosen nodes.',
    description:
      'The description text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  rememberToWriteYourPromptText: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.rememberToWriteYourPromptText',
    defaultMessage:
      "Remember to write your prompt text so that it clearly indicates the participant is evaluating the relationship between one specific individual and each of the others shown. Use phrases such as ' <strong>which of the following people</strong> ', or ' <strong2>select all people with whom this person</strong2> ' to indicate that the participant should focus on selecting from the group.",
    description:
      'Visible text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  promptText: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.promptText',
    defaultMessage: 'Prompt text',
    description:
      'The label text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  enterTextForThePromptHere: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.enterTextForThePromptHere',
    defaultMessage: 'Enter text for the prompt here...',
    description:
      'The placeholder text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  createdEdgeType: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.createdEdgeType',
    defaultMessage: 'Created edge type',
    description:
      'The label text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  orderFocalNodesBeforeTheyAre: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.orderFocalNodesBeforeTheyAre',
    defaultMessage:
      'Order focal nodes before they are presented for evaluation.',
    description:
      'The description text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
  orderTargetNodesAfterTheyAre: {
    id: 'architect.sections.oneToManyDyadCensus.promptFields.orderTargetNodesAfterTheyAre',
    defaultMessage: 'Order target nodes after they are placed in the bin.',
    description:
      'The description text in components / sections / OneToManyDyadCensus / PromptFields.',
  },
});

type SelectOption = {
  label: string;
  value: string;
  type?: string;
};

type SortOrderRow = Record<string, unknown>;

const EMPTY_OPTIONS: SelectOption[] = [];

type PromptFieldsProps = {
  entity?: 'node' | 'edge' | 'ego' | null;
  type?: string | null;
  text?: string;
  createEdge?: string;
  bucketSortOrder?: SortOrderRow[];
  binSortOrder?: SortOrderRow[];
};

const PromptFields = ({
  entity = null,
  type = null,
  text,
  createEdge,
  bucketSortOrder,
  binSortOrder,
}: PromptFieldsProps) => {
  const intl = useAppIntl();
  // This stage writes no attribute at all, so it needs the codebook pool
  // purely for sort options — and sort keys are read-only references outside
  // the writer-exclusivity rule, so they draw from the RAW pool (never a
  // role-filtered writer pool).
  const subject = useMemo(
    () => (entity ? { entity, type: type ?? undefined } : null),
    [entity, type],
  );
  const sortVariableOptions = useSelector(
    (state: RootState) =>
      subject
        ? (getVariableOptionsForSubject(state, subject) as SelectOption[])
        : EMPTY_OPTIONS,
    shallowEqual,
  );

  const { createEdge: liveCreateEdge } = useFormValue(['createEdge'] as const);
  const currentCreateEdge =
    typeof liveCreateEdge === 'string' ? liveCreateEdge : createEdge;

  const getOptions = getSortOrderOptionGetter(sortVariableOptions, intl);
  const sortMaxItems = getOptions('property', undefined, []).length;

  return (
    <>
      <Section
        title={intl.formatMessage(messages.promptConfiguration)}
        description={intl.formatMessage(
          messages.writeTheParticipantPromptAndSelect,
        )}
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            {intl.formatMessage(messages.rememberToWriteYourPromptText, {
              strong: (chunks) => <strong>{chunks}</strong>,
              strong2: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="text"
          label={intl.formatMessage(messages.promptText)}
          component={RichText}
          validation={{ required: true }}
          initialValue={text}
          singleLine
          placeholder={intl.formatMessage(messages.enterTextForThePromptHere)}
        />
        <ArchitectField
          name="createEdge"
          label={intl.formatMessage(messages.createdEdgeType)}
          component={EntitySelectField}
          validation={{ required: true }}
          initialValue={createEdge}
          entityType="edge"
        />
      </Section>

      <BucketSortOrderSection
        disabled={!currentCreateEdge}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={bucketSortOrder}
        description={intl.formatMessage(messages.orderFocalNodesBeforeTheyAre)}
      />
      <BinSortOrderSection
        disabled={!currentCreateEdge}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={binSortOrder}
        description={intl.formatMessage(messages.orderTargetNodesAfterTheyAre)}
      />
    </>
  );
};

export default PromptFields;
