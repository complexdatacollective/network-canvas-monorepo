import { get, isNull, isUndefined } from 'es-toolkit/compat';
import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { change, FormSection, formValueSelector } from 'redux-form';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { Row, Section } from '~/components/EditorLayout';
import { Number as NumberField } from '~/components/Form/Fields';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

import { ValidatedField } from '../Form';
import IssueAnchor from '../IssueAnchor';

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

const MinMaxAlterLimits = (_props: StageEditorSectionProps) => {
  const formSelector = useMemo(() => formValueSelector('edit-stage'), []);
  const currentMinValue = useSelector(
    (state: RootState) =>
      formSelector(state, 'behaviours.minNodes') as number | undefined,
  );
  const currentMaxValue = useSelector(
    (state: RootState) =>
      formSelector(state, 'behaviours.maxNodes') as number | undefined,
  );
  const hasMultiplePrompts = useSelector((state: RootState) => {
    const prompts = formSelector(state, 'prompts') as unknown[] | undefined;
    return !!prompts && prompts.length > 1;
  });

  const dispatch = useAppDispatch();
  const { confirm } = useDialog();

  const handleToggleChange = useCallback(
    async (newState: boolean) => {
      if (
        (isUndefined(currentMinValue) && isUndefined(currentMaxValue)) ||
        newState
      ) {
        return true;
      }

      const confirmed = await confirm({
        title: 'This will clear your values',
        description:
          'This will clear the minimum and maximum alter values. Do you want to continue?',
        confirmLabel: 'Clear values',
        cancelLabel: 'Cancel',
        intent: 'warning',
        onConfirm: () => {},
      });

      if (confirmed) {
        dispatch(change('edit-stage', 'behaviours.minNodes', null));
        dispatch(change('edit-stage', 'behaviours.maxNodes', null));
        return true;
      }

      return false;
    },
    [confirm, dispatch, currentMinValue, currentMaxValue],
  );

  const startExpanded = useMemo(
    () => !isUndefined(currentMinValue) || !isUndefined(currentMaxValue),
    [currentMaxValue, currentMinValue],
  );

  return (
    <Section
      title="Min/max alters"
      summary={
        <p>
          This feature allows you to specify a minimum or maximum number of
          alters that can be named on this stage. Please note that these limits
          apply to the <strong>stage as a whole</strong>, regardless of the
          number of prompts you have created.
        </p>
      }
      toggleable
      startExpanded={startExpanded}
      handleToggleChange={handleToggleChange}
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
      <FormSection name="behaviours">
        <Row>
          <IssueAnchor
            fieldName="behaviours.minNodes"
            description="Minimum alters"
          />
          <ValidatedField
            name="minNodes"
            component={NumberField}
            validation={{
              lessThanMax: minValidation,
              positiveNumber: (value: number | null | undefined) => {
                if (!value && value !== 0) return undefined;
                return value >= 0 ? undefined : 'Must be a positive number';
              },
            }}
            componentProps={{
              label: 'Minimum Number of Alters. (0 = no minimum)',
              placeholder: '0',
            }}
          />
        </Row>
        <Row>
          <IssueAnchor
            fieldName="behaviours.maxNodes"
            description="Maximum alters"
          />
          <ValidatedField
            name="maxNodes"
            component={NumberField}
            validation={{
              greaterThanMin: maxValidation,
              minValue: (value: number | null | undefined) => {
                if (!value) return undefined;
                return value >= 1 ? undefined : 'Must be at least 1';
              },
            }}
            componentProps={{
              label: 'Maximum Number of Alters. _(Leave empty for no maximum)_',
              placeholder: 'Infinity',
            }}
          />
        </Row>
      </FormSection>
    </Section>
  );
};

export default MinMaxAlterLimits;
