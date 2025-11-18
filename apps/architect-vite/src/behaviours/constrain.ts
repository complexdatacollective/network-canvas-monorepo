import { withContext } from "recompose";

type ConstraintsContextType = {
	constraints: unknown[];
};

const constrain = (constraints: unknown[]) =>
	withContext<ConstraintsContextType, Record<string, never>>({ constraints: () => null }, () => ({ constraints }));

export default constrain;
