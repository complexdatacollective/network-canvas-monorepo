import type { CollectionEntityType } from "@codaco/protocol-validation";
import { Layers } from "lucide-react";
import type { ReactNode } from "react";

type CollectionNodeProps = {
	entity: CollectionEntityType;
	children: ReactNode;
};

export default function CollectionNode({ entity, children }: CollectionNodeProps) {
	return (
		<div
			className="relative w-full max-w-2xl rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.03] px-4 py-6"
			data-entity-id={entity.id}
		>
			<div className="absolute -top-3 left-6 flex items-center gap-1.5 bg-background px-2 text-xs font-semibold text-primary/70 uppercase tracking-wider">
				<Layers size={12} />
				{entity.name}
			</div>
			<div className="flex flex-col items-center gap-2">{children}</div>
		</div>
	);
}
