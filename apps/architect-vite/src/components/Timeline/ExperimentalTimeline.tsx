import { get } from "es-toolkit/compat";
import type React from "react";
import { useTimelineLayout } from "~/hooks/useTimelineLayout";
import timelineImages from "~/images/timeline";
import { Button } from "~/lib/legacy-ui/components";
import {
	createTestTimeline,
	getConnections,
	type Stage,
	type Branch,
	type Collection,
	type Start,
	type Finish,
	type Entity,
} from "~/utils/timelineValidation";
import { ZoomPanViewport } from "./ZoomPanViewport";

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

function CollectionNode({
	id,
	collection,
}: {
	id: string;
	collection: Collection;
}) {
	// Get the layout for the collection's internal timeline
	const collectionLayout = useTimelineLayout(collection.timeline);
	const layout = collectionLayout.layout;

	if (!layout) {
		return <div>Collection layout error</div>;
	}

	// Calculate collection bounds based on internal entities
	const internalPositions = Array.from(layout.positions.values());
	if (internalPositions.length === 0) {
		return <div>Empty collection</div>;
	}

	const padding = 20;
	const minX = Math.min(...internalPositions.map((p) => p.x));
	const minY = Math.min(...internalPositions.map((p) => p.y));
	const maxX = Math.max(...internalPositions.map((p) => p.x + p.width));
	const maxY = Math.max(...internalPositions.map((p) => p.y + p.height));

	const containerWidth = maxX - minX + padding * 2;
	const containerHeight = maxY - minY + padding * 2 + 40; // Extra space for title

	// Get internal connections for the collection's timeline
	const internalConnections = getConnections(collection.timeline);

	return (
		<div
			className="absolute bg-blue-50 border-2 border-blue-300 rounded-lg shadow-md"
			style={{
				width: containerWidth,
				height: containerHeight,
			}}
			data-node-marker={id}
		>
			{/* Collection header */}
			<div className="bg-blue-100 border-b border-blue-300 rounded-t-lg px-3 py-2">
				<h4 className="text-sm font-semibold text-blue-800">{collection.name}</h4>
			</div>

			{/* Internal entities container */}
			<div className="relative p-4" style={{ height: containerHeight - 40 }}>
				{/* SVG overlay for internal connections */}
				<svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ overflow: "visible" }}>
					<title>Collection Internal Connectors</title>
					{internalConnections.map(({ from, to, type }) => {
						const fromPos = layout.positions.get(from);
						const toPos = layout.positions.get(to);

						if (!fromPos || !toPos) return null;

						// Adjust positions relative to container padding
						const fromCenterX = fromPos.x - minX + fromPos.width / 2;
						const fromCenterY = fromPos.y - minY + 40; // Account for header
						const toCenterX = toPos.x - minX + toPos.width / 2;
						const toCenterY = toPos.y - minY + 20; // Account for header

						let pathData: string;
						if (type === "branch") {
							pathData = `M ${fromCenterX} ${fromCenterY} H ${toCenterX} V ${toCenterY}`;
						} else {
							pathData = `M ${fromCenterX} ${fromCenterY} V ${toCenterY} H ${toCenterX}`;
						}

						return (
							<path
								key={`${from}-${to}`}
								d={pathData}
								fill="none"
								stroke={type === "branch" ? "#f59e0b" : "#3b82f6"}
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
								className="drop-shadow-sm"
							/>
						);
					})}
				</svg>

				{/* Render internal entities */}
				{Array.from(layout.positions.entries()).map(([nodeId, position]) => {
					const entity = collection.timeline.entities.find((e: Entity) => e.id === nodeId);
					if (!entity) return null;

					// Skip start/finish nodes within collections - they're invisible
					if (entity.type === "Start" || entity.type === "Finish") {
						return null;
					}

					// Adjust position relative to container
					const adjustedPosition = {
						x: position.x - minX,
						y: position.y - minY,
						width: position.width,
						height: position.height,
					};

					return (
						<button
							type="button"
							key={nodeId}
							data-node-id={nodeId}
							className="absolute flex items-center justify-center hover:scale-105 transition-transform duration-200 z-10"
							style={{
								left: adjustedPosition.x,
								top: adjustedPosition.y,
								width: adjustedPosition.width,
								height: adjustedPosition.height,
								transform: "scale(0.8)", // Make internal entities smaller
							}}
						>
							{entity.type === "Stage" && <StageNode stage={entity as Stage} id={nodeId} />}
							{entity.type === "Branch" && <BranchNode branch={entity as Branch} id={nodeId} />}
						</button>
					);
				})}
			</div>
		</div>
	);
}

// Create a test timeline for debugging
const testTimeline = createTestTimeline();

console.log("Test Timeline:", testTimeline);

