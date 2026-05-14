import { useMemo } from "react";
import type { Validator } from "redux-form";
import { getValidations } from "~/utils/validations";

const useValidate = (validation: Record<string, Validator | boolean | string | string[] | unknown>) => {
	// biome-ignore lint/correctness/useExhaustiveDependencies: exhaustive deps causes infinite loop
	const validate = useMemo(() => getValidations(validation), []);

	return validate;
};

export default useValidate;
