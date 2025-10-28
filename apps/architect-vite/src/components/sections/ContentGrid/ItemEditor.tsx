import { get } from "es-toolkit/compat";
import { Row, Section } from "~/components/EditorLayout";
import RadioGroup from "~/components/Form/Fields/RadioGroup";
import { Field as RichText } from "~/components/Form/Fields/RichText";
import { getFieldId } from "../../../utils/issues";
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

const getInputComponent = (type) => get(contentInputs, type, RichText);

type ItemEditorProps = {
	type?: string;
	handleChangeType: (value: string) => void;
};

const ItemEditor = ({ type, handleChangeType }: ItemEditorProps) => (
	<>
		<Section title="Type" layout="vertical">
			<Row>
				<div id={getFieldId("type")} data-name="Content Type" />
				<ValidatedField
					name="type"
					component={RadioGroup}
					options={typeOptions}
					validation={{ required: true }}
					onChange={handleChangeType}
				/>
			</Row>
		</Section>
		{type && (
			<Section title="Content" layout="vertical">
				<Row disabled={!type}>
					<div id={getFieldId("content")} />
					<ValidatedField name="content" component={getInputComponent(type)} validation={{ required: true }} />
				</Row>
			</Section>
		)}
	</>
);

export default withItemHandlers(ItemEditor);
