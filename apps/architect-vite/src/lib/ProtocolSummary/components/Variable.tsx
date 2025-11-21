import { useContext } from "react";
import { SimpleVariablePill } from "~/components/Form/Fields/VariablePicker/VariablePill";
import DualLink from "./DualLink";
import { getVariableMeta, getVariableName } from "./helpers";
import SummaryContext from "./SummaryContext";

type VariableProps = {
	id: string;
};

const Variable = ({ id }: VariableProps) => {
	const { index } = useContext(SummaryContext);

	if (!id) return null;

	const meta = getVariableMeta(index, id);

	return (
		<DualLink to={`#variable-${id}`} className="protocol-summary-variable">
			<SimpleVariablePill label={getVariableName(index, id)} type={meta.type} />
		</DualLink>
	);
};

export default Variable;
