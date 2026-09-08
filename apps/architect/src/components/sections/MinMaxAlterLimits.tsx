import { createElement, useCallback } from 'react';

import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
const defaultIntl = createAppIntl({ locale: 'en' });
import { get, isNull, isUndefined } from 'es-toolkit/compat';

import { commonMessages } from '@codaco/app-i18n/common';
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
const utilityMessages = defineMessages({
  maximumNumberOfAltersMustBe: {
    id: 'architect.utility.sections.minMaxAlterLimits.maximumNumberOfAltersMustBe',
    defaultMessage:
      'Maximum number of alters must be greater than or equal to the minimum number',
    description:
      'Researcher-facing explanatory text in components / sections / MinMaxAlterLimits.',
  },
  minimumNumberOfAltersMustBe: {
    id: 'architect.utility.sections.minMaxAlterLimits.minimumNumberOfAltersMustBe',
    defaultMessage:
      'Minimum number of alters must be less than or equal to the maximum number',
    description:
      'Researcher-facing explanatory text in components / sections / MinMaxAlterLimits.',
  },
});
const chromeMessages = defineMessages({
  mustBeAPositiveNumber: {
    id: 'architect.chrome.sections.minMaxAlterLimits.mustBeAPositiveNumber',
    defaultMessage: 'Must be a positive number',
    description:
      'Researcher-facing explanatory text in components / sections / MinMaxAlterLimits.',
  },
  mustBeAtLeast1: {
    id: 'architect.chrome.sections.minMaxAlterLimits.mustBeAtLeast1',
    defaultMessage: 'Must be at least 1',
    description:
      'Researcher-facing explanatory text in components / sections / MinMaxAlterLimits.',
  },
});
const messages = defineMessages({
  thisWillClearYourValues: {
    id: 'architect.sections.minMaxAlterLimits.thisWillClearYourValues',
    defaultMessage: 'This will clear your values',
    description: 'The title text in components / sections / MinMaxAlterLimits.',
  },
  thisWillClearTheMinimumAnd: {
    id: 'architect.sections.minMaxAlterLimits.thisWillClearTheMinimumAnd',
    defaultMessage:
      'This will clear the minimum and maximum alter values. Do you want to continue?',
    description:
      'The description text in components / sections / MinMaxAlterLimits.',
  },
  clearValues: {
    id: 'architect.sections.minMaxAlterLimits.clearValues',
    defaultMessage: 'Clear values',
    description:
      'The confirmLabel text in components / sections / MinMaxAlterLimits.',
  },
  nominationLimits: {
    id: 'architect.sections.minMaxAlterLimits.nominationLimits',
    defaultMessage: 'Nomination limits',
    description: 'The title text in components / sections / MinMaxAlterLimits.',
  },
  setTheMinimumOrMaximumNumber: {
    id: 'architect.sections.minMaxAlterLimits.setTheMinimumOrMaximumNumber',
    defaultMessage:
      'Set the minimum or maximum number of alters that can be named across the whole stage.',
    description:
      'The description text in components / sections / MinMaxAlterLimits.',
  },
  limitsApplyToTheWholeStage: {
    id: 'architect.sections.minMaxAlterLimits.limitsApplyToTheWholeStage',
    defaultMessage: 'Limits apply to the whole stage',
    description: 'Visible text in components / sections / MinMaxAlterLimits.',
  },
  youHaveMultiplePromptsConfiguredOn: {
    id: 'architect.sections.minMaxAlterLimits.youHaveMultiplePromptsConfiguredOn',
    defaultMessage:
      'You have multiple prompts configured on this stage. Remember that the limits you specify here apply to the <strong>stage as a whole</strong>. Consider splitting your prompts up into multiple stages, or ensure you take extra care in the phrasing of your prompts so that you communicate the alter limits to your participants.',
    description: 'Visible text in components / sections / MinMaxAlterLimits.',
  },
  minimumNumberOfAlters: {
    id: 'architect.sections.minMaxAlterLimits.minimumNumberOfAlters',
    defaultMessage: 'Minimum number of alters',
    description: 'The label text in components / sections / MinMaxAlterLimits.',
  },
  message: {
    id: 'architect.sections.minMaxAlterLimits.message',
    defaultMessage: '0 = no minimum',
    description: 'The hint text in components / sections / MinMaxAlterLimits.',
  },
  maximumNumberOfAlters: {
    id: 'architect.sections.minMaxAlterLimits.maximumNumberOfAlters',
    defaultMessage: 'Maximum number of alters',
    description: 'The label text in components / sections / MinMaxAlterLimits.',
  },
  leaveEmptyForNoMaximum: {
    id: 'architect.sections.minMaxAlterLimits.leaveEmptyForNoMaximum',
    defaultMessage: 'Leave empty for no maximum',
    description: 'The hint text in components / sections / MinMaxAlterLimits.',
  },
  infinity: {
    id: 'architect.sections.minMaxAlterLimits.infinity',
    defaultMessage: 'Infinity',
    description:
      'The placeholder text in components / sections / MinMaxAlterLimits.',
  },
});

