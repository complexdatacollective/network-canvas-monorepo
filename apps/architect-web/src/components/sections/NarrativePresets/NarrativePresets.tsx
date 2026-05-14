import { isEmpty, omit } from "es-toolkit/compat";
import { compose } from "react-recompose";
import { Section } from "~/components/EditorLayout";
import type { StageEditorSectionProps } from "~/components/StageEditor/Interfaces";
import EditableList from "../../EditableList";
import withDisabledSubjectRequired from "../../enhancers/withDisabledSubjectRequired";
import withSubject from "../../enhancers/withSubject";
import PresetFields from "./PresetFields";
import PresetPreview from "./PresetPreview";

const normalizePreset = (values: Record<string, unknown>) => {
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

type NarrativePresetsProps = StageEditorSectionProps & {
	entity?: string;
	type?: string;
	disabled?: boolean;
	disabledMessage?: string;
};

const NarrativePresets = ({ form, entity, type, disabled, disabledMessage }: NarrativePresetsProps) => (
	<Section
		disabled={disabled}
		disabledMessage={disabledMessage}
		summary={
			<p>
				Add one or more &quot;presets&quot; below, to create different visualizations that you can switch between within
				the interview.
			</p>
		}
		title="Narrative Presets"
	>
		<EditableList
			previewComponent={PresetPreview as React.ComponentType<Record<string, unknown>>}
			editComponent={PresetFields}
			title="Edit Preset"
			fieldName="presets"
			template={template}
			normalize={normalizePreset as (value: unknown) => unknown}
			form={form}
			editProps={{ entity, type }}
		/>
	</Section>
);

export default compose<NarrativePresetsProps, StageEditorSectionProps>(
	withSubject,
	withDisabledSubjectRequired,
)(NarrativePresets);
