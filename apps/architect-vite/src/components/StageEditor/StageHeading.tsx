import { get } from "es-toolkit/compat";
import { connect } from "react-redux";
import { getFormValues } from "redux-form";
import timelineImages from "~/images/timeline";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type) => get(timelineImages, type, timelineImages.Default);

interface StageHeadingProps {
	type: string;
	label: string;
}

const StageHeading = ({ label, type }: StageHeadingProps) => {
	const documentationLinkForType = get(getInterface(type), "documentation", null);

	return (
		<div className="w-full grid gap-4 grid-cols-[25%_auto] max-w-6xl my-10">
			<div className="flex items-center flex-col relative">
				<a
					href={documentationLinkForType}
					className="before:absolute before:left-[50%] before:border-l-10 before:h-56 before:border-tomato before:-top-13 before:[mask-image:linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]"
				>
					<img
						src={getTimelineImage(type)}
						alt={`${type} interface`}
						title={`${type} interface`}
						// -webkit-mask-image: linear-gradient(180deg, transparent, rgb(0, 0, 0) 40%, rgb(0, 0, 0) 40%, transparent 100%);
						// mask-image: linear-gradient(180deg, transparent, rgb(0, 0, 0) 40%, rgb(0, 0, 0) 40%, transparent 100%);
						// content: "";
						// border-left: .5rem solid var(--architect-timeline-line);
						// position: absolute;
						// left: 15.8rem;
						// height: 11rem;
						// top: -1rem;
						className="relative w-full aspect-auto rounded h-28"
					/>
				</a>
			</div>
			<div className="flex items-center gap-4">
				<h1 className="m-0">{label}</h1>
			</div>
		</div>
	);
};

const mapStateToProps = (state, props) => {
	const formValues = getFormValues("edit-stage")(state);

	return {
		type: get(formValues, "type"),
		label: get(formValues, "label"),
	};
};

export default connect(mapStateToProps)(StageHeading);
