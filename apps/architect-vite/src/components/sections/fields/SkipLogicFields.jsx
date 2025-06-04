import RadioGroup from "@codaco/legacy-ui/components/Fields/RadioGroup";
import { Row } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import { Query, ruleValidator, withFieldConnector, withStoreConnector } from "~/components/Query";
import { getFieldId } from "../../../utils/issues";
import IssueAnchor from "../../IssueAnchor";

const ConnectedQuery = withFieldConnector(withStoreConnector(Query));
const SkipLogicFields = () => (
	<>
		<Row>
			<IssueAnchor fieldName={getFieldId("skipLogic.action")} description="Skip Logic Action" />
			<ValidatedField
				className="form-fields-select"
				component={RadioGroup}
				name="skipLogic.action"
				options={[
					{ value: "SHOW", label: "Show this stage if" },
					{ value: "SKIP", label: "Skip this stage if" },
				]}
				validation={{ required: true }}
			/>
		</Row>
		<Row>
			<IssueAnchor fieldName={getFieldId("skipLogic.filter")} description="Skip Logic Rules" />
			<ValidatedField
				component={ConnectedQuery}
				name="skipLogic.filter"
				validation={{ required: true, validator: ruleValidator }}
			/>
		</Row>
	</>
);

export default SkipLogicFields;
