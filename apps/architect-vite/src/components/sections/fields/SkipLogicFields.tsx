import { Row } from "~/components/EditorLayout";
import RadioGroup from "~/components/Form/Fields/RadioGroup";
import ValidatedField from "~/components/Form/ValidatedField";
import { Query, ruleValidator, withFieldConnector, withStoreConnector } from "~/components/Query";
import { getFieldId } from "../../../utils/issues";
import IssueAnchor from "../../IssueAnchor";

const ConnectedQuery = withFieldConnector(withStoreConnector(Query) as unknown) as React.ComponentType<
	Record<string, unknown>
>;

const SkipLogicFields = () => (
	<>
		<Row>
			<IssueAnchor fieldName={getFieldId("skipLogic.action")} description="Skip Logic Action" />
			<ValidatedField
				name="skipLogic.action"
				component={RadioGroup as React.ComponentType<Record<string, unknown>>}
				validation={{ required: true }}
				componentProps={{
					className: "form-fields-select",
					options: [
						{ value: "SHOW", label: "Show this stage if" },
						{ value: "SKIP", label: "Skip this stage if" },
					],
				}}
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
