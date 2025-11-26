import type { ComponentProps } from "react";
import { compose, withState } from "recompose";
import Validations from "./Validations";
import withStoreState from "./withStoreState";
import withUpdateHandlers from "./withUpdateHandlers";

const withAddNew = withState("addNew", "setAddNew", false);

export default compose<ComponentProps<typeof Validations>, typeof Validations>(
	withStoreState,
	withAddNew,
	withUpdateHandlers,
)(Validations);
