import { createMigration, type ProtocolDocument } from "~/migration";
import type { SchemaVersion } from "~/schemas";

type V8Stage = {
	id: string;
	type: string;
	label?: string;
	skipLogic?: {
		action: "SKIP" | "SHOW";
		filter: Record<string, unknown>;
	};
	[key: string]: unknown;
};

type TimelineEntity = {
	id: string;
	type: "Stage" | "Branch";
	target?: string;
	[key: string]: unknown;
};

// 9 is not yet in SchemaVersion (added in Task 12), so we cast here
const migrationV8toV9 = createMigration({
	from: 8 as SchemaVersion,
	to: 9 as unknown as SchemaVersion,
	dependencies: {},
	notes: `
- Replaced flat stages array with timeline graph structure.
- Stages now have 'stageType' instead of 'type', and 'type' is always "Stage".
- Skip logic on stages is converted to Branch entities with conditional slots.
- A FinishInterview stage is appended as the terminal node.
`,
	migrate: (doc, _deps) => {
		const protocol = doc as Record<string, unknown>;
		const v8Stages = (protocol.stages ?? []) as V8Stage[];

		const finishId = crypto.randomUUID();
		const finishEntity: TimelineEntity = {
			id: finishId,
			type: "Stage",
			stageType: "FinishInterview",
		};

		const entities: TimelineEntity[] = [];
		// Map from original stage id to what should precede it in targeting
		// We build entities in order, inserting branches where needed

		// First pass: build ordered list of entity entries (stage or branch+stage)
		type EntityEntry = { entity: TimelineEntity; originalStageId?: string };
		const entries: EntityEntry[] = [];

		for (const stage of v8Stages) {
			const { skipLogic, type, ...rest } = stage;

			const stageEntity: TimelineEntity = {
				...rest,
				id: stage.id,
				type: "Stage",
				stageType: type,
			};

			if (skipLogic) {
				const branchId = crypto.randomUUID();
				const branchEntity: TimelineEntity = {
					id: branchId,
					type: "Branch",
					name: `Branch: ${stage.label ?? stage.id}`,
					slots: [],
				};
				entries.push({ entity: branchEntity, originalStageId: stage.id });
				entries.push({ entity: stageEntity });
			} else {
				entries.push({ entity: stageEntity });
			}
		}

		// Add finish entity
		entries.push({ entity: finishEntity });

		// Second pass: wire up targets and branch slots
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];

			if (entry.entity.type === "Branch" && entry.originalStageId) {
				const originalStageId = entry.originalStageId;
				const originalStage = v8Stages.find((s) => s.id === originalStageId);
				if (!originalStage?.skipLogic) continue;
				const skipLogic = originalStage.skipLogic;

				// The stage entity follows immediately after the branch
				const stageEntryIndex = entries.findIndex((e, idx) => idx > i && e.entity.id === originalStageId);
				const stageAfterSkipped = stageEntryIndex + 1 < entries.length ? entries[stageEntryIndex + 1] : undefined;
				const nextTargetId = stageAfterSkipped?.entity.id ?? finishId;

				const conditionSlot: Record<string, unknown> = {
					id: crypto.randomUUID(),
					filter: skipLogic.filter,
					default: false,
					// SKIP: condition met → skip this stage (go to next), default → show stage
					// SHOW: condition met → show stage, default → skip (go to next)
					target: skipLogic.action === "SKIP" ? nextTargetId : originalStageId,
				};

				const defaultSlot: Record<string, unknown> = {
					id: crypto.randomUUID(),
					default: true,
					target: skipLogic.action === "SKIP" ? originalStageId : nextTargetId,
				};

				entry.entity.slots = [conditionSlot, defaultSlot];

				// Branch doesn't get a simple 'target' — routing is via slots
			} else if (entry.entity.type === "Stage" && entry.entity.stageType !== "FinishInterview") {
				// Point to next entry
				const nextEntry = entries[i + 1];
				if (nextEntry) {
					entry.entity.target = nextEntry.entity.id;
				}
			}
		}

		// Collect all entities
		for (const entry of entries) {
			entities.push(entry.entity);
		}

		const { stages: _stages, ...restProtocol } = protocol;

		const result = {
			...restProtocol,
			schemaVersion: 9 as const,
			timeline: {
				start: entities[0].id,
				entities,
			},
		};

		return result as unknown as ProtocolDocument<SchemaVersion>;
	},
});

export default migrationV8toV9;
