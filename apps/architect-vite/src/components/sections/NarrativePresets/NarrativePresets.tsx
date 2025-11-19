import { isEmpty, omit } from "lodash";
import { compose } from "recompose";
import { Section } from "~/components/EditorLayout";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PresetFields from "./PresetFields";
import PresetPreview from "./PresetPreview";

const normalizePreset = (values) => {
	if (isEmpty(values.groupVariable)) {
		return omit(values, ["groupVariable"]);
	}
	return values;
};

const template = () => ({
	layoutVariable: null,
	groupVariable: null,
	edges: {
		display: [],
	},
	highlight: [],
});

type NarrativePresetsProps = {
	form: string;
	entity?: string;
	type?: string;
	disabled?: boolean;
};

const NarrativePresets = ({ form, entity, type, disabled }: NarrativePresetsProps) => (
	<Section
		disabled={disabled}
		summary={
			<p>
				Add one or more &quot;presets&quot; below, to create different visualizations that you can switch between within
				the interview.
			</p>
		}
		title="Narrative Presets"
	>
		<EditableList
			previewComponent={PresetPreview}
			editComponent={PresetFields}
			title="Edit Preset"
			fieldName="presets"
			template={template}
			normalize={normalizePreset}
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export { NarrativePresets };

export default compose(withSubject, withDisabledSubjectRequired)(NarrativePresets as React.ComponentType<unknown>);
