import { get } from "es-toolkit/compat";
import type { ComponentProps } from "react";
import { Row, Section } from "~/components/EditorLayout";
import RadioGroup from "~/components/Form/Fields/RadioGroup";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import IssueAnchor from "~/components/IssueAnchor";
import Audio from "../../Form/Fields/Audio";
import Image from "../../Form/Fields/Image";
import Video from "../../Form/Fields/Video";
import ValidatedField from "../../Form/ValidatedField";
import { typeOptions } from "./options";
import withItemHandlers from "./withItemHandlers";

const contentInputs = {
	text: RichText,
	image: Image,
	audio: Audio,
	video: Video,
};

const getInputComponent = (type: string) => get(contentInputs, type, RichText);

type ItemEditorProps = {
	type?: string;
	handleChangeType: (value: string) => void;
};

const ItemEditor = ({ type, handleChangeType }: ItemEditorProps) => (
	<>
		<Section title="Type" layout="vertical">
			<Row>
				<IssueAnchor fieldName="type" description="Content Type" />
				<ValidatedField
					name="type"
					component={RadioGroup}
					validation={{ required: true }}
					componentProps={{
						options: typeOptions,
					}}
					onChange={
						((_, value) => handleChangeType(value as string)) as ComponentProps<typeof ValidatedField>["onChange"]
					}
				/>
			</Row>
		</Section>
		{type && (
			<Section title="Content" layout="vertical">
				<Row disabled={!type}>
					<IssueAnchor fieldName="content" description="Content" />
					<ValidatedField name="content" component={getInputComponent(type)} validation={{ required: true }} />
				</Row>
			</Section>
		)}
	</>
);

export default withItemHandlers(
	ItemEditor as unknown as React.ComponentType<unknown>,
) as unknown as React.ComponentType<{ form: string }>;
