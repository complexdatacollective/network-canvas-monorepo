import type { CollectionEntityType } from "@codaco/protocol-validation";
import type { ReactNode } from "react";

type CollectionNodeProps = {
	entity: CollectionEntityType;
	children: ReactNode;
};

export default function CollectionNode({ entity, children }: CollectionNodeProps) {
	return (
		<div className="timeline-collection" data-entity-id={entity.id}>
			<div className="timeline-collection__header">{entity.name}</div>
			<div className="timeline-collection__children">{children}</div>
		</div>
	);
}
