import Rules from "../Rules";
import MiniTable from "../MiniTable";

type SkipLogicProps = {
	skipLogic: Record<string, unknown>;
};

const SkipLogic = ({ skipLogic }: SkipLogicProps) => {
	if (!skipLogic) {
		return null;
	}

	const { filter, action } = skipLogic;

	return (
		<div className="protocol-summary-stage__skip-logic">
			<MiniTable
				rotated
				wide
				rows={[
					["Action", action],
					["Rules", <Rules filter={filter} />],
				]}
			/>
		</div>
	);
};

export default SkipLogic;
