import RadioGroup from "@codaco/legacy-ui/components/Fields/RadioGroup";
import { Field as RichText } from "@codaco/legacy-ui/components/Fields/RichText";
import { get } from "es-toolkit/compat";
import PropTypes from "prop-types";
import { Row, Section } from "~/components/EditorLayout";
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

const ItemEditor = ({ type, handleChangeType }) => (
	<>
		<Section title="Type">
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
			<Section title="Content">
				<Row disabled={!type}>
					<div id={getFieldId("content")} />
					<ValidatedField name="content" component={getInputComponent(type)} validation={{ required: true }} />
				</Row>
			</Section>
		)}
	</>
);

ItemEditor.propTypes = {
	type: PropTypes.string,
	handleChangeType: PropTypes.func.isRequired,
};

ItemEditor.defaultProps = {
	type: null,
};

export default withItemHandlers(ItemEditor);
