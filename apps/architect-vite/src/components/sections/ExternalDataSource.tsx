import { connect } from "react-redux";
import { compose } from "recompose";
import { change } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import { getFieldId } from "../../utils/issues";
import DataSource from "../Form/Fields/DataSource";
import ValidatedField from "../Form/ValidatedField";
import withDisabledSubjectRequired from "../enhancers/withDisabledSubjectRequired";
import withSubject from "../enhancers/withSubject";

const withChangeDataSourceHandler = connect(null, { changeForm: change });

type ExternalDataSourceProps = {
	changeForm: (form: string, field: string, value: any) => void;
} & Record<string, any>;

const ExternalDataSource = (props: ExternalDataSourceProps) => {
	const handleChangeDataSource = () => {
		props.changeForm("edit-stage", "cardOptions", {});
		props.changeForm("edit-stage", "sortOptions", {});
	};

	return (
		<Section
			title="Data source for Roster"
			summary={<p>This stage needs a source of nodes to populate the roster. Select a network data file to use.</p>}
			// eslint-disable-next-line react/jsx-props-no-spreading
			{...props}
		>
			<Row>
				<div id={getFieldId("dataSource")} data-name="Roster data-source" />
				<ValidatedField
					component={DataSource}
					name="dataSource"
					id="dataSource"
					validation={{ required: true }}
					onChange={handleChangeDataSource}
				/>
			</Row>
		</Section>
	);
};

export { ExternalDataSource };

export default compose(withChangeDataSourceHandler, withSubject, withDisabledSubjectRequired)(ExternalDataSource);
