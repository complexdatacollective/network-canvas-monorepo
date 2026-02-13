import { getValidations } from "@app/utils/validations";
import { withPropsOnChange } from "recompose";

const withValidation = withPropsOnChange(["validation"], ({ validation }) => ({
	validate: getValidations(validation),
}));

export default withValidation;
