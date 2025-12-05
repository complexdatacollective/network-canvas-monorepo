import type { ComponentProps } from "react";
import { compose } from "recompose";
import { Heading, rowClassName, type SortDirection, withSort } from "./Variables";

type SortDirectionType = typeof SortDirection.ASC | typeof SortDirection.DESC;

type VariableListProps = {
	variables?: string[];
	onDelete?: () => void;
	sortBy: string;
	sortDirection: SortDirectionType;
	sort: (options: { sortBy: string; sortDirection: SortDirectionType }) => void;
};

const Variables = ({
	variables = [],
	sortBy,
	sortDirection,
	sort,
	onDelete: _onDelete = () => {},
}: VariableListProps) => {
	const headingProps = {
		sortBy,
		sortDirection,
		onSort: sort,
	};

	return (
		<div>
			<table className="codebook__variables">
				<thead>
					<tr className="codebook__variables-row codebook__variables-row--heading">
						<Heading
							name="name"
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...headingProps}
						>
							Name
						</Heading>
					</tr>
				</thead>
				<tbody>
					{variables.map((name, index) => (
						<tr className={rowClassName(index)} key={name}>
							<td className="codebook__variables-column">{name}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

export default compose<ComponentProps<typeof Variables>, typeof Variables>(withSort)(Variables);