const maxValidation = (
  value: number | null | undefined,
  allValues: Record<string, unknown>,
  intl: IntlShape = defaultIntl,
) => {
  const minValue = get(allValues, 'behaviours.minNodes', null) as number | null;
  if (isUndefined(minValue) || isNull(minValue) || !value) {
    return undefined;
  }
  return value >= minValue
    ? undefined
    : intl.formatMessage(utilityMessages.maximumNumberOfAltersMustBe);
};
const minValidation = (
  value: number | null | undefined,
  allValues: Record<string, unknown>,
  intl: IntlShape = defaultIntl,
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
    : intl.formatMessage(utilityMessages.minimumNumberOfAltersMustBe);
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
  const intl = useAppIntl();
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
          title: createElement(AppMessage, {
            message: messages.thisWillClearYourValues,
          }),
          description: createElement(AppMessage, {
            message: messages.thisWillClearTheMinimumAnd,
          }),
          confirmLabel: createElement(AppMessage, {
            message: messages.clearValues,
          }),
          cancelLabel: createElement(AppMessage, {
            message: commonMessages.cancel,
          }),
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
      title={intl.formatMessage(messages.nominationLimits)}
      description={intl.formatMessage(messages.setTheMinimumOrMaximumNumber)}
      toggleable
      defaultOpen={defaultOpen}
      onOpenChange={handleToggleChange}
    >
      {hasMultiplePrompts && (
        <Alert variant="warning" className="my-7">
          <AlertTitle>
            {intl.formatMessage(messages.limitsApplyToTheWholeStage)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.youHaveMultiplePromptsConfiguredOn, {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </AlertDescription>
        </Alert>
      )}
      <ArchitectField
        name="behaviours.minNodes"
        component={IntegerInputField}
        initialValue={initialMinValue}
        validation={{
          lessThanMax: (
            value: number | null | undefined,
            allValues: Record<string, unknown>,
          ) => minValidation(value, allValues, intl),
          positiveNumber: (value: number | null | undefined) => {
            if (!value && value !== 0) return undefined;
            return value >= 0
              ? undefined
              : intl.formatMessage(chromeMessages.mustBeAPositiveNumber);
          },
        }}
        label={intl.formatMessage(messages.minimumNumberOfAlters)}
        hint={intl.formatMessage(messages.message)}
        placeholder={intl.formatNumber(0)}
      />
      <ArchitectField
        name="behaviours.maxNodes"
        component={IntegerInputField}
        initialValue={initialMaxValue}
        validation={{
          greaterThanMin: (
            value: number | null | undefined,
            allValues: Record<string, unknown>,
          ) => maxValidation(value, allValues, intl),
          minValue: (value: number | null | undefined) => {
            if (!value) return undefined;
            return value >= 1
              ? undefined
              : intl.formatMessage(chromeMessages.mustBeAtLeast1);
          },
        }}
        label={intl.formatMessage(messages.maximumNumberOfAlters)}
        hint={intl.formatMessage(messages.leaveEmptyForNoMaximum)}
        placeholder={intl.formatMessage(messages.infinity)}
      />
    </Section>
  );
};

export default MinMaxAlterLimits;
