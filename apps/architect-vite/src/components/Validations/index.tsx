import type { Variable } from "@codaco/protocol-validation";
import type { ComponentProps } from "react";
import { compose, withState } from "recompose";
import Validations from "./Validations";
import withStoreState from "./withStoreState";
import withUpdateHandlers from "./withUpdateHandlers";

const withAddNew = withState("addNew", "setAddNew", false);

type OuterProps = {
	form: string;
	name: string;
	variableType: string;
	entity: string;
	existingVariables?: Record<string, Pick<Variable, "name" | "type">>;
};

export default compose<ComponentProps<typeof Validations>, OuterProps>(
	withStoreState,
	withAddNew,
	withUpdateHandlers,
)(Validations);
