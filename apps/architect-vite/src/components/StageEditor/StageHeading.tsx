import { get } from "es-toolkit/compat";
import { motion } from "motion/react";
import timelineImages from "~/images/timeline";
import { useFormContext } from "../Editor";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

const StageHeading = ({ id }) => {
	const { values } = useFormContext();

	const type = get(values, "type") as string;
	const label = get(values, "label") as string;

	if (!type || !label) {
		return null;
	}

	const documentationLinkForType = get(getInterface(type), "documentation", null);

	return (
		<div className="w-full grid gap-4 grid-cols-[25%_auto] max-w-6xl my-10">
			<div className="flex items-center flex-col relative">
				<a
					href={documentationLinkForType}
					className="before:absolute before:left-[50%] before:border-l-10 before:h-56 before:border-tomato before:-top-13 before:[mask-image:linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]"
				>
					<motion.img
						layoutId={`timeline-stage-${id}`}
						src={getTimelineImage(type)}
						alt={`${type} interface`}
						title={`${type} interface`}
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

export default StageHeading;
