import type { ComponentType } from 'react';
import { compose } from 'react-recompose';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
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
  // Presence is read from the actual leaf fields, not the `searchOptions`
  // parent, which is never itself a registered field. This determines the
  // initial open state from the values the section actually owns.
  const matchProperties = useStageFormValue('searchOptions.matchProperties');
  const fuzziness = useStageFormValue('searchOptions.fuzziness');
  const hasSearchOptions = matchProperties != null || fuzziness != null;
  const initialMatchProperties = useStageInitialValue<string[]>(
    'searchOptions.matchProperties',
  );
  const initialFuzziness = useStageInitialValue<number>(
    'searchOptions.fuzziness',
  );
  return (
    <Section
      title="Roster search"
      description={
        disabled
          ? 'Select a roster data source before configuring search.'
          : 'Configure how participants find and select nodes from the roster.'
      }
      toggleable
      defaultOpen={hasSearchOptions}
      disabled={disabled}
    >
      <Section
        title="Search matching"
        description="Choose the roster attributes considered when matching a participant's search."
      >
        <Alert variant="info" className="my-7">
          <AlertDescription>
            Selecting lots of attributes here may slow the performance of the
            search feature. Select only the attributes that participants will
            search for.
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="searchOptions.matchProperties"
          component={FrescoCheckboxGroupField}
          initialValue={initialMatchProperties}
          validation={{ minSelected: 1 }}
          label="Searchable attributes"
          hint="You can configure which attributes are considered when matching roster nodes to the user's query."
          options={variableOptions}
        />
      </Section>
      <Section
        title="Match tolerance"
        description="Choose how closely a participant's search must match roster text."
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
          hint="Search accuracy determines how closely the text the participant types must be to an attribute for it to be considered a match."
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
 * identity across renders — `dataSource` is read via `useStageFormValue` in
 * the wrapper below.
 */
const GatedSearchOptions = compose<SearchOptionsProps, GatedProps>(
  withDisabledAssetRequired,
)(SearchOptions);

const SearchOptionsForExternalData = (props: StageEditorSectionProps) => {
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  return <GatedSearchOptions {...props} dataSource={dataSource} />;
};

export default SearchOptionsForExternalData;
