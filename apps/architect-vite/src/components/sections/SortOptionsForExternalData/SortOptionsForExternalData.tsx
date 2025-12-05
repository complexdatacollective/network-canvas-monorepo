import type { VariableOption } from "@codaco/protocol-validation";
import { useSelector } from "react-redux";
import { compose } from "recompose";
import type { FormAction } from "redux-form";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import withDisabledAssetRequired from "~/components/enhancers/withDisabledAssetRequired";
import withMapFormToProps from "~/components/enhancers/withMapFormToProps";
import { Text } from "~/components/Form/Fields";
import MultiSelect from "~/components/Form/MultiSelect";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import { useAppDispatch } from "~/ducks/hooks";
import type { RootState } from "~/ducks/modules/root";
import useVariablesFromExternalData from "~/hooks/useVariablesFromExternalData";
import getSortOrderOptionGetter from "./getSortOrderOptionGetter";
import getVariableOptionsGetter from "./getVariableOptionsGetter";

type SortOptionsProps = StageEditorSectionProps & {
	dataSource: string;
	disabled: boolean;
};

const SortOptions = ({ dataSource, disabled }: SortOptionsProps) => {
	const { variables: variableOptions } = useVariablesFromExternalData(dataSource, true);
	const variableOptionsGetter = getVariableOptionsGetter(variableOptions);
	const maxVariableOptions = variableOptions.length;
	const sortOrderOptionGetter = getSortOrderOptionGetter(variableOptions);

	const dispatch = useAppDispatch();
	const getFormValue = formValueSelector("edit-stage");
	const hasSortOrder = useSelector((state: RootState) => getFormValue(state, "sortOptions.sortOrder"));
	const hasSortableProperties = useSelector((state: RootState) =>
		getFormValue(state, "sortOptions.sortableProperties"),
	);

	const handleToggleSortOptions = (nextState: boolean) => {
		if (nextState === false) {
			dispatch(change("edit-stage", "sortOptions", null) as unknown as FormAction);
		}

		return true;
	};

	return (
		<Section
			title="Sort Options"
			summary={
				<p>
					Your roster will be presented to the interview participant as a list of cards. You may configure the sort
					options of this list, including which attributes are available for the participant to sort by during the
					interview.
				</p>
			}
			toggleable
			startExpanded={!!hasSortOrder || !!hasSortableProperties}
			handleToggleChange={handleToggleSortOptions}
			disabled={disabled}
		>
			<Row>
				<h4>Initial Sort Order</h4>
				<p>
					Create one or more rules to determine the default sort order or the roster, when it is first shown to the
					participant. By default, Interviewer will use the order that nodes are defined in your data file.
				</p>
				<MultiSelect
					name="sortOptions.sortOrder"
					maxItems={1}
					properties={[{ fieldName: "property" }, { fieldName: "direction" }]}
					options={sortOrderOptionGetter}
				/>
			</Row>
			<Row>
				<h4>Participant Sortable Properties</h4>
				<p>
					This interface allows the participant to sort the roster, to help with locating a specific member. Select one
					or more attributes from your roster that the participant can use to sort the list.
				</p>
				<MultiSelect
					name="sortOptions.sortableProperties"
					maxItems={maxVariableOptions}
					properties={[
						{ fieldName: "variable" },
						{
							fieldName: "label",
							component: Text,
							placeholder: "Label",
						},
					]}
					options={(
						_property: unknown,
						_rowValues: unknown,
						allValues: Array<Record<string, unknown>>,
					): VariableOption[] => variableOptionsGetter(_property, _rowValues, allValues)}
				/>
			</Row>
		</Section>
	);
};

export default compose<SortOptionsProps, StageEditorSectionProps>(
	withMapFormToProps("dataSource"),
	withDisabledAssetRequired,
)(SortOptions);
