import type { UnknownAction } from '@reduxjs/toolkit';
import type { ComponentType } from 'react';
import { compose } from 'react-recompose';
import { useSelector } from 'react-redux';
import { change, formValueSelector } from 'redux-form';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import CheckboxGroupField from '@codaco/fresco-ui/form/fields/CheckboxGroup';
import LikertScaleField from '@codaco/fresco-ui/form/fields/LikertScale';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import withDisabledAssetRequired from '~/components/enhancers/withDisabledAssetRequired';
import withMapFormToProps from '~/components/enhancers/withMapFormToProps';
import FrescoReduxField from '~/components/Form/FrescoReduxField';
import ValidatedField from '~/components/Form/ValidatedField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import useVariablesFromExternalData from '~/hooks/useVariablesFromExternalData';

const FrescoCheckboxGroupField = CheckboxGroupField as ComponentType<
  Record<string, unknown>
>;
const FrescoLikertScaleField = LikertScaleField as ComponentType<
  Record<string, unknown>
>;

type SearchOptionsProps = StageEditorSectionProps & {
  dataSource: string;
  disabled: boolean;
};
const SearchOptions = ({ dataSource, disabled }: SearchOptionsProps) => {
  const { variables: variableOptions } = useVariablesFromExternalData(
    dataSource,
    true,
  );
  const dispatch = useAppDispatch();
  const getFormValue = formValueSelector('edit-stage');
  const hasSearchOptions = useSelector((state: RootState) =>
    getFormValue(state, 'searchOptions'),
  );
  const handleToggleSearchOptions = (nextState: boolean) => {
    if (!nextState) {
      dispatch(change('edit-stage', 'searchOptions', null) as UnknownAction);
    }
    return true;
  };
  return (
    <Section
      title="Search Options"
      toggleable
      handleToggleChange={handleToggleSearchOptions}
      startExpanded={!!hasSearchOptions}
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
        <ValidatedField
          name="searchOptions.matchProperties"
          component={FrescoReduxField}
          validation={{ minSelected: 1 }}
          componentProps={{
            fieldComponent: FrescoCheckboxGroupField,
            label: 'Which attributes should be searchable?',
            options: variableOptions,
          }}
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
        <ValidatedField
          name="searchOptions.fuzziness"
          component={FrescoReduxField}
          validation={{ requiredAcceptsZero: true }}
          componentProps={{
            fieldComponent: FrescoLikertScaleField,
            label: 'Search accuracy',
            labelHidden: true,
            options: [
              { value: 0.75, label: 'Low accuracy' },
              { value: 0.5, label: 'Medium accuracy' },
              { value: 0.25, label: 'High accuracy' },
              { value: 0, label: 'Exact' },
            ],
          }}
        />
      </Section>
    </Section>
  );
};
export default compose<SearchOptionsProps, StageEditorSectionProps>(
  withMapFormToProps(['dataSource']),
  withDisabledAssetRequired,
)(SearchOptions);
