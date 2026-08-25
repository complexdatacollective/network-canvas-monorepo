import { get, isNull, isUndefined } from 'es-toolkit/compat';
import { useCallback } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';

const maxValidation = (
  value: number | null | undefined,
  allValues: Record<string, unknown>,
) => {
  const minValue = get(allValues, 'behaviours.minNodes', null) as number | null;
  if (isUndefined(minValue) || isNull(minValue) || !value) {
    return undefined;
  }
  return value >= minValue
    ? undefined
    : 'Maximum number of alters must be greater than or equal to the minimum number';
};
const minValidation = (
  value: number | null | undefined,
  allValues: Record<string, unknown>,
) => {
  const maxValue = get(allValues, 'behaviours.maxNodes') as
    | number
    | null
    | undefined;
  if (isUndefined(maxValue) || isNull(maxValue) || !value) {
    return undefined;
  }
  return value <= maxValue
    ? undefined
    : 'Minimum number of alters must be less than or equal to the maximum number';
};

// `size` is dropped: the native `<input>` element's `size` attribute (a
// character-width number) would otherwise collide with `InputField`'s own
// `size` prop (a `'sm' | 'md' | 'lg' | 'xl'` CVA variant) when `...rest` is
// spread onto it below — nothing here ever sets it.
type IntegerInputFieldProps = Omit<
  CreateFormFieldProps<number, 'input'>,
  'size'
>;

/**
 * `InputField` is string-valued (it always emits `e.target.value` verbatim,
 * even for `type="number"`); this presents an integer value/onChange pair
 * over it, replacing `FrescoReduxField`'s deleted `reduxIntegerValue`
 * fromReduxValue/toReduxValue pair.
 */
const IntegerInputField = ({
  value,
  onChange,
  ...rest
}: IntegerInputFieldProps) => (
  <InputField
    {...rest}
    type="number"
    value={value === undefined ? '' : String(value)}
    onChange={(nextValue: string | undefined) => {
      if (!nextValue || nextValue.trim() === '') {
        onChange?.(undefined);
        return;
      }
      const parsed = Number(nextValue);
      onChange?.(Number.isInteger(parsed) ? parsed : undefined);
    }}
  />
);

const MinMaxAlterLimits = (_props: StageEditorSectionProps) => {
  const currentMinValue = useStageFormValue<number | undefined>(
    'behaviours.minNodes',
  );
  const currentMaxValue = useStageFormValue<number | undefined>(
    'behaviours.maxNodes',
  );
  const prompts = useStageFormValue<unknown[] | undefined>('prompts');
  const hasMultiplePrompts = !!prompts && prompts.length > 1;
  const initialMinValue = useStageInitialValue<number>('behaviours.minNodes');
  const initialMaxValue = useStageInitialValue<number>('behaviours.maxNodes');
  const { confirm } = useDialog();
  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (
        (isUndefined(currentMinValue) && isUndefined(currentMaxValue)) ||
        newState
      ) {
        return true;
      }
      return (
        (await confirm({
          title: 'This will clear your values',
          description:
            'This will clear the minimum and maximum alter values. Do you want to continue?',
          confirmLabel: 'Clear values',
          cancelLabel: 'Cancel',
          intent: 'warning',
          onConfirm: () => {},
        })) === true
      );
    },
    [confirm, currentMinValue, currentMaxValue],
  );
  const defaultOpen =
    !isUndefined(currentMinValue) || !isUndefined(currentMaxValue);
  return (
    <Section
      title="Nomination limits"
      description="Set the minimum or maximum number of alters that can be named across the whole stage."
      toggleable
      defaultOpen={defaultOpen}
      onOpenChange={handleToggleChange}
    >
      {hasMultiplePrompts && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>Limits apply to the whole stage</AlertTitle>
          <AlertDescription>
            You have multiple prompts configured on this stage. Remember that
            the limits you specify here apply to the{' '}
            <strong>stage as a whole</strong>. Consider splitting your prompts
            up into multiple stages, or ensure you take extra care in the
            phrasing of your prompts so that you communicate the alter limits to
            your participants.
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="behaviours.minNodes"
        component={IntegerInputField}
        initialValue={initialMinValue}
        validation={{
          lessThanMax: minValidation,
          positiveNumber: (value: number | null | undefined) => {
            if (!value && value !== 0) return undefined;
            return value >= 0 ? undefined : 'Must be a positive number';
          },
        }}
        label="Minimum number of alters"
        hint="0 = no minimum"
        placeholder="0"
      />
      <ArchitectField
        name="behaviours.maxNodes"
        component={IntegerInputField}
        initialValue={initialMaxValue}
        validation={{
          greaterThanMin: maxValidation,
          minValue: (value: number | null | undefined) => {
            if (!value) return undefined;
            return value >= 1 ? undefined : 'Must be at least 1';
          },
        }}
        label="Maximum number of alters"
        hint="Leave empty for no maximum"
        placeholder="Infinity"
      />
    </Section>
  );
};

export default MinMaxAlterLimits;
