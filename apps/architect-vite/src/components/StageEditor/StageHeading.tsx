import * as Fields from "@codaco/legacy-ui/components/Fields";
import { get } from "es-toolkit/compat";
import { connect, useSelector } from "react-redux";
import { getFormValues } from "redux-form";
import timelineImages from "~/images/timeline";
import { getStageIndex } from "~/selectors/protocol";
import { getFieldId } from "../../utils/issues";
import ExternalLink from "../ExternalLink";
import { ValidatedField } from "../Form";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type) => get(timelineImages, type, timelineImages.Default);

interface CondensedStageHeadingProps {
	id?: string | null;
}

export const CondensedStageHeading = ({ id = null }: CondensedStageHeadingProps) => {
	const stageIndex = useSelector((state) => getStageIndex(state, id));
	const stageNumber = stageIndex !== -1 ? stageIndex + 1 : null;
	const formValues = useSelector(getFormValues("edit-stage"));
	const type = get(formValues, "type", "");
	const documentationLinkForType = get(getInterface(type), "documentation", null);

	return (
		<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
			<div className="stage-meta">
				<img src={getTimelineImage(type)} alt={`${type} interface`} title={`${type} interface`} />
			</div>
			<div className="stage-name-container">
				<h2>
					{stageNumber && <span>Stage {stageNumber}: </span>} {formValues?.label ?? <em>No Stage Name</em>}
				</h2>
			</div>
			{type && documentationLinkForType && (
				<div className="documentation-link">
					<ExternalLink href={documentationLinkForType}>Documentation for this interface</ExternalLink>
				</div>
			)}
		</div>
	);
};


interface StageHeadingProps {
	stageNumber?: number | null;
	type?: string;
	id?: string;
}

const StageHeading = ({ stageNumber = null, type = "" }: StageHeadingProps) => (
	<div className="stage-heading stage-heading--inline">
		<div className="stage-meta">
			{getTimelineImage(type) && (
				<div className="timeline-preview">
					<img src={getTimelineImage(type)} alt={`${type} interface`} title={`${type} interface`} />
					<div className="timeline-stage__notch">{stageNumber}</div>
				</div>
			)}
			<div className="stage-name-container">
				<div id={getFieldId("label")} data-name="Stage name" />
				<h2>Stage Name</h2>
				<ValidatedField
					name="label"
					component={Fields.Text}
					placeholder="Enter your stage name here"
					className="stage-editor-section-title"
					maxLength="50"
					validation={{ required: true }}
					autoFocus
				/>
			</div>
		</div>
	</div>
);


const mapStateToProps = (state, props) => {
	const { id } = props;
	const stageIndex = getStageIndex(state, id);
	const stageNumber = stageIndex !== -1 ? stageIndex + 1 : null;
	const formValues = getFormValues("edit-stage")(state);

	console.log("StageHeading: mapStateToProps", {
		id,
		stageIndex,
		stageNumber,
		formValues,
	});

	return {
		stageNumber,
		type: get(formValues, "type", ""),
	};
};

export default connect(mapStateToProps)(StageHeading);
