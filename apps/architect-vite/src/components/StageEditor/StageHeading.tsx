import type { StageType } from "@codaco/protocol-validation";
import { get } from "es-toolkit/compat";
import { Text } from "~/components/Form/Fields";
import timelineImages from "~/images/timeline";
import { useFormContext } from "../Editor";
import ValidatedField from "../Form/ValidatedField";
import IssueAnchor from "../IssueAnchor";
import { getInterface } from "./Interfaces";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

const StageHeading = ({ _id }: { _id?: string }) => {
	const { values } = useFormContext();

	const type = get(values, "type") as string;

	if (!type) {
		return null;
	}

	const documentationLinkForType = get(getInterface(type as StageType), "documentation", null);

	return (
		<div className="w-full grid gap-8 grid-cols-[20rem_auto] max-w-7xl my-10">
			<div className="flex items-center flex-col relative">
				<a
					href={documentationLinkForType}
					className="before:absolute before:left-[50%] before:border-l-10 before:h-56 before:border-tomato before:-top-13 before:[mask-image:linear-gradient(180deg,transparent,rgb(0,0,0)_20%,rgb(0,0,0)_80%,transparent_100%)]"
				>
					<img
						src={getTimelineImage(type)}
						alt={`${type} interface`}
						title={`${type} interface`}
						className="relative w-full aspect-auto rounded h-28"
					/>
				</a>
			</div>
			{/* <div className="flex items-center gap-4">
				<h1 className="m-0">{label}</h1>
			</div> */}
			<div className="stage-name-container">
				<IssueAnchor fieldName="label" description="Stage name" />
				<h2>Stage Name</h2>
				<ValidatedField
					name="label"
					component={Text}
					placeholder="Enter your stage name here"
					className="stage-editor-section-title"
					maxLength="50"
					validation={{ required: true }}
					autoFocus
				/>
			</div>
		</div>
	);
};

export default StageHeading;
