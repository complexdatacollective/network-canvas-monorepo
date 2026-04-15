import { z } from "zod";
import ProtocolSchemaV7 from "./7/schema";
import ProtocolSchemaV8 from "./8/schema";
import ProtocolSchemaV9 from "./9/schema";

export const SchemaVersionSchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
	z.literal(9),
]);

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export const CURRENT_SCHEMA_VERSION = 9 as const;

export const VersionedProtocolSchema = z.discriminatedUnion("schemaVersion", [
	ProtocolSchemaV7,
	ProtocolSchemaV8,
	ProtocolSchemaV9,
]);
export const CurrentProtocolSchema = ProtocolSchemaV9;

export type VersionedProtocol = z.infer<typeof VersionedProtocolSchema>;
export type CurrentProtocol = z.infer<typeof CurrentProtocolSchema>;

/**
 * Extract a specific protocol version type from VersionedProtocol using discriminated union
 * @template V - The schema version to extract (7, 8, or 9)
 * @example
 * type V7Protocol = ProtocolForVersion<7>; // Gets the version 7 protocol type
 * type V8Protocol = ProtocolForVersion<8>; // Gets the version 8 protocol type
 * type V9Protocol = ProtocolForVersion<9>; // Gets the version 9 protocol type
 */
export type Protocol<V extends SchemaVersion> = Extract<VersionedProtocol, { schemaVersion: V }>;

export * from "./7/schema";
export * from "./9/schema";
