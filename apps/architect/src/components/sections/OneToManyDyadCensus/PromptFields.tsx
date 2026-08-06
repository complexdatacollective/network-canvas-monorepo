import { useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import RichText from '~/components/Form/Fields/RichText/Field';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { getFieldId } from '~/utils/issues';

import BinSortOrderSection from '../BinSortOrderSection';
import BucketSortOrderSection from '../BucketSortOrderSection';
import { getSortOrderOptionGetter } from '../CategoricalBinPrompts/optionGetters';
import EntitySelectField from '../fields/EntitySelectField/EntitySelectField';

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

  const getOptions = getSortOrderOptionGetter(sortVariableOptions);
  const sortMaxItems = getOptions('property', undefined, []).length;

  return (
    <>
      <Section
        title="One to Many Dyad Census Prompts"
        id={getFieldId('text')}
        layout="vertical"
      >
        <Paragraph>
          One to Many Dyad Census prompts guide your participant in evaluating
          relationships between a single focal node and several target nodes.
          (for example, &apos;friendship&apos;, &apos;material support&apos; or
          &apos;conflict&apos;). Enter prompt text below, and select an edge
          type that will be created when the participant selects a target node.
        </Paragraph>
        <Alert variant="info" className="my-7">
          <AlertDescription>
            Remember to write your prompt text so that it clearly indicates the
            participant is evaluating the relationship between one specific
            individual and each of the others shown. Use phrases such as &apos;
            <strong>which of the following people</strong>
            &apos;, or &apos;
            <strong>select all people with whom this person</strong>
            &apos; to indicate that the participant should focus on selecting
            from the group.
          </AlertDescription>
        </Alert>
        <Row>
          <ArchitectField
            name="text"
            label="Prompt Text"
            component={RichText}
            validation={{ required: true }}
            initialValue={text}
            singleLine
            placeholder="Enter text for the prompt here..."
          />
        </Row>
        <Row>
          <ArchitectField
            name="createEdge"
            label="Create edges of the following type"
            component={EntitySelectField}
            validation={{ required: true }}
            initialValue={createEdge}
            entityType="edge"
          />
        </Row>
      </Section>

      <BucketSortOrderSection
        disabled={!currentCreateEdge}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={bucketSortOrder}
        summary={
          <Paragraph>
            The focal nodes are presented one at a time. You may optionally
            configure a list of rules to determine how nodes are sorted in the
            bucket when the task starts, which will determine the order that
            your participant evaluates their relationships. Interviewer will
            default to using the order in which nodes were named.
          </Paragraph>
        }
      />
      <BinSortOrderSection
        disabled={!currentCreateEdge}
        maxItems={sortMaxItems}
        optionGetter={getOptions}
        initialValue={binSortOrder}
        summary={
          <Paragraph>
            You may also configure one or more sort rules that determine the
            order that the target nodes are sorted in the bin.
          </Paragraph>
        }
      />
    </>
  );
};

export default PromptFields;
