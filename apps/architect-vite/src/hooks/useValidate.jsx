import { useMemo } from "react";
import { getValidations } from "~/utils/validations";

const useValidate = (validation) => {
	const validate = useMemo(() => getValidations(validation), [validation]);

	return validate;
};

export default useValidate;
