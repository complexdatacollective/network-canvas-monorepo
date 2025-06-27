import { get } from "es-toolkit/compat";
import React from "react";
import timelineImages from "~/images/timeline";
import filterIcon from "~/images/timeline/filter-icon.svg";
import skipLogicIcon from "~/images/timeline/skip-logic-icon.svg";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

type EditStageButtonProps = {
	hasFilter?: boolean;
	hasSkipLogic?: boolean;
	label?: string | null;
	onEditStage: () => void;
	type: string;
};

const EditStageButton = React.forwardRef<HTMLDivElement, EditStageButtonProps>(
	({ hasFilter = false, hasSkipLogic = false, label = null, onEditStage, type }, ref) => (
		<div className="timeline-stage__edit-stage" onClick={onEditStage}>
			<div className="timeline-stage__screen" role="button" tabIndex={0} ref={ref}>
				<div className="timeline-stage__screen-preview">
					{getTimelineImage(type) && (
						<img src={getTimelineImage(type)} alt={`${type} interface`} title={`${type} interface`} />
					)}
					{!getTimelineImage(type) && `${type} Interface`}
				</div>
			</div>
			<div className="timeline-stage__meta">
				<h2 className="timeline-stage__title">{label || "\u00A0"}</h2>
				<div className="timeline-stage__icons">
					{hasFilter && (
						<div className="timeline-stage__icon">
							<img src={filterIcon} alt="Filter" title="Filter" />
						</div>
					)}
					{hasSkipLogic && (
						<div className="timeline-stage__icon">
							<img src={skipLogicIcon} alt="Skip logic" title="Skip logic" />
						</div>
					)}
				</div>
			</div>
		</div>
	),
);

export default EditStageButton;
