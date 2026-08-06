import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

import withDisabledAssetRequired from '../enhancers/withDisabledAssetRequired';

const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoLikertScaleField = LikertScaleField as ComponentType<
  Record<string, unknown>
>;

type SearchOptionsProps = StageEditorSectionProps & {
  dataSource?: string;
  disabled: boolean;
};
const SearchOptions = ({ dataSource, disabled }: SearchOptionsProps) => {
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  const setStageValue = useSetStageValue();
  // Presence is read from the actual leaf fields, not the `searchOptions`
  // parent (never itself a registered field): once both leaves unregister
  // (the section collapses), a parent-path read would fall through to the
  // stale committed value and resurrect "cleared" options the next time the
  // section opens, since the store has no hierarchical relationship between
  // a path and its sub-paths.
  const matchProperties = useStageFormValue('searchOptions.matchProperties');
  const fuzziness = useStageFormValue('searchOptions.fuzziness');
  const hasSearchOptions = matchProperties != null || fuzziness != null;
  const initialMatchProperties = useStageInitialValue<string[]>(
    'searchOptions.matchProperties',
  );
  const initialFuzziness = useStageInitialValue<number>(
    'searchOptions.fuzziness',
  );
  const handleToggleSearchOptions = (nextState: boolean) => {
    if (!nextState) {
      // Clear both LEAF paths, not the `searchOptions` parent: `searchOptions`
      // itself is never a registered field (only its two children are), and
      // the store has no hierarchical relationship between a path and its
      // sub-paths — writing the parent would not reach either child.
      setStageValue('searchOptions.matchProperties', undefined);
      setStageValue('searchOptions.fuzziness', undefined);
    }
    return true;
  };
  return (
    <Section
      title="Search Options"
      toggleable
      handleToggleChange={handleToggleSearchOptions}
      startExpanded={hasSearchOptions}
      summary={
        <Paragraph>
          To find and select nodes from the roster, the participant will use a
          search function. This section controls how this search function works
          on this stage.
        </Paragraph>
      }
      disabled={disabled}
    >
      <Section
        title="Searchable Attributes"
        summary={
          <Paragraph>
            You can configure which attributes are considered when matching
            roster nodes to the user&apos;s query.
          </Paragraph>
        }
        layout="vertical"
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            The selecting lots of attributes here may slow the performance of
            the search feature. Select only the attributes that participants
            will search for.
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="searchOptions.matchProperties"
          component={FrescoCheckboxGroupField}
          initialValue={initialMatchProperties}
          validation={{ minSelected: 1 }}
          label="Which attributes should be searchable?"
          options={variableOptions}
        />
      </Section>
      <Section
        title="Search Accuracy"
        summary={
          <Paragraph>
            Search accuracy determines how closely the text the participant
            types must be to an attribute for it to be considered a match.
          </Paragraph>
        }
        layout="vertical"
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            If the roster contains many similar nodes, selecting
            &quot;Exact&quot; or &quot;High accuracy&quot; will help narrow down
            searches. In contrast, a low accuracy search will allow for typos
            and spelling mistakes.
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="searchOptions.fuzziness"
          component={FrescoLikertScaleField}
          initialValue={initialFuzziness}
          validation={{ requiredAcceptsZero: true }}
          label="Search accuracy"
          labelHidden
          options={[
            { value: 0.75, label: 'Low accuracy' },
            { value: 0.5, label: 'Medium accuracy' },
            { value: 0.25, label: 'High accuracy' },
            { value: 0, label: 'Exact' },
          ]}
        />
      </Section>
    </Section>
  );
};
type GatedProps = StageEditorSectionProps & { dataSource?: string };

/**
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders — `dataSource` (the redux-form `withMapFormToProps`
 * replacement) is read via `useStageFormValue` in the wrapper below.
 */
const GatedSearchOptions = compose<SearchOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(SearchOptions);

const SearchOptionsForExternalData = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedSearchOptions {...props} dataSource={dataSource} />;
};

export default SearchOptionsForExternalData;
