import * as Fields from "@codaco/ui/lib/components/Fields";
import PropTypes from "prop-types";
import DataSource from "~/src/components/Form/Fields/DataSource";
import ValidatedField from "~/src/components/Form/ValidatedField";
import NetworkFilter from "~/src/components/sections/fields/NetworkFilter";
import { getFieldId } from "~/src/utils/issues";
import Section from "../../EditorLayout/Section";

const NodePanel = ({ fieldId, form }) => (
	<>
		<Section
			title="Panel Title"
			summary={<p>The panel title will be shown above the list of nodes within the panel.</p>}
			id={getFieldId(`${fieldId}.title`)}
		>
			<ValidatedField
				name={`${fieldId}.title`}
				component={Fields.Text}
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

NodePanel.propTypes = {
	fieldId: PropTypes.string.isRequired,
	form: PropTypes.string.isRequired,
};

export default NodePanel;
