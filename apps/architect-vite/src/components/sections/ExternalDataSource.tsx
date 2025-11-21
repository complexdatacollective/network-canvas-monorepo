import { connect } from "react-redux";
import { compose } from "recompose";
import { change } from "redux-form";
import { Row, Section } from "~/components/EditorLayout";
import withDisabledSubjectRequired from "../enhancers/withDisabledSubjectRequired";
import withSubject from "../enhancers/withSubject";
import DataSource from "../Form/Fields/DataSource";
import ValidatedField from "../Form/ValidatedField";
import IssueAnchor from "../IssueAnchor";

const withChangeDataSourceHandler = connect(null, { changeForm: change });

type ExternalDataSourceProps = {
	changeForm: (form: string, field: string, value: unknown) => void;
} & Record<string, unknown>;

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
				<IssueAnchor fieldName="dataSource" description="Roster data-source" />
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

export default compose(
	withChangeDataSourceHandler,
	withSubject,
	withDisabledSubjectRequired,
)(ExternalDataSource as React.ComponentType<unknown>);
