import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { change, formValueSelector } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import * as Fields from "~/components/Form/Fields";
import DetachedField from "../../DetachedField";

type RemoveAfterConsiderationProps = {
	form: string;
};

const FORM_PROPERTY = "behaviours.removeAfterConsideration";

const RemoveAfterConsideration = ({ form }: RemoveAfterConsiderationProps) => {
	const dispatch = useDispatch();
	const formSelector = useMemo(() => formValueSelector(form), [form]);
	const formValue = useSelector((state) => !!formSelector(state, FORM_PROPERTY));

	const [removeAfterConsideration, setRemoveAfterConsideration] = useState(formValue);

	const handleChooseRemoveAfterConsideration = () => {
		if (removeAfterConsideration) {
			dispatch(change("edit-stage", FORM_PROPERTY, false));
			setRemoveAfterConsideration(false);
			return;
		}

		dispatch(change("edit-stage", FORM_PROPERTY, true));
		setRemoveAfterConsideration(true);
	};
	return (
		<Section
			title="Remove After Consideration"
			summary={
				<p>
					This toggle determines if a node should continue to be shown in the bin after it has been the main focal node.
					If it is set to true, the node will be removed from the pool after it has been shown in the primary position
					for consideration.
				</p>
			}
		>
			<Row>
				<DetachedField
					component={Fields.Boolean}
					onChange={handleChooseRemoveAfterConsideration}
					value={removeAfterConsideration}
					validation={{ required: true }}
					options={[
						{
							value: true,
							label: "Yes",
						},
						{
							value: false,
							label: "No",
						},
					]}
					noReset
				/>
			</Row>
		</Section>
	);
};

export default RemoveAfterConsideration;
