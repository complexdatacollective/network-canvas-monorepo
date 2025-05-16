import type { Protocol } from "src/schemas/8.zod";
import type { ProtocolMigration } from "../migrateProtocol";
// @ts-expect-error
import version4 from "./4";
// @ts-expect-error
import version5 from "./5";
// @ts-expect-error
import version6 from "./6";
// @ts-expect-error
import version7 from "./7";
import version8 from "./8";

/**
 * These must be in order
 */
export const migrations: ProtocolMigration<Protocol, Protocol>[] = [
	{ version: 1, migration: (protocol) => protocol },
	{ version: 2, migration: (protocol) => protocol },
	{ version: 3, migration: (protocol) => protocol },
	version4,
	version5,
	version6,
	version7,
	version8,
];
