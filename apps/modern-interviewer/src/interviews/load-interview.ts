import type { InterviewPayload, ProtocolPayload, ResolvedAsset, SessionPayload } from "@codaco/interview";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";
import { toResolvedAsset } from "../protocols/asset-resolution";

/** @public */
export type LoadedInterview = {
	record: InterviewRecord;
	protocol: ProtocolRecord;
	payload: InterviewPayload;
};

function buildProtocolPayload(protocol: ProtocolRecord, assets: ResolvedAsset[]): ProtocolPayload {
	// The interview engine's ProtocolPayload is the protocol minus the
	// `assetManifest` (resolved into `assets`) plus a few host-managed
	// metadata fields (`id`, `hash`, `importedAt`).
	const { assetManifest: _ignore, ...rest } = protocol.raw as {
		assetManifest?: unknown;
		[k: string]: unknown;
	};
	return {
		...(rest as Omit<ProtocolPayload, "id" | "hash" | "importedAt" | "assets">),
		codebook: protocol.codebook,
		stages: protocol.stages as ProtocolPayload["stages"],
		id: protocol.id,
		hash: protocol.hash,
		importedAt: protocol.importedAt,
		assets,
	} as ProtocolPayload;
}

function toSessionPayload(record: InterviewRecord): SessionPayload {
	// `stageMetadata` is typed as a strict Zod record at the interview
	// package boundary. At rest we persist it as `Record<string, unknown>`
	// (we never inspect it) — cast through unknown.
	return {
		id: record.id,
		startTime: record.startTime,
		finishTime: record.finishTime,
		exportTime: record.exportTime,
		lastUpdated: record.lastUpdated,
		network: record.network,
		stageMetadata: record.stageMetadata as unknown as SessionPayload["stageMetadata"],
		stageRequiresEncryption: record.stageRequiresEncryption,
	};
}

export async function loadInterview(interviewId: string): Promise<LoadedInterview | null> {
	const record = await db.interviews.get(interviewId);
	if (!record) return null;
	const protocol = await db.protocols.get(record.protocolId);
	if (!protocol) return null;
	const assetRecords = await db.assets.where("protocolId").equals(protocol.id).toArray();
	const assets = assetRecords.map(toResolvedAsset);
	const payload: InterviewPayload = {
		session: toSessionPayload(record),
		protocol: buildProtocolPayload(protocol, assets),
	};
	return { record, protocol, payload };
}
