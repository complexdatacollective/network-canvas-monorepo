import cx from "classnames";
import ExportedIcon from "../../assets/images/ExportedIcon.svg";
import FinishedIcon from "../../assets/images/FinishedIcon.svg";
import ModifiedIcon from "../../assets/images/ModifiedIcon.svg";
import StartedIcon from "../../assets/images/StartedIcon.svg";
import HoverMarquee from "../HoverMarquee";
import { ProgressBar } from "../index";

interface SessionCardProps {
	caseId: string;
	startedAt: string; // Expects ISO 8601 datetime string
	updatedAt: string; // Expects ISO 8601 datetime string
	finishedAt?: string | null; // Expects ISO 8601 datetime string
	exportedAt?: string | null; // Expects ISO 8601 datetime string
	protocolName?: string | null;
	progress: number;
	selected?: boolean;
	onClickHandler?: () => void;
}

const formatDate = (dateString: string | null) => dateString && new Date(dateString).toLocaleString(undefined);

const SessionCard = ({
	caseId,
	startedAt,
	updatedAt,
	finishedAt = null,
	exportedAt = null,
	protocolName = null,
	progress,
	selected = false,
	onClickHandler,
}: SessionCardProps) => {
	const modifierClasses = cx(
		"session-card",
		{ "session-card--clickable": onClickHandler },
		{ "session-card--selected": selected },
	);

	return (
		<div className={modifierClasses} onClick={onClickHandler}>
			<div className="main-wrapper">
				<h2 className="card__label">
					<HoverMarquee>{caseId}</HoverMarquee>
				</h2>
				<h5 className="card__protocol">
					<HoverMarquee>{protocolName || <span className="highlight">Unavailable protocol!</span>}</HoverMarquee>
				</h5>
			</div>
			<div className="meta-wrapper">
				<div className="meta">
					<h6 className="meta-wrapper__attribute">
						<HoverMarquee>
							<img src={StartedIcon} alt="Interview started at" />
							{startedAt ? formatDate(startedAt) : <span className="highlight">No start date!</span>}
						</HoverMarquee>
					</h6>
					<h6 className="meta-wrapper__attribute">
						<HoverMarquee>
							<img src={ModifiedIcon} alt="Interview modified at" />
							{updatedAt ? formatDate(updatedAt) : <span className="highlight">Never changed!</span>}
						</HoverMarquee>
					</h6>
				</div>
				<div className="meta">
					<div className="progress-wrapper">
						<img src={FinishedIcon} alt="Interview finished at" />
						{progress === 100 && finishedAt ? (
							<span>{formatDate(finishedAt)}</span>
						) : (
							<>
								<span> {progress}%</span>
								<ProgressBar percentProgress={progress} orientation="horizontal" />
							</>
						)}
					</div>
					<h6 className="meta-wrapper__attribute">
						<HoverMarquee>
							<img src={ExportedIcon} alt="Interview exported at" />
							{exportedAt ? formatDate(exportedAt) : <span className="highlight">Not yet exported</span>}
						</HoverMarquee>
					</h6>
				</div>
			</div>
		</div>
	);
};

export default SessionCard;
