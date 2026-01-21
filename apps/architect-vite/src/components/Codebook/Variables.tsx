import cx from "classnames";
import { get, isString } from "es-toolkit/compat";
import type { ComponentProps } from "react";
import { connect } from "react-redux";
import { compose, withHandlers, withProps, withStateHandlers } from "recompose";
import { actionCreators as dialogActionCreators } from "~/ducks/modules/dialogs";
import { deleteVariableAsync } from "~/ducks/modules/protocol/codebook";
import EditableVariablePill from "../Form/Fields/VariablePicker/VariablePill";
import ControlsColumn from "./ControlsColumn";
import UsageColumn from "./UsageColumn";

const SortDirection = {
	ASC: Symbol("ASC"),
	DESC: Symbol("DESC"),
};

type SortDirectionType = typeof SortDirection.ASC | typeof SortDirection.DESC;

const reverseSort = (direction: SortDirectionType) =>
	direction === SortDirection.ASC ? SortDirection.DESC : SortDirection.ASC;

const rowClassName = (index: number) => {
	const isEven = index % 2 === 0;
	return cx("codebook__variables-row", {
		"codebook__variables-row--even": isEven,
		"codebook__variables-row--odd": !isEven,
	});
};

type HeadingProps = {
	children: React.ReactNode;
	name: string;
	sortBy: string;
	sortDirection: SortDirectionType;
	onSort: (options: { sortBy: string; sortDirection: SortDirectionType }) => void;
};

const Heading = ({ children, name, sortBy, sortDirection, onSort }: HeadingProps) => {
	const isSorted = name === sortBy;
	const newSortDirection = !isSorted ? SortDirection.ASC : reverseSort(sortDirection);
	const sortClasses = cx("sort-direction", {
		"sort-direction--asc": sortDirection === SortDirection.ASC,
		"sort-direction--desc": sortDirection === SortDirection.DESC,
	});

	return (
		<th
			className="codebook__variables-heading"
			onClick={() => onSort({ sortBy: name, sortDirection: newSortDirection })}
		>
			{children}
			{isSorted && <div className={sortClasses} />}
		</th>
	);
};

type UsageItem = {
	label: string;
	id?: string;
};

type Variable = {
	id: string;
	name: string;
	component: string;
	inUse: boolean;
	usage: UsageItem[];
	usageString?: string;
};

type VariablesProps = {
	entity: string;
	onDelete?: (id: string) => void;
	sort: (options: { sortBy: string; sortDirection: SortDirectionType }) => void;
	sortBy: string;
	sortDirection: SortDirectionType;
	type?: string;
	variables?: Variable[];
};

const Variables = ({
	variables = [],
	onDelete = () => {},
	sortBy,
	sortDirection,
	sort,
	type: _type,
}: VariablesProps) => {
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
						<Heading
							name="component"
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...headingProps}
						>
							Input control
						</Heading>
						<Heading
							name="usageString"
							// eslint-disable-next-line react/jsx-props-no-spreading
							{...headingProps}
						>
							Used In
						</Heading>
						<th />
						<th />
					</tr>
				</thead>
				<tbody>
					{variables.map(({ id, component, inUse, usage }, index) => (
						<tr className={rowClassName(index)} key={id}>
							<td className="codebook__variables-column">
								<EditableVariablePill uuid={id} />
							</td>
							<td className="codebook__variables-column">{component}</td>
							<td className="codebook__variables-column codebook__variables-column--usage">
								<UsageColumn inUse={inUse} usage={usage} />
							</td>
							<td className="codebook__variables-column codebook__variables-column--control">
								<ControlsColumn onDelete={onDelete} inUse={inUse} id={id} />
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
};

type WithVariableHandlersProps = {
	deleteVariable: (params: { entity: string; type?: string; variable: string }) => void;
	openDialog: (dialog: unknown) => void;
	entity: string;
	type?: string;
	variables: Variable[];
};

const withVariableHandlers = compose(
	connect(null, {
		openDialog: dialogActionCreators.openDialog,
		deleteVariable: deleteVariableAsync,
	}),
	withHandlers<WithVariableHandlersProps, { onDelete: (id: string) => void }>({
		onDelete:
			({ deleteVariable, openDialog, entity, type, variables }: WithVariableHandlersProps) =>
			(id: string) => {
				const variable = variables.find((v: Variable) => v.id === id);
				const { name } = variable || { name: "Unknown" };

				openDialog({
					type: "Warning",
					title: `Delete ${name}`,
					message: <p>Are you sure you want to delete the variable called {name}? This cannot be undone.</p>,
					onConfirm: () => deleteVariable({ entity, type, variable: id }),
					confirmLabel: `Delete ${name}`,
				});
			},
	}),
);

const homogenizedProp = (item: Variable, prop: string) => {
	const v = get(item, prop, "");
	if (!isString(v)) {
		return v;
	}
	return v.toUpperCase();
};

const sortByProp = (sortBy: string) => (a: Variable, b: Variable) => {
	const sortPropA = homogenizedProp(a, sortBy);
	const sortPropB = homogenizedProp(b, sortBy);
	if (sortPropA < sortPropB) {
		return -1;
	}
	if (sortPropA > sortPropB) {
		return 1;
	}
	return 0;
};

const sort = (sortBy: string) => (list: Variable[]) => list.sort(sortByProp(sortBy));

const reverse =
	(sortDirection: SortDirectionType = SortDirection.ASC) =>
	(list: Variable[]) =>
		sortDirection === SortDirection.DESC ? [...list].reverse() : list;

type WithSortProps = {
	sortBy: string;
	sortDirection: SortDirectionType;
	variables: Variable[];
};

type WithSortOutput = {
	variables: Variable[];
};

const withSort = compose(
	withStateHandlers(
		{
			sortBy: "name",
			sortDirection: SortDirection.ASC,
		},
		{
			sort:
				() =>
				({ sortBy, sortDirection }: { sortBy: string; sortDirection: SortDirectionType }) => ({
					sortBy,
					sortDirection,
				}),
		},
	),
	withProps<WithSortOutput, WithSortProps>(({ sortBy, sortDirection, variables }: WithSortProps) => {
		const sorted = sort(sortBy)(variables);
		const reversed = reverse(sortDirection)(sorted);
		return {
			variables: reversed,
		};
	}),
);

export { Heading, rowClassName, SortDirection, withSort };

export default compose<ComponentProps<typeof Variables>, typeof Variables>(withVariableHandlers, withSort)(Variables);
