import { useMemo } from "react";
import { getValidations } from "~/src/utils/validations";

const useValidate = (validation) => {
	const validate = useMemo(() => getValidations(validation), []);

	return validate;
};

export default useValidate;
