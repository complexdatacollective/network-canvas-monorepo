import { useCallback, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { v4 } from "uuid";
import { Row, Section } from "~/components/EditorLayout";
import EditableList from "~/components/EditableList";
import MultiSelectPreview from "~/components/Form/MultiSelectPreview";
import withDisabledAssetRequired from "~/components/enhancers/withDisabledAssetRequired";
import withMapFormToProps from "~/components/enhancers/withMapFormToProps";
import useVariablesFromExternalData from "~/hooks/useVariablesFromExternalData";
import { Text } from "~/components/Form/Fields";
import getSortOrderOptionGetter from "./getSortOrderOptionGetter";
import getVariableOptionsGetter from "./getVariableOptionsGetter";

type SortOptionsProps = {
	dataSource: string;
	disabled: boolean;
};

const SortOptions = ({ dataSource, disabled }: SortOptionsProps) => {
	const { variables: variableOptions } = useVariablesFromExternalData(dataSource, true);
	const variableOptionsGetter = useMemo(() => getVariableOptionsGetter(variableOptions), [variableOptions]);
	const maxVariableOptions = variableOptions.length;
	const sortOrderOptionGetter = useMemo(() => getSortOrderOptionGetter(variableOptions), [variableOptions]);

	const dispatch = useDispatch();
	const getFormValue = formValueSelector("edit-stage");
	const hasSortOrder = useSelector((state) => getFormValue(state, "sortOptions.sortOrder"));
	const hasSortableProperties = useSelector((state) => getFormValue(state, "sortOptions.sortableProperties"));

	const handleToggleSortOptions = useCallback(
		(nextState) => {
			if (nextState === false) {
				dispatch(change("edit-stage", "sortOptions", null));
			}

			return true;
		},
		[dispatch],
	);

	// Memoize preview components to prevent unnecessary re-renders
	const SortOrderPreviewComponent = useMemo(
		() => (props) => (
			<MultiSelectPreview {...props} properties={[{ fieldName: "property" }, { fieldName: "direction" }]} options={sortOrderOptionGetter} />
		),
		[sortOrderOptionGetter],
	);

	const SortablePropertiesPreviewComponent = useMemo(
		() => (props) => (
			<MultiSelectPreview
				{...props}
				properties={[
					{ fieldName: "variable" },
					{
						fieldName: "label",
						component: Text,
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
				<EditableList
					form="edit-stage"
					fieldName="sortOptions.sortOrder"
					inlineEditing={true}
					maxItems={1}
					sortable={true}
					title="Sort Order"
					previewComponent={SortOrderPreviewComponent}
					template={() => ({ id: v4() })}
					normalize={normalizeItems}
					validation={{}}
				/>
			</Row>
			<Row>
				<h4>Participant Sortable Properties</h4>
				<p>
					This interface allows the participant to sort the roster, to help with locating a specific member. Select one
					or more attributes from your roster that the participant can use to sort the list.
				</p>
				<EditableList
					form="edit-stage"
					fieldName="sortOptions.sortableProperties"
					inlineEditing={true}
					maxItems={maxVariableOptions}
					sortable={true}
					title="Sortable Property"
					previewComponent={SortablePropertiesPreviewComponent}
					template={() => ({ id: v4() })}
					normalize={normalizeItems}
					validation={{}}
				/>
			</Row>
		</Section>
	);
};

export { SortOptions };

export default compose(withMapFormToProps("dataSource"), withDisabledAssetRequired)(SortOptions);
