import type { UnknownAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import withDisabledAssetRequired from "~/components/enhancers/withDisabledAssetRequired";
import withMapFormToProps from "~/components/enhancers/withMapFormToProps";
import { Text } from "~/components/Form/Fields";
import MultiSelect from "~/components/Form/MultiSelect";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import type { RootState } from "~/ducks/modules/root";
import useVariablesFromExternalData from "~/hooks/useVariablesFromExternalData";
import Tip from "../../Tip";
import getVariableOptionsGetter from "../SortOptionsForExternalData/getVariableOptionsGetter";

type CardDisplayOptionsProps = {
	dataSource: string;
	disabled: boolean;
};

const CardDisplayOptions = ({ dataSource, disabled }: CardDisplayOptionsProps) => {
	const { variables: variableOptions } = useVariablesFromExternalData(dataSource, true);
	const variableOptionsGetter = getVariableOptionsGetter(variableOptions);
	const maxVariableOptions = variableOptions.length;

	const dispatch = useDispatch();
	const getFormValue = formValueSelector("edit-stage");
	const hasCardDisplayOptions = useSelector((state: RootState) =>
		getFormValue(state, "cardOptions.additionalProperties"),
	);

	const handleToggleCardDisplayOptions = (nextState: boolean) => {
		if (nextState === false) {
			dispatch(change("edit-stage", "cardOptions.additionalProperties", null) as unknown as UnknownAction);
		}

		return true;
	};

	return (
		<Section
			title="Card Display Options"
			summary={
				<p>
					This section controls how the cards (which represent each item in your roster data file) are displayed to the
					participant.
				</p>
			}
			toggleable
			startExpanded={!!hasCardDisplayOptions}
			handleToggleChange={handleToggleCardDisplayOptions}
			disabled={disabled}
		>
			<Row>
				<Tip>
					<p>
						Cards will use the <strong>name</strong> attribute from your external data as the main card title.
					</p>
				</Tip>
			</Row>
			<Row>
				<h4>Additional Display Properties</h4>
				<p>Would you like to display any other attributes to help the participant recognize a roster alter?</p>
				{maxVariableOptions === 0 && (
					<p>
						<em>Your external data does not seem to contain any usable attributes. Is it correctly formatted?</em>
					</p>
				)}
				{maxVariableOptions > 0 && (
					<MultiSelect
						name="cardOptions.additionalProperties"
						maxItems={maxVariableOptions}
						properties={[
							{
								fieldName: "variable",
							},
							{
								fieldName: "label",
								component: Text,
								placeholder: "Label",
							},
						]}
						options={variableOptionsGetter}
					/>
				)}
			</Row>
		</Section>
	);
};

export default compose(
	withMapFormToProps("dataSource"),
	withDisabledAssetRequired,
)(CardDisplayOptions) as unknown as React.ComponentType<StageEditorSectionProps>;
