import type { CollectionEntityType, Entity, StageEntity } from "@codaco/protocol-validation";
import { useContext } from "react";
import Stage from "./Stage";
import SummaryContext from "./SummaryContext";

function flattenStageEntities(entities: Entity[]): StageEntity[] {
	const result: StageEntity[] = [];
	for (const entity of entities) {
		if (entity.type === "Stage") {
			result.push(entity);
		} else if (entity.type === "Collection") {
			result.push(...flattenStageEntities((entity as CollectionEntityType).children));
		}
	}
	return result;
}

const Stages = () => {
	const { protocol } = useContext(SummaryContext);
	const stages = flattenStageEntities(protocol.timeline.entities);

	return (
		<div>
			{stages.map((stage, i) => {
				const { stageType, label, id, ...configuration } = stage;
				return (
					<Stage key={id} type={stageType} label={label} id={id} stageNumber={i + 1} configuration={configuration} />
				);
			})}
		</div>
	);
};

export default Stages;
