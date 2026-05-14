import { DatabaseError } from "@codaco/network-exporters/errors";
import type { InterviewExportInput, ProtocolExportInput } from "@codaco/network-exporters/input";
import { InterviewRepository } from "@codaco/network-exporters/services/InterviewRepository";
import { ProtocolRepository } from "@codaco/network-exporters/services/ProtocolRepository";
import { Effect, Layer } from "effect";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";

function toExportInterview(record: InterviewRecord): InterviewExportInput {
	return {
		id: record.id,
		participantIdentifier: record.participantIdentifier,
		startTime: new Date(record.startTime),
		finishTime: record.finishTime ? new Date(record.finishTime) : null,
		network: record.network,
		protocolHash: record.protocolHash,
	};
}

function toExportProtocol(record: ProtocolRecord): ProtocolExportInput {
	return {
		hash: record.hash,
		name: record.name,
		codebook: record.codebook,
	};
}

/**
 * Dexie-backed implementation of the InterviewRepository service for the
 * network-exporters pipeline. Maps each requested interview ID to its
 * stored record, or fails with DatabaseError on lookup error.
 */
export const interviewRepositoryLayer = Layer.succeed(InterviewRepository, {
	getForExport: (ids) =>
		Effect.tryPromise({
			try: async () => {
				const records = await db.interviews.bulkGet(ids as string[]);
				const filtered = records.filter((r): r is InterviewRecord => Boolean(r));
				return filtered.map(toExportInterview);
			},
			catch: (cause) => new DatabaseError({ cause }),
		}),
});

export const protocolRepositoryLayer = Layer.succeed(ProtocolRepository, {
	getProtocols: (hashes) =>
		Effect.tryPromise({
			try: async () => {
				if (hashes.length === 0) return {};
				const list = await db.protocols
					.where("hash")
					.anyOf(hashes as string[])
					.toArray();
				const map: Record<string, ProtocolExportInput> = {};
				for (const r of list) map[r.hash] = toExportProtocol(r);
				return map;
			},
			catch: (cause) => new DatabaseError({ cause }),
		}),
});
