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

export * from "./7/schema";
export * from "./8/schema";
