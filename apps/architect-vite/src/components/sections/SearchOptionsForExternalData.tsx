import { useDispatch, useSelector } from "react-redux";
import { compose } from "recompose";
import { change, formValueSelector } from "redux-form";
import { Section } from "~/components/EditorLayout";
import ValidatedField from "~/components/Form/ValidatedField";
import Tip from "~/components/Tip";
import withDisabledAssetRequired from "~/components/enhancers/withDisabledAssetRequired";
import withMapFormToProps from "~/components/enhancers/withMapFormToProps";
import useVariablesFromExternalData from "~/hooks/useVariablesFromExternalData";
import * as Fields from "~/components/Form/Fields";

type SearchOptionsProps = {
	dataSource: string;
	disabled: boolean;
};

const SearchOptions = ({ dataSource, disabled }: SearchOptionsProps) => {
	const { variables: variableOptions } = useVariablesFromExternalData(dataSource, true);
	const dispatch = useDispatch();
	const getFormValue = formValueSelector("edit-stage");
	const hasSearchOptions = useSelector((state) => getFormValue(state, "searchOptions"));

	const handleToggleSearchOptions = (nextState: boolean) => {
		if (nextState === false) {
			dispatch(change("edit-stage", "searchOptions", null));
		}

		return true;
	};

	return (
		<Section
			title="Search Options"
			toggleable
			handleToggleChange={handleToggleSearchOptions}
			startExpanded={!!hasSearchOptions}
			summary={
				<p>
					To find and select nodes from the roster, the participant will use a search function. This section controls
					how this search function works on this stage.
				</p>
			}
			disabled={disabled}
		>
			<Section
				title="Searchable Attributes"
				summary={
					<p>You can configure which attributes are considered when matching roster nodes to the user&apos;s query.</p>
				}
			>
				<Tip type="info">
					<p>
						The selecting lots of attributes here may slow the performance of the search feature. Select only the
						attributes that participants will search for.
					</p>
				</Tip>
				<ValidatedField
					label="Which attributes should be searchable?"
					name="searchOptions.matchProperties"
					component={Fields.CheckboxGroup}
					options={variableOptions}
					validation={{ minSelected: 1 }}
				/>
			</Section>
			<Section
				title="Search Accuracy"
				summary={
					<p>
						Search accuracy determines how closely the text the participant types must be to an attribute for it to be
						considered a match.
					</p>
				}
			>
				<Tip>
					<p>
						If the roster contains many similar nodes, selecting &quot;Exact&quot; or &quot;High accuracy&quot; will
						help narrow down searches. In contrast, a low accuracy search will allow for typos and spelling mistakes.
					</p>
				</Tip>
				<ValidatedField
					name="searchOptions.fuzziness"
					component={Fields.LikertScale}
					type="ordinal"
					options={[
						{ value: 0.75, label: "Low accuracy" },
						{ value: 0.5, label: "Medium accuracy" },
						{ value: 0.25, label: "High accuracy" },
						{ value: 0, label: "Exact" },
					]}
					validation={{ requiredAcceptsZero: true }}
				/>
			</Section>
		</Section>
	);
};

export { SearchOptions };

export default compose(withMapFormToProps(["dataSource"]), withDisabledAssetRequired)(SearchOptions);
