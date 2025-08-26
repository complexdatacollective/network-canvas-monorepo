import { get } from "es-toolkit/compat";
import { DoorOpenIcon } from "lucide-react";
import type React from "react";
import { type LayoutNode, useTimelineLayout } from "~/hooks/useTimelineLayout";
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
		<div className="flex flex-col items-center justify-center bg-white shadow-md rounded p-2 group w-full h-full">
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
		<div className="flex flex-col items-center justify-center w-full h-full">
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
		<div className="flex flex-col items-center justify-center w-full h-full">
			<div
				className="w-12 h-12 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg"
				data-node-marker={id}
			>
				<DoorOpenIcon />
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
		<div className="flex flex-col items-center justify-center bg-orange-100 border-2 border-orange-400 rounded-lg shadow-md w-full h-full">
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
	const layout = useTimelineLayout(timeline, connections);

	const renderNode = (node: LayoutNode) => {
		const { entity, id } = node;

		switch (entity.type) {
			case "Start":
				return <StartNode key={id} id={id} start={entity} />;
			case "Finish":
				return <FinishNode key={id} id={id} finish={entity} />;
			case "Stage":
				return <StageNode key={id} id={id} stage={entity} />;
			case "Branch":
				return <BranchNode key={id} id={id} branch={entity} />;
			case "Collection":
				// Collection nodes themselves are not rendered, only their container
				return null;
			default:
				return null;
		}
	};

	return (
		<div className="w-full h-full overflow-auto p-8 bg-gray-50">
			<div
				className="relative min-w-full grid gap-20"
				style={{
					gridTemplateColumns: `repeat(${layout.gridColumns}, minmax(200px, 1fr))`,
					gridTemplateRows: `repeat(${layout.gridRows}, minmax(140px, 1fr))`,
				}}
			>
				{/* Render collections as background containers
				{layout.collections.map((collection) => {
					const cellWidth = 200;
					const cellHeight = 140;
					const gap = 20;
					const padding = 40;

					// Calculate pixel positions based on grid coordinates
					const left = padding + collection.startColumn * (cellWidth + gap) - 10;
					const top = padding + collection.startRow * (cellHeight + gap) - 10;
					const width =
						(collection.endColumn - collection.startColumn + 1) * cellWidth +
						(collection.endColumn - collection.startColumn) * gap +
						20;
					const height =
						(collection.endRow - collection.startRow + 1) * cellHeight +
						(collection.endRow - collection.startRow) * gap +
						20;

					return (
						<div
							key={collection.id}
							className="absolute border-2 border-dashed border-purple-400 bg-purple-50 rounded-lg"
							style={{
								left: `${left}px`,
								top: `${top}px`,
								width: `${width}px`,
								height: `${height}px`,
								padding: "20px",
								zIndex: 0,
							}}
						>
							<h3 className="text-sm font-semibold text-purple-700 mb-2">
								{layout.nodes.find((n) => n.id === collection.id)?.entity.name}
							</h3>
						</div>
					);
				})} */}

				{/* Render nodes */}
				{layout.nodes.map((node) => {
					if (node.entity.type === "Collection") return null; // Collections are rendered as containers

					return (
						<div
							key={node.id}
							style={{
								gridColumn: node.column + 1,
								gridRow: node.row + 1,
							}}
						>
							{renderNode(node)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default ExperimentalTimeline;
