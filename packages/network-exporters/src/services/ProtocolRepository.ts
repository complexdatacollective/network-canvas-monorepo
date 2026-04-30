import { Context, type Effect } from "effect";
import type { DatabaseError } from "../errors";
import type { ProtocolExportInput } from "../input";

export class ProtocolRepository extends Context.Tag("NetworkExporters/ProtocolRepository")<
	ProtocolRepository,
	{
		readonly getProtocols: (
			hashes: readonly string[],
		) => Effect.Effect<Record<string, ProtocolExportInput>, DatabaseError>;
	}
>() {}
