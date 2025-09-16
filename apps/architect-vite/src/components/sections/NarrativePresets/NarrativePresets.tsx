import { compose } from "recompose";
import { omit, isEmpty } from "lodash";
import EditableList from "../../EditableList";
import withSubject from "../../enhancers/withSubject";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import PresetPreview from "./PresetPreview";
import PresetFields from "./PresetFields";

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
	<EditableList
		previewComponent={PresetPreview}
		editComponent={PresetFields}
		title="Edit Preset"
		fieldName="presets"
		template={template}
		normalize={normalizePreset}
		sectionTitle="Narrative Presets"
		sectionSummary={
			<p>
				Add one or more &quot;presets&quot; below, to create different visualizations that you can switch between within
				the interview.
			</p>
		}
		form={form}
		disabled={disabled}
		editProps={{ entity, type }}
	/>
);

export { NarrativePresets };

export default compose(withSubject, withDisabledSubjectRequired)(NarrativePresets);