const ExperimentalTimeline: React.FC = () => {
	const timeline = testTimeline;
	const { layout, zoom, pan, handleZoom, handlePan, resetView, config } = useTimelineLayout(timeline);
	const connections = getConnections(timeline);

	if (!layout) {
		return <div>No timeline data available</div>;
	}

	// Create a map of entities by ID for quick lookup
	const entitiesById = new Map<string, Entity>(timeline.entities.map((entity: Entity) => [entity.id, entity]));

	return (
		<>
			{/* Control buttons */}
			<div className="absolute bottom-24 right-4 z-20 flex gap-2">
				<Button onClick={resetView}>Reset View</Button>
				<div className="px-3 py-1 bg-white border border-gray-300 rounded text-sm">{Math.round(zoom * 100)}%</div>
			</div>
			<div className="w-full h-full overflow-hidden">
				<ZoomPanViewport
					zoom={zoom}
					pan={pan}
					onZoom={handleZoom}
					onPan={handlePan}
					className="w-full h-full"
					zoomConfig={config.zoomSensitivity}
				>
					<div
						className="relative"
						style={{
							width: layout.bounds.width + 200, // Add padding
							height: layout.bounds.height + 200, // Add padding
							transform: "translate(100px, 100px)", // Center with padding
						}}
					>
						{/* SVG overlay for connecting lines */}
						<svg className="absolute inset-0 pointer-events-none w-full h-full" style={{ overflow: "visible" }}>
							<title>Timeline Connectors</title>
							{connections.map(({ from, to, type }) => {
								const fromEntity = entitiesById.get(from);
								const toEntity = entitiesById.get(to);
								const fromPos = layout.positions.get(from);
								const toPos = layout.positions.get(to);

								if (!fromPos || !toPos || !fromEntity || !toEntity) return null;

								// Calculate center positions, accounting for the visual elements being above the text
								const fromCenterX = fromPos.x + fromPos.width / 2;
								let fromCenterY: number;
								if (fromEntity.type === "Collection") {
									fromCenterY = fromPos.y + fromPos.height; // Exit from bottom of collection
								} else if (fromEntity.type === "Stage") {
									fromCenterY = fromPos.y + 70;
								} else {
									fromCenterY = fromPos.y + 40;
								}
								const toCenterX = toPos.x + toPos.width / 2;
								let toCenterY: number;
								if (toEntity.type === "Collection") {
									toCenterY = toPos.y; // Enter at top of collection
								} else if (toEntity.type === "Stage") {
									toCenterY = toPos.y + 20;
								} else {
									toCenterY = toPos.y + 20;
								}

								// Determine the path based on node type
								let pathData: string;

								if (type === "branch") {
									// Branch nodes: exit horizontally until vertically aligned with target
									pathData = `M ${fromCenterX} ${fromCenterY} H ${toCenterX} V ${toCenterY}`;
								} else {
									// Stage nodes: exit vertically until horizontally aligned with target
									pathData = `M ${fromCenterX} ${fromCenterY} V ${toCenterY} H ${toCenterX}`;
								}

								return (
									<path
										key={`${from}-${to}`}
										d={pathData}
										fill="none"
										stroke={type === "branch" ? "#f59e0b" : "#3b82f6"}
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className="drop-shadow-sm"
									/>
								);
							})}
						</svg>

						{/* Render nodes using absolute positioning */}
						{Array.from(layout.positions.entries()).map(([nodeId, position]) => {
							const entity = entitiesById.get(nodeId);
							if (!entity) return null;

							// Collections are not buttons - they're containers
							if (entity.type === "Collection") {
								return (
									<div
										key={nodeId}
										data-node-id={nodeId}
										className="absolute z-10"
										style={{
											left: position.x,
											top: position.y,
											width: position.width,
											height: position.height,
										}}
									>
										<CollectionNode collection={entity as Collection} id={nodeId} />
									</div>
								);
							}

							// Other entities remain as buttons
							return (
								<button
									type="button"
									key={nodeId}
									data-node-id={nodeId}
									className="absolute flex items-center justify-center hover:scale-105 transition-transform duration-200 z-10"
									style={{
										left: position.x,
										top: position.y,
										width: position.width,
										height: position.height,
									}}
								>
									{entity.type === "Stage" && <StageNode stage={entity as Stage} id={nodeId} />}
									{entity.type === "Branch" && <BranchNode branch={entity as Branch} id={nodeId} />}
									{entity.type === "Start" && <StartNode start={entity as Start} id={nodeId} />}
									{entity.type === "Finish" && <FinishNode finish={entity as Finish} id={nodeId} />}
								</button>
							);
						})}
					</div>
				</ZoomPanViewport>
			</div>
		</>
	);
};

export default ExperimentalTimeline;
