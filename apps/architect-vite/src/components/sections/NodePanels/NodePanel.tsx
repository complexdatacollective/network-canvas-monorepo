import { Text } from "~/components/Form/Fields";
import DataSource from "~/components/Form/Fields/DataSource";
import ValidatedField from "~/components/Form/ValidatedField";
import NetworkFilter from "~/components/sections/fields/NetworkFilter";
import { getFieldId } from "~/utils/issues";
import Section from "../../EditorLayout/Section";

type NodePanelProps = {
	fieldId: string;
	form: string;
};

const NodePanel = ({ fieldId, form }: NodePanelProps) => (
	<>
		<Section
			title="Panel Title"
			summary={<p>The panel title will be shown above the list of nodes within the panel.</p>}
			id={getFieldId(`${fieldId}.title`)}
			layout="vertical"
			className="bg-slate-blue-dark mt-8"
		>
			<ValidatedField
				name={`${fieldId}.title`}
				component={Text}
				placeholder="Panel title"
				validation={{ required: true }}
			/>
		</Section>
		<Section
			title="Data Source"
			summary={
				<p>
					Choose where the data for this panel should come from (either the in-progress interview session [&quot;People
					you have already named&quot;], or an external network data file that you have added).
				</p>
			}
			id={getFieldId(`${fieldId}.dataSource`)}
			layout="vertical"
			className="bg-slate-blue-dark mt-8"
		>
			<ValidatedField
				component={DataSource}
				name={`${fieldId}.dataSource`}
				validation={{ required: true }}
				canUseExisting
			/>
		</Section>
		<NetworkFilter
			form={form}
			variant="contrast"
			name={`${fieldId}.filter`}
			title="Filter nodes displayed in this panel"
		/>
	</>
);

export default NodePanel;
