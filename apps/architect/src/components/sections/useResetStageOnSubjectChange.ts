import type { UnknownAction } from '@reduxjs/toolkit';
import { difference, keys, union } from 'es-toolkit/compat';
import { useCallback } from 'react';
import { useSelector } from 'react-redux';
import { change, getFormValues } from 'redux-form';

import type { StageType } from '@codaco/protocol-validation';
import { getInterfaceTemplate } from '~/components/StageEditor/interfaceTemplates';
import { useAppDispatch } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';

const SUBJECT_INDEPENDENT_FIELDS = [
  'id',
  'type',
  'label',
  'interviewScript',
  'introductionPanel',
  'subject',
];

const useResetStageOnSubjectChange = (
  form: string,
  interfaceType: StageType,
) => {
  const dispatch = useAppDispatch();
  const formValues = useSelector((state: RootState) =>
    getFormValues(form)(state),
  );
  const fields = keys(formValues);

  return useCallback(
    (_event: unknown, _newValue?: unknown, previousValue?: unknown) => {
      if (!previousValue) {
        return;
      }

      const template = getInterfaceTemplate(interfaceType);
      const fieldsToReset = difference(
        union(fields, keys(template)),
        SUBJECT_INDEPENDENT_FIELDS,
      );

      fieldsToReset.forEach((field) => {
        dispatch(change(form, field, template[field] ?? null) as UnknownAction);
      });
    },
    [dispatch, fields, form, interfaceType],
  );
};

export default useResetStageOnSubjectChange;
