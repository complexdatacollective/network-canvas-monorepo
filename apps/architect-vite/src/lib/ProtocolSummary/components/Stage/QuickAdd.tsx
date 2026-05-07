import { useContext } from "react";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Variable from "../Variable";
import SectionFrame from "./SectionFrame";

type QuickAddProps = {
	quickAdd?: string | null;
};

const QuickAdd = ({ quickAdd = null }: QuickAddProps) => {
	const { index } = useContext(SummaryContext);

	if (!quickAdd) {
		return null;
	}

	const variableMeta = index.find(({ id }) => id === quickAdd);

	return (
		<SectionFrame title="Quick Add">
			<MiniTable
				rotated
				rows={[
					[<span key="label">Variable</span>, <Variable key="var" id={quickAdd} />],
					[<span key="type-label">Type</span>, <span key="type-value">{variableMeta?.type || "Unknown"}</span>],
				]}
			/>
		</SectionFrame>
	);
};

export default QuickAdd;
