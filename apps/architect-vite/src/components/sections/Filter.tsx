import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, Field, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { getFieldId } from "../../utils/issues";
import { Filter as FilterQuery, ruleValidator, withFieldConnector, withStoreConnector } from "../Query";
import Tip from "../Tip";
import getEdgeFilteringWarning from "./SociogramPrompts/utils";

const FilterField = withFieldConnector(withStoreConnector(FilterQuery));

export const handleFilterDeactivate = async (openDialog) => {
	const result = await openDialog({
		type: "Warning",
		title: "This will clear your filter",
		message: "This will clear your filter, and delete any rules you have created. Do you want to continue?",
		confirmLabel: "Clear filter",
	});

	return result;
};

const Filter = () => {
	const getFormValue = formValueSelector("edit-stage");
	const dispatch = useDispatch();
	const currentValue = useSelector((state) => getFormValue(state, "filter"));
	const openDialog = useCallback((dialog) => dispatch(dialogActions.openDialog(dialog)), [dispatch]);

	// get edge creation and display values for edges across all prompts
	const prompts = useSelector((state) => getFormValue(state, "prompts"));

	const { edgeCreationValues, edgeDisplayValues } = useMemo(() => {
		if (!prompts) return { edgeCreationValues: [], edgeDisplayValues: [] };
		const creationValues = [];
		const displayValues = [];
		prompts.forEach((prompt) => {
			if (prompt?.edges?.create) creationValues.push(prompt.edges.create);
			if (prompt?.edges?.display) displayValues.push(...prompt.edges.display);
		});
		return { edgeCreationValues: creationValues, edgeDisplayValues: displayValues };
	}, [prompts]);
	const shouldShowWarning = useMemo(() => {
		if (edgeCreationValues.length > 0 || edgeDisplayValues.length > 0) {
			return getEdgeFilteringWarning(currentValue?.rules || [], [...edgeCreationValues, ...edgeDisplayValues]);
		}
		return false;
	}, [currentValue, edgeCreationValues, edgeDisplayValues]);

	const handleToggleChange = useCallback(
		async (newState) => {
			if (!currentValue || newState === true) {
				return true;
			}

			const confirm = await handleFilterDeactivate(openDialog);

			if (confirm) {
				dispatch(change("edit-stage", "filter", null));
				return true;
			}

			return false;
		},
		[dispatch, openDialog, currentValue],
	);

	return (
		<Section
			title="Filter"
			toggleable
			summary={
				<p>
					You can optionally filter which nodes or edges are shown on this stage, by creating one or more rules using
					the options below.
				</p>
			}
			startExpanded={!!currentValue}
			handleToggleChange={handleToggleChange}
			layout="vertical"
		>
			{shouldShowWarning && (
				<Tip type="warning">
					<p>
						This stage has edge creation or display values that will not be shown based on the current filter rules.
					</p>
				</Tip>
			)}
			<div id={getFieldId("filter")} data-name="Filter text" />
			<Field name="filter" component={FilterField} validate={ruleValidator} />
		</Section>
	);
};

export default Filter;
