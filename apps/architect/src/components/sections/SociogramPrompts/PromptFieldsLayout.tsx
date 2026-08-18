import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { VariableType } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
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

  // "Sort Unplaced Nodes" gates `sortOrder`'s own mounting, so a reactive
  // read of the field can never see a value until AFTER the section is
  // already expanded — use the row's own pre-edit prop value instead, which
  // only needs to answer "does a configured order already exist" once, on
  // mount; the toggle switch owns everything after that.
  const hasSortOrder = !!initialSortOrder && initialSortOrder.length > 0;

  const handleToggleSortOrder = useCallback(
    (nextState: boolean) => {
      if (!nextState) setLocalFieldValue('sortOrder', undefined);
      return true;
    },
    [setLocalFieldValue],
  );

  return (
    <Section
      title="Layout"
      summary={
        <Paragraph>
          This attribute stores the position of nodes on the sociogram.
        </Paragraph>
      }
      group
      layout="vertical"
    >
      <>
        <Alert variant="info" className="my-7">
          <AlertDescription>
            If you use the same layout attribute across all prompts, the
            position of nodes will be automatically set as the participant moves
            between tasks.
          </AlertDescription>
        </Alert>
        <ArchitectField
          name="layout.layoutVariable"
          label="Create or select an attribute to store node coordinates"
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
      </>
      <Section
        toggleable
        title="Sort Unplaced Nodes"
        summary={
          <Paragraph>
            Nodes are stacked in a bucket until your participant drags them into
            position. You can control the order of this stack, which will
            determine the order that your participant is able to position the
            nodes.
          </Paragraph>
        }
        startExpanded={hasSortOrder}
        handleToggleChange={handleToggleSortOrder}
        layout="vertical"
      >
        <>
          <ArchitectArrayField
            name="sortOrder"
            label="Sort order"
            labelHidden
            component={MultiSelect}
            addButtonLabel="Add new sort rule"
            initialValue={initialSortOrder ?? EMPTY_SORT_ORDER}
            properties={SORT_RULE_PROPERTIES}
            validation={SORT_RULE_VALIDATION}
            maxItems={5}
            options={(
              property: string,
              rowValues: unknown,
              allValues: unknown,
            ) =>
              getSortOrderOptionGetter(variableOptions)(
                property,
                rowValues,
                allValues as Record<string, unknown>[],
              )
            }
          />
        </>
      </Section>
    </Section>
  );
};

export default PromptFieldsLayout;
