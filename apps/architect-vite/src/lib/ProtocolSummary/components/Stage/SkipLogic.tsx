import MiniTable from "../MiniTable";
import Rules from "../Rules";

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
					["Rules", <Rules key="rules" filter={filter} />],
				]}
			/>
		</div>
	);
};

export default SkipLogic;
