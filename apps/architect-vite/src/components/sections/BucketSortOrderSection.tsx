import { useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import MultiSelect from "~/components/Form/MultiSelect";
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
		rules to determine how nodes are sorted in the bucket when the task starts, which will determine the order that
		your participant places them into bins. Interviewer will default to using the order in which nodes were named.
	</p>
);

const BucketSortOrderSection = ({ form, disabled = false, maxItems = 5, optionGetter, summary = getDefaultSummary() }: BucketSortOrderSectionProps) => {
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
		>
			<Row>
				<Tip>
					<p>Use the asterisk property to sort by the order that nodes were created.</p>
				</Tip>
				<MultiSelect
					name="bucketSortOrder"
					properties={[{ fieldName: "property" }, { fieldName: "direction" }]}
					maxItems={maxItems}
					options={optionGetter}
				/>
			</Row>
		</Section>
	);
};


export default BucketSortOrderSection;
