import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { getFormValues } from "redux-form";
import timelineImages from "~/images/timeline";
import { getStageIndex } from "~/selectors/protocol";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type) => get(timelineImages, type, timelineImages.Default);

interface StageHeadingProps {
	stageNumber: number;
	type: string;
	id: string;
}

const StageHeading = ({ stageNumber, type }: StageHeadingProps) => {
	const documentationLinkForType = get(getInterface(type), "documentation", null);

	return (
		<div className="w-full grid gap-4 grid-cols-[25%_auto] max-w-6xl my-10">
			<div className="flex items-center gap-4 justify-between">
				<a href={documentationLinkForType}>
					<img
						src={getTimelineImage(type)}
						alt={`${type} interface`}
						title={`${type} interface`}
						className="w-full aspect-auto rounded"
					/>
				</a>
			</div>
			<div className="flex items-center gap-4">
				<div className="rounded-full h-14 w-14 bg-timeline text-timeline-foreground flex items-center justify-center aspect-square">
					{stageNumber}
				</div>
				<h1 className="m-0">Stage Name</h1>
			</div>
		</div>
	);
};

const mapStateToProps = (state, props) => {
	const { id } = props;
	const stageIndex = getStageIndex(state, id);
	const stageNumber = stageIndex !== -1 ? stageIndex + 1 : null;
	const formValues = getFormValues("edit-stage")(state);

	return {
		stageNumber,
		type: get(formValues, "type"),
	};
};

export default connect(mapStateToProps)(StageHeading);
