import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { useOwningStageDraft } from '~/components/NewVariableWindow/prospectiveImpliedRules';
import PromptText from '~/components/sections/PromptText';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';
import { excludeValidatedUses } from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';

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

  // An attribute created from here is bound to this prompt the moment the
  // dialog closes, so the create-attribute window is told which stage and which
  // slot it is creating for, and offers only what the rules that slot implies
  // leave open. The index is arbitrary: what a slot implies is decided by the
  // shape of the path, not by which prompt it is.
  const owningStage = useOwningStageDraft();

  const newVariableWindowInitialProps = {
    entity: entity as Entity,
    type,
    initialValues: { name: '', type: VARIABLE_TYPE },
    owningStage,
    slotPath: 'prompts.0.variable',
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
      <Section title="Selection Attribute" layout="vertical">
        <>
          <ArchitectField
            name="variable"
            label="Selection attribute"
            labelHidden
            component={VariablePicker}
            validation={{ required: true }}
            initialValue={variable}
            type={type}
            entity={entity}
            options={geoVariableOptions}
            onCreateOption={handleNewVariable}
          />
        </>
      </Section>
      <NewVariableWindow {...newVariableWindowProps} />
    </>
  );
};

export default PromptFields;
