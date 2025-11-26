import { useMemo } from "react";
import { getValidations } from "~/utils/validations";

const useValidate = (validation) => {
	// biome-ignore lint/correctness/useExhaustiveDependencies: exhaustive deps causes infinite loop
	const validate = useMemo(() => getValidations(validation), []);

	return validate;
};

export default useValidate;
