import { get } from "es-toolkit/compat";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose, defaultProps } from "recompose";
import { change, Field, getFormValues } from "redux-form";
import { Filter as FilterQuery, ruleValidator, withFieldConnector, withStoreConnector } from "~/components/Query";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import type { RootState } from "~/ducks/modules/root";
import Section from "../../EditorLayout/Section";
import { handleFilterDeactivate } from "../Filter";

const FilterField = (
	withFieldConnector as unknown as (c: React.ComponentType) => React.ComponentType<Record<string, unknown>>
)(
	withStoreConnector(FilterQuery as unknown as React.ComponentType) as unknown as React.ComponentType,
) as React.ComponentType<Record<string, unknown>>;

type NetworkFilterProps = {
	form: string;
	hasFilter: boolean;
	changeField: (form: string, name: string, value: unknown) => void;
	openDialog: (dialog: Record<string, unknown>) => Promise<boolean>;
	name: string;
	variant?: "contrast";
};

const NetworkFilter = ({ form, hasFilter, changeField, openDialog, name, variant }: NetworkFilterProps) => {
	const handleToggleChange = useCallback(
		async (newStatus: boolean) => {
			if (newStatus === true) {
				return Promise.resolve(true);
			}

			if (hasFilter) {
				const result = await handleFilterDeactivate(() => openDialog({} as Record<string, unknown>));

				if (!result) {
					return Promise.resolve(false);
				}
			}

			changeField(form, name, null);
			return Promise.resolve(true);
		},
		[openDialog, changeField, form, hasFilter, name],
	);

	const contrastProps =
		variant === "contrast"
			? {
					className: "bg-slate-blue-dark p-4 rounded-md text-white [--text-dark:white]",
					layout: "vertical" as "vertical" | "horizontal",
				}
			: {};

	return (
		<Section
			title="Filter"
			toggleable
			summary={<p>You can optionally filter which nodes are shown on in this panel.</p>}
			startExpanded={!!hasFilter}
			handleToggleChange={handleToggleChange}
			{...contrastProps}
		>
			<Field name={name} component={FilterField} validate={ruleValidator} />
		</Section>
	);
};

const mapStateToProps = (state: RootState, props: { form: string; name: string }) => ({
	hasFilter: get(getFormValues(props.form)(state), props.name, null) !== null,
});

const mapDispatchToProps = {
	openDialog: dialogActions.openDialog,
	changeField: change,
};

type OuterProps = {
	form: string;
	name?: string;
	variant?: "contrast";
};

export default compose<ComponentProps<typeof NetworkFilter>, OuterProps>(
	defaultProps({ name: "filter" }),
	connect(mapStateToProps, mapDispatchToProps),
)(NetworkFilter);
