import { get, isString } from "es-toolkit/compat";
import type { ComponentProps } from "react";
import { compose, withHandlers, withProps, withStateHandlers } from "react-recompose";
import { connect } from "react-redux";
import { actionCreators as dialogActionCreators } from "~/ducks/modules/dialogs";
import { deleteVariableAsync } from "~/ducks/modules/protocol/codebook";
import { cx } from "~/utils/cva";
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

const rowClassName = (index: number) => (index % 2 === 0 ? "bg-surface-3" : "");

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
	const sortClasses = cx(
		"ml-(--space-sm) relative inline-block size-(--space-md)",
		"after:block after:absolute after:text-xl after:-top-[0.15rem] after:text-action",
		sortDirection === SortDirection.ASC ? 'after:[content:"\\25BE"]' : 'after:[content:"\\25B4"]',
	);

	return (
		<th
			className="m-0 px-(--space-sm) py-(--space-md) text-base align-middle text-left normal-case"
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
			<table className="mt-(--space-lg) w-full">
				<thead>
					<tr className="border-b-[0.2rem] border-divider">
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
							<td className="m-0 px-(--space-sm) py-(--space-md) text-base">
								<EditableVariablePill uuid={id} width="25rem" />
							</td>
							<td className="m-0 px-(--space-sm) py-(--space-md) text-base">{component}</td>
							<td className="m-0 px-(--space-sm) py-(--space-md) text-base">
								<UsageColumn inUse={inUse} usage={usage} />
							</td>
							<td className="m-0 px-(--space-sm) py-(--space-md) text-base">
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
