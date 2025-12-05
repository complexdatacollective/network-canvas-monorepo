import AssignAttributes from "~/components/AssignAttributes";
import { Row, Section } from "~/components/EditorLayout";
import PromptText from "~/components/sections/PromptText";

type PromptFieldsProps = {
	form: string;
	entity: string | null;
	type: string | null;
};

const PromptFields = ({ form, entity = null, type = null }: PromptFieldsProps) => {
	return (
		<>
			<PromptText />
			<Section
				title="Assign Additional Variables"
				summary={
					<p>
						This feature allows you to assign a variable and associated value to any nodes created on this prompt. You
						could then use this variable in your skip logic or stage filtering rules.
					</p>
				}
				layout="vertical"
			>
				<Row>
					{entity && type && (
						<AssignAttributes
							form={form}
							name="additionalAttributes"
							type={type}
							entity={entity as "node" | "edge" | "ego"}
						/>
					)}
				</Row>
			</Section>
		</>
	);
};

export default PromptFields;
