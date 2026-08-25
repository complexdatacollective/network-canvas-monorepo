import { useCallback, useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Section from '@codaco/fresco-ui/Section';
import type { FilterRule } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import type { Rule } from '~/components/Query/Rules/validateRule';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

import { ruleValidator } from '../Query';
import { FilterField } from './fields/RuleSetFields';
import getEdgeFilteringWarning from './SociogramPrompts/utils';

export const handleFilterDeactivate = async (
  openDialogFn: () => Promise<boolean>,
) => {
  const result = await openDialogFn();
  return result;
};

/** Matches `RuleSetFields.tsx`'s `RuleSetValue` (not exported from there). */
type FilterValue = { rules?: Rule[]; join?: string } | undefined;
type FilterPrompt = { edges?: { create?: string; display?: string[] } };

const Filter = () => {
  const { confirm } = useDialog();
  const currentValue = useStageFormValue<FilterValue>('filter');
  const initialValue = useStageInitialValue<FilterValue>('filter');
  // get edge creation and display values for edges across all prompts
  const prompts = useStageFormValue<FilterPrompt[]>('prompts');
  const { edgeCreationValues, edgeDisplayValues } = useMemo(() => {
    if (!prompts) return { edgeCreationValues: [], edgeDisplayValues: [] };
    const creationValues: string[] = [];
    const displayValues: string[] = [];
    prompts.forEach((prompt) => {
      if (prompt?.edges?.create) creationValues.push(prompt.edges.create);
      if (prompt?.edges?.display) displayValues.push(...prompt.edges.display);
    });
    return {
      edgeCreationValues: creationValues,
      edgeDisplayValues: displayValues,
    };
  }, [prompts]);
  const shouldShowWarning = useMemo(() => {
    if (edgeCreationValues.length > 0 || edgeDisplayValues.length > 0) {
      return getEdgeFilteringWarning(
        (currentValue?.rules || []) as FilterRule[],
        [...edgeCreationValues, ...edgeDisplayValues],
      );
    }
    return false;
  }, [currentValue, edgeCreationValues, edgeDisplayValues]);
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (!currentValue || newState) {
        return true;
      }
      return handleFilterDeactivate(
        async () =>
          (await confirm({
            title: 'This will clear your filter',
            description:
              'This will clear your filter, and delete any rules you have created. Do you want to continue?',
            confirmLabel: 'Clear filter',
            cancelLabel: 'Cancel',
            intent: 'warning',
            onConfirm: () => {},
          })) === true,
      );
    },
    [confirm, currentValue],
  );
  return (
    <Section
      title="Stage filter"
      description="Create rules that limit which nodes or edges are shown on this stage."
      toggleable
      defaultOpen={!!currentValue}
      onOpenChange={handleToggleChange}
    >
      {shouldShowWarning && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>Filter rules hide configured values</AlertTitle>
          <AlertDescription>
            This stage has edge creation or display values that will not be
            shown based on the current filter rules.
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="filter"
        label="Filter rules"
        hint="Create one or more rules to filter what is shown on this stage."
        component={FilterField}
        initialValue={initialValue}
        validation={{ validator: ruleValidator }}
      />
    </Section>
  );
};
export default Filter;
