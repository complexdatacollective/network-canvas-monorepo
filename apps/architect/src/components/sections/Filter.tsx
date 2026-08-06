import { useCallback, useMemo } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FilterRule } from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { Rule } from '~/components/Query/Rules/validateRule';
import {
  useSetStageValue,
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
  const setStageValue = useSetStageValue();
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
      const confirmed = await handleFilterDeactivate(
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
      if (confirmed) {
        setStageValue('filter', undefined);
        return true;
      }
      return false;
    },
    [confirm, setStageValue, currentValue],
  );
  return (
    <Section
      title="Filter"
      toggleable
      startExpanded={!!currentValue}
      handleToggleChange={handleToggleChange}
      layout="vertical"
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
        label="Filter"
        labelHidden
        hint={
          <Paragraph>
            You can optionally filter which nodes or edges are shown on this
            stage, by creating one or more rules using the options below.
          </Paragraph>
        }
        component={FilterField}
        initialValue={initialValue}
        validation={{ validator: ruleValidator }}
      />
    </Section>
  );
};
export default Filter;
