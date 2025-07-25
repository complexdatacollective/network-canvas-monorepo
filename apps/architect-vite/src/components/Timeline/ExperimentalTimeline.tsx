import { get } from "es-toolkit/compat";
import type React from "react";
import timelineImages from "~/images/timeline";
import {
	type Branch,
	type Finish,
	getConnections,
	type Stage,
	type Start,
	testTimeline,
} from "~/utils/timelineValidation";

const getTimelineImage = (type: string) => get(timelineImages, type, timelineImages.Default);

function StageNode({
	id,
	stage,
}: {
	id: string;
	stage: Stage;
}) {
	return (
		<div
			className="flex flex-col items-center justify-center bg-white shadow-md rounded p-2 group"
			style={{ width: "180px", height: "120px" }}
		>
			<img
				data-node-marker={id}
				className="w-20 h-16 object-cover rounded shadow select-none pointer-events-none"
				src={getTimelineImage(stage.interfaceType)}
				alt={`${stage.interfaceType} interface`}
			/>
			<h4 className="text-sm font-medium text-center mt-2 line-clamp-2">{stage.name}</h4>
		</div>
	);
}

function StartNode({
	id,
	start,
}: {
	id: string;
	start: Start;
}) {
	return (
		<div
			className="flex flex-col items-center justify-center bg-green-100 border-2 border-green-500 rounded-lg shadow-md"
			style={{ width: "180px", height: "120px" }}
		>
			<div
				className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center shadow-lg"
				data-node-marker={id}
			>
				<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" aria-label="Start">
					<title>Start Node</title>
					<path
						fillRule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
						clipRule="evenodd"
					/>
				</svg>
			</div>
			<h4 className="text-sm font-medium text-center mt-2 line-clamp-2">{start.name}</h4>
		</div>
	);
}

function FinishNode({
	id,
	finish,
}: {
	id: string;
	finish: Finish;
}) {
	return (
		<div
			className="flex flex-col items-center justify-center bg-red-100 border-2 border-red-500 rounded-lg shadow-md"
			style={{ width: "180px", height: "120px" }}
		>
			<div
				className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
				data-node-marker={id}
			>
				<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" aria-label="Finish">
					<title>Finish Node</title>
					<path
						fillRule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414-1.414L9 5.586 7.707 4.293a1 1 0 00-1.414 1.414L8.586 8l-2.293 2.293a1 1 0 101.414 1.414L9 10.414l1.293 1.293a1 1 0 001.414-1.414L10.414 9l2.293-2.293a1 1 0 000-1.414z"
						clipRule="evenodd"
					/>
				</svg>
			</div>
			<h4 className="text-sm font-medium text-center mt-2 line-clamp-2">{finish.name}</h4>
		</div>
	);
}

function BranchNode({
	id,
	branch,
}: {
	id: string;
	branch: Branch;
}) {
	return (
		<div
			className="flex flex-col items-center justify-center bg-orange-100 border-2 border-orange-400 rounded-lg shadow-md"
			style={{ width: "180px", height: "120px" }}
		>
			{/* Render a diamond shape for branch nodes */}
			<div
				className="w-12 h-12 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg"
				data-node-marker={id}
			>
				<svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" aria-label="Branch">
					<title>Branch Node</title>
					<path
						fillRule="evenodd"
						d="M3 10a7 7 0 1 1 14 0 7 7 0 0 1-14 0zm7-3a3 3 0 0 0-3 3 3 3 0 0 0 6 0 3 3 0 0 0-3-3z"
						clipRule="evenodd"
					/>
				</svg>
			</div>
			<h4 className="text-sm font-medium text-center mt-2 line-clamp-2">{branch.name}</h4>
		</div>
	);
}

const ExperimentalTimeline: React.FC = () => {
	const timeline = testTimeline;
	const connections = getConnections(timeline);

	console.log({
		timeline,
		connections,
	});

	return <></>;
};

export default ExperimentalTimeline;
