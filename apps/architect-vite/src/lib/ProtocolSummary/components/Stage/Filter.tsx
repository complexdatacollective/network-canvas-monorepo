import Rules from "../Rules";

type FilterType = {
	join?: string;
	rules: Array<{ type: string; options: Record<string, unknown> }>;
};

type FilterProps = {
	filter: Record<string, unknown>;
};

const Filter = ({ filter }: FilterProps) => {
	if (!filter) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__filter">
			<Rules filter={filter as FilterType} />
		</div>
	);
};

export default Filter;
