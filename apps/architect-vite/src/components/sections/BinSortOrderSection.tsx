import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { v4 } from "uuid";
import { Row, Section } from "~/components/EditorLayout";
import EditableList from "~/components/EditableList";
import MultiSelectPreview from "~/components/Form/MultiSelectPreview";

type BinSortOrderSectionProps = {
	form: string;
	disabled?: boolean;
	maxItems?: number;
	optionGetter: () => any;
	summary?: React.ReactNode;
};

const getDefaultSummary = () => (
	<p>
		You may also configure one or more sort rules that determine the order that nodes are listed after they have been
		placed into a bin.
	</p>
);

const BinSortOrderSection = ({
	form,
	disabled = false,
	maxItems = 5,
	optionGetter,
	summary = getDefaultSummary(),
}: BinSortOrderSectionProps) => {
	const dispatch = useDispatch();
	const getFormValue = formValueSelector(form);
	const hasBinSortOrder = useSelector((state) => getFormValue(state, "binSortOrder"));

	const handleToggleChange = (nextState) => {
		if (nextState === false) {
			dispatch(change(form, "binSortOrder", null));
		}

		return true;
	};

	return (
		<Section
			title="Bin Sort Order"
			summary={summary}
			toggleable
			disabled={disabled}
			startExpanded={!!hasBinSortOrder}
			handleToggleChange={handleToggleChange}
			layout="vertical"
		>
			<Row>
				<EditableList
					form={form}
					fieldName="binSortOrder"
					inlineEditing={true}
					maxItems={maxItems}
					sortable={true}
					title="Bin Sort Order"
					previewComponent={(props) => (
						<MultiSelectPreview
							{...props}
							properties={[{ fieldName: "property" }, { fieldName: "direction" }]}
							options={optionGetter}
						/>
					)}
					template={() => ({ id: v4() })}
					validation={{}}
				/>
			</Row>
		</Section>
	);
};

export default BinSortOrderSection;
