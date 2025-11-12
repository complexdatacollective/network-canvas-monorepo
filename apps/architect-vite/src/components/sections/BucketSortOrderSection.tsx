import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { v4 } from "uuid";
import EditableList from "~/components/EditableList";
import { Section } from "~/components/EditorLayout";
import MultiSelectPreview from "~/components/Form/MultiSelectPreview";
import Tip from "~/components/Tip";

type BucketSortOrderSectionProps = {
	form: string;
	disabled?: boolean;
	maxItems?: number;
	optionGetter: () => any;
	summary?: React.ReactNode;
};

const getDefaultSummary = () => (
	<p>
		Nodes are stacked in the bucket before they are placed by the participant. You may optionally configure a list of
		rules to determine how nodes are sorted in the bucket when the task starts, which will determine the order that your
		participant places them into bins. Interviewer will default to using the order in which nodes were named.
	</p>
);

const BucketSortOrderSection = ({
	form,
	disabled = false,
	maxItems = 5,
	optionGetter,
	summary = getDefaultSummary(),
}: BucketSortOrderSectionProps) => {
	const dispatch = useDispatch();
	const formSelector = useMemo(() => formValueSelector(form), [form]);
	const hasBucketSortOrder = useSelector((state) => formSelector(state, "bucketSortOrder"));

	const handleToggleChange = (nextState) => {
		if (nextState === false) {
			dispatch(change(form, "bucketSortOrder", null));
		}

		return true;
	};

	return (
		<Section
			title="Bucket Sort Order"
			summary={summary}
			toggleable
			disabled={disabled}
			startExpanded={!!hasBucketSortOrder}
			handleToggleChange={handleToggleChange}
			layout="vertical"
		>
			<Tip>
				<p>Use the asterisk property to sort by the order that nodes were created.</p>
			</Tip>
			<EditableList
				form={form}
				fieldName="bucketSortOrder"
				inlineEditing={true}
				maxItems={maxItems}
				sortable={true}
				title="Bucket Sort Order"
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
		</Section>
	);
};

export default BucketSortOrderSection;
