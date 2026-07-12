import { useCallback, useRef } from 'react';
import type { Validator } from 'redux-form';

import { getValidations } from '~/utils/validations';

const useValidate = (validation: Record<string, unknown>) => {
  const validationRef = useRef(validation);
  validationRef.current = validation;

  // Redux Form re-registers a field whenever the validator-array identity
  // changes. Keep one stable validator while reading the latest validation
  // configuration through a ref, so conditional rules and validator closures
  // update without causing a registration/render loop.
  const validateLatest = useCallback<Validator>(
    (value, allValues, props, name) => {
      for (const validator of getValidations(validationRef.current)) {
        const error = validator(value, allValues, props, name);
        if (error) return error;
      }

      return undefined;
    },
    [],
  );

  const validatorsRef = useRef<Validator[]>([validateLatest]);
  return validatorsRef.current;
};

export default useValidate;
