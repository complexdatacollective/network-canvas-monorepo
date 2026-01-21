import { Field, FormSection } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import { BooleanField } from "~/components/Form/Fields";

const RemoveAfterConsideration = () => (
	<Section
		title="Remove After Consideration"
		summary={
			<p>
				This toggle determines if a node should continue to be shown in the bin after it has been the main focal node.
				If it is set to true, the node will be removed from the pool after it has been shown in the primary position for
				consideration.
			</p>
		}
	>
		<Row>
			<FormSection name="behaviours">
				<Field
					name="removeAfterConsideration"
					component={BooleanField}
					options={[
						{
							value: true,
							label: "Yes, remove after consideration",
						},
						{
							value: false,
							label: "No, keep in bin after consideration",
						},
					]}
					noReset
				/>
			</FormSection>
		</Row>
	</Section>
);

export default RemoveAfterConsideration;
