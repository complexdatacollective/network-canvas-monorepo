import MiniTable from "../MiniTable";
import Rules from "../Rules";

type FilterType = {
	join?: string;
	rules: Array<{ type: string; options: Record<string, unknown> }>;
};

type SkipLogicProps = {
	skipLogic: Record<string, unknown>;
};

const SkipLogic = ({ skipLogic }: SkipLogicProps) => {
	if (!skipLogic) {
		return null;
	}

	const { filter, action } = skipLogic as {
		filter?: FilterType;
		action?: string;
	};

	return (
		<MiniTable
			rotated
			wide
			rows={[
				["Action", action],
				["Rules", filter ? <Rules key="rules" filter={filter} /> : null],
			]}
		/>
	);
};

export default SkipLogic;
