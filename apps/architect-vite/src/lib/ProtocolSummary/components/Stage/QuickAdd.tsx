import { useContext } from "react";
import MiniTable from "../MiniTable";
import SummaryContext from "../SummaryContext";
import Variable from "../Variable";

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
		<div className="protocol-summary-stage__quick-add">
			<div className="protocol-summary-stage__quick-add-content">
				<h2 className="section-heading">Quick Add</h2>
				<MiniTable
					rotated
					rows={[
						["Variable", <Variable id={quickAdd} />],
						["Type", variableMeta.type],
					]}
				/>
			</div>
		</div>
	);
};

export default QuickAdd;
