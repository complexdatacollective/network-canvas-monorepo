import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { v4 } from "uuid";
import { Row, Section } from "~/components/EditorLayout";
import withDisabledAssetRequired from "~/components/enhancers/withDisabledAssetRequired";
import withMapFormToProps from "~/components/enhancers/withMapFormToProps";
import EditableList from "~/components/EditableList";
import MultiSelectPreview from "~/components/Form/MultiSelectPreview";
import useVariablesFromExternalData from "~/hooks/useVariablesFromExternalData";
import * as Fields from "~/components/Form/Fields";
import Tip from "../../Tip";
import getVariableOptionsGetter from "../SortOptionsForExternalData/getVariableOptionsGetter";

interface CardDisplayOptionsProps {
	dataSource: string;
	disabled: boolean;
}

const CardDisplayOptions = ({ dataSource, disabled }: CardDisplayOptionsProps) => {
	const { variables: variableOptions } = useVariablesFromExternalData(dataSource, true);
	const variableOptionsGetter = useMemo(() => getVariableOptionsGetter(variableOptions), [variableOptions]);
	const maxVariableOptions = variableOptions.length;

	const dispatch = useDispatch();
	const getFormValue = formValueSelector("edit-stage");
	const hasCardDisplayOptions = useSelector((state) => getFormValue(state, "cardOptions.additionalProperties"));

	const handleToggleCardDisplayOptions = useCallback(
		(nextState) => {
			if (nextState === false) {
				dispatch(change("edit-stage", "cardOptions.additionalProperties", null));
			}

			return true;
		},
		[dispatch],
	);

	// Memoize the preview component to prevent unnecessary re-renders
	const PreviewComponent = useMemo(
		() => (props) => (
			<MultiSelectPreview
				{...props}
				properties={[
					{
						fieldName: "variable",
					},
					{
						fieldName: "label",
						component: Fields.Text,
						placeholder: "Label",
					},
				]}
				options={variableOptionsGetter}
			/>
		),
		[variableOptionsGetter],
	);

	const normalizeItems = useCallback(
		(items) =>
			Array.isArray(items)
				? items.map((item) => ({
						...item,
						id: item.id || v4(),
					}))
				: items,
		[],
	);

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
					<EditableList
						form="edit-stage"
						fieldName="cardOptions.additionalProperties"
						inlineEditing={true}
						maxItems={maxVariableOptions}
						sortable={true}
						title="Additional Property"
						previewComponent={PreviewComponent}
						template={() => ({ id: v4() })}
						normalize={normalizeItems}
						validation={{}}
					/>
				)}
			</Row>
		</Section>
	);
};

export { CardDisplayOptions };

export default compose(withMapFormToProps("dataSource"), withDisabledAssetRequired)(CardDisplayOptions);
