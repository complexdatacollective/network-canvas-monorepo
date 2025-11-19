import { z } from "zod";
import ProtocolSchemaV7 from "./7/schema";
import ProtocolSchemaV8 from "./8/schema";

export const SchemaVersionSchema = z.union([z.literal(7), z.literal(8)]);

export type SchemaVersion = z.infer<typeof SchemaVersionSchema>;
export const CURRENT_SCHEMA_VERSION = 8 as const;

export const VersionedProtocolSchema = z.discriminatedUnion("schemaVersion", [ProtocolSchemaV7, ProtocolSchemaV8]);
export const CurrentProtocolSchema = ProtocolSchemaV8;

export type VersionedProtocol = z.infer<typeof VersionedProtocolSchema>;
export type CurrentProtocol = z.infer<typeof CurrentProtocolSchema>;

/**
 * Extract a specific protocol version type from VersionedProtocol using discriminated union
 * @template V - The schema version to extract (7 or 8)
 * @example
 * type V7Protocol = ProtocolForVersion<7>; // Gets the version 7 protocol type
 * type V8Protocol = ProtocolForVersion<8>; // Gets the version 8 protocol type
 */
export type Protocol<V extends SchemaVersion> = Extract<VersionedProtocol, { schemaVersion: V }>;

export * from "./7/schema";
export * from "./8/schema";
