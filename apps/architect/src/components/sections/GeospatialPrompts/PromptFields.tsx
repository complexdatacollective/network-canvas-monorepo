import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import PromptText from '~/components/sections/PromptText';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
const messages = defineMessages({
  locationResponse: {
    id: 'architect.sections.geospatialPrompts.promptFields.locationResponse',
    defaultMessage: 'Location response',
    description:
      'The title text in components / sections / GeospatialPrompts / PromptFields.',
  },
  chooseTheLocationAttributeThatStores: {
    id: 'architect.sections.geospatialPrompts.promptFields.chooseTheLocationAttributeThatStores',
    defaultMessage:
      "Choose the location attribute that stores the participant's selection.",
    description:
      'The description text in components / sections / GeospatialPrompts / PromptFields.',
  },
  locationAttribute: {
    id: 'architect.sections.geospatialPrompts.promptFields.locationAttribute',
    defaultMessage: 'Location attribute',
    description:
      'The label text in components / sections / GeospatialPrompts / PromptFields.',
  },
});

const VARIABLE_TYPE = 'location';

type PromptFieldsProps = {
  entity?: string;
  type?: string;
  /** The row's own pre-edit `variable`, from DialogArrayField's `item` spread. */
  variable?: string;
  /**
   * The row's committed prompt text, from the same spread. `PromptText`
   * cannot resolve this itself — the dialog runs its own form store, not the
   * stage's — so dropping it rendered an existing prompt's required text
   * field blank, and the dialog refused to save any other edit until the
   * researcher re-typed the wording.
   */
  text?: string;
};

const PromptFields = ({
  entity = '',
  type = '',
  variable,
  text,
}: PromptFieldsProps) => {
  const intl = useAppIntl();
  const subject = useMemo(
    () => ({ entity: entity as 'node' | 'edge' | 'ego', type }),
    [entity, type],
  );
  // The main `variable` picker is an UNVALIDATED writer: drop options a form
  // elsewhere already validates (mirrors CategoricalBinPrompts'
  // withVariableOptions, inlined here to avoid a cross-section HOC
  // dependency).
  const variableOptions = useSelector((state: RootState) => {
    const rawVariableOptions = getVariableOptionsForSubject(state, subject);
    return excludeValidatedUses(state, subject, rawVariableOptions, variable);
  });
  const geoVariableOptions = variableOptions.filter(
    ({ type: variableType }) => variableType === VARIABLE_TYPE,
  );

  // Writes into THIS dialog's own (local) form store — the row-editor form,
  // not the stage.
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);

  const newVariableWindowInitialProps = {
    entity: entity as Entity,
    type,
    initialValues: { name: '', type: VARIABLE_TYPE },
  };

  const handleCreatedNewVariable = (...args: unknown[]) => {
    const [id, params] = args as [string, { field: string }];
    setLocalFieldValue(params.field, id);
  };

  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedNewVariable,
    );
  const handleNewVariable = (name: string) => {
    openNewVariableWindow(
      { initialValues: { name, type: VARIABLE_TYPE } },
      { field: 'variable' },
    );
  };

  return (
    <>
      <PromptText initialValue={text} />
      <Section
        title={intl.formatMessage(messages.locationResponse)}
        description={intl.formatMessage(
          messages.chooseTheLocationAttributeThatStores,
        )}
      >
        <ArchitectField
          name="variable"
          label={intl.formatMessage(messages.locationAttribute)}
          component={VariablePicker}
          validation={{ required: true }}
          initialValue={variable}
          type={type}
          entity={entity}
          options={geoVariableOptions}
          onCreateOption={handleNewVariable}
        />
      </Section>
      <NewVariableWindow {...newVariableWindowProps} />
    </>
  );
};

export default PromptFields;
