import Rules from "../Rules";

type FilterProps = {
	filter: Record<string, unknown>;
};

const Filter = ({ filter }: FilterProps) => {
	if (!filter) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__filter">
			<Rules filter={filter} />
		</div>
	);
};

export default Filter;
