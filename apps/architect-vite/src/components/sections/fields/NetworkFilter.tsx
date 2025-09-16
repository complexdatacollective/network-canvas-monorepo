import { get } from "es-toolkit/compat";
import { useCallback } from "react";
import { connect } from "react-redux";
import { compose, defaultProps } from "recompose";
import { Field, change, getFormValues } from "redux-form";
import { Filter as FilterQuery, ruleValidator, withFieldConnector, withStoreConnector } from "~/components/Query";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import Section from "../../EditorLayout/Section";
import { handleFilterDeactivate } from "../Filter";

const FilterField = withFieldConnector(withStoreConnector(FilterQuery));

type NetworkFilterProps = {
	form: string;
	hasFilter: boolean;
	changeField: (form: string, name: string, value: unknown) => void;
	openDialog: (dialog: Record<string, unknown>) => Promise<boolean>;
	name: string;
};

const NetworkFilter = ({ form, hasFilter, changeField, openDialog, name }: NetworkFilterProps) => {
	const handleToggleChange = useCallback(
		async (newStatus) => {
			if (newStatus === true) {
				return Promise.resolve(true);
			}

			if (hasFilter) {
				const result = await handleFilterDeactivate(openDialog);

				if (!result) {
					return Promise.resolve(false);
				}
			}

			changeField(form, name, null);
			return Promise.resolve(true);
		},
		[openDialog, changeField],
	);

	return (
		<Section
			title="Filter"
			toggleable
			summary={<p>You can optionally filter which nodes are shown on in this panel.</p>}
			startExpanded={!!hasFilter}
			handleToggleChange={handleToggleChange}
		>
			<Field name={name} component={FilterField} validate={ruleValidator} />
		</Section>
	);
};

const mapStateToProps = (state, props) => ({
	hasFilter: get(getFormValues(props.form)(state), props.name, null) !== null,
});

const mapDispatchToProps = {
	openDialog: dialogActions.openDialog,
	changeField: change,
};

export default compose(defaultProps({ name: "filter" }), connect(mapStateToProps, mapDispatchToProps))(NetworkFilter);
