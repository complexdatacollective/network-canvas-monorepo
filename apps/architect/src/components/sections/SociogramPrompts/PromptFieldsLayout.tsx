import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import MultiSelect, {
  completeRows,
  type PropertyField,
} from '~/components/Form/arrayFields/MultiSelect';
import { useCreateVariable } from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/modules/root';
import { getVariableOptionsForSubject } from '~/selectors/codebook';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import { getSortOrderOptionGetter } from '../CategoricalBinPrompts/optionGetters';
import { getLayoutVariablesForSubject } from './selectors';

const SORT_RULE_PROPERTIES: PropertyField[] = [
  { fieldName: 'property' },
  { fieldName: 'direction' },
];

// A row's own cells cannot block the save (see RowField), and a rule missing
// its direction fails `SortRuleSchema` after `prune`.
const SORT_RULE_VALIDATION = {
  completeRows: completeRows(SORT_RULE_PROPERTIES),
};

/** Stable empty list: `initialValue` is a register-effect dependency. */
const EMPTY_SORT_ORDER: Record<string, unknown>[] = [];

type PromptFieldsProps = {
  entity?: string;
  type?: string;
  /** The row's own pre-edit values, supplied by DialogArrayField's `item` spread. */
  layout?: { layoutVariable?: string | null };
  sortOrder?: Record<string, unknown>[];
};

const PromptFieldsLayout = ({
  entity = '',
  type = '',
  layout,
  sortOrder: initialSortOrder,
}: PromptFieldsProps) => {
  const subject = useMemo(
    () => ({ entity: entity as 'node' | 'edge' | 'ego', type }),
    [entity, type],
  );
  const variableOptions = useSelector((state: RootState) =>
    getVariableOptionsForSubject(state, subject),
  );
  const layoutVariablesForSubject = useSelector((state: RootState) =>
    getLayoutVariablesForSubject(state, subject),
  );

  // Writes into THIS dialog's own (local) form store — the row-editor form,
  // not the stage.
  const setLocalFieldValue = useFormStore((store) => store.setFieldValue);
  const { createVariable } = useCreateVariable();
  const handleCreateVariable = useCallback(
    async (value: string, variableType: string, fieldName: string) => {
      const variable = await createVariable(
        value,
        variableType as VariableType,
      );
      if (variable) setLocalFieldValue(fieldName, variable);
    },
    [createVariable, setLocalFieldValue],
  );

  // "Sort unplaced nodes" gates `sortOrder`'s own mounting, so a reactive
  // read of the field can never see a value until AFTER the section is
  // already expanded — use the row's own pre-edit prop value instead, which
  // only needs to answer "does a configured order already exist" once, on
  // mount; the toggle switch owns everything after that.
  const hasSortOrder = !!initialSortOrder && initialSortOrder.length > 0;

  return (
    <Section
      title="Node layout"
      description="Store node positions and configure the initial order of unplaced nodes."
    >
      <Alert variant="info" className="my-7">
        <AlertDescription>
          If you use the same layout attribute across all prompts, the position
          of nodes will be automatically set as the participant moves between
          tasks.
        </AlertDescription>
      </Alert>
      <ArchitectField
        name="layout.layoutVariable"
        label="Layout attribute"
        hint="Create or select an attribute that stores node coordinates."
        component={VariablePicker}
        validation={{ required: true }}
        initialValue={layout?.layoutVariable ?? undefined}
        type={type}
        entity={entity}
        options={layoutVariablesForSubject}
        onCreateOption={(value: string) =>
          handleCreateVariable(value, 'layout', 'layout.layoutVariable')
        }
      />
      <Section
        toggleable
        title="Sort unplaced nodes"
        description="Control the order of the stack participants use to position nodes."
        defaultOpen={hasSortOrder}
      >
        <ArchitectArrayField
          name="sortOrder"
          label="Sort rules"
          component={MultiSelect}
          addButtonLabel="Add new sort rule"
          initialValue={initialSortOrder ?? EMPTY_SORT_ORDER}
          properties={SORT_RULE_PROPERTIES}
          validation={SORT_RULE_VALIDATION}
          maxItems={5}
          options={(property: string, rowValues: unknown, allValues: unknown) =>
            getSortOrderOptionGetter(variableOptions)(
              property,
              rowValues,
              allValues as Record<string, unknown>[],
            )
          }
        />
      </Section>
    </Section>
  );
};

export default PromptFieldsLayout;
