import { createInitialNetwork } from "@codaco/interview";
import { v4 as uuid } from "uuid";
import { db, type InterviewRecord, type ProtocolRecord } from "../lib/db";

export async function createInterview(
	protocol: ProtocolRecord,
	participantIdentifier: string,
): Promise<InterviewRecord> {
	const now = new Date().toISOString();
	const record: InterviewRecord = {
		id: uuid(),
		protocolId: protocol.id,
		protocolHash: protocol.hash,
		participantIdentifier: participantIdentifier.trim() || "Anonymous participant",
		startTime: now,
		lastUpdated: now,
		finishTime: null,
		exportTime: null,
		currentStep: 0,
		network: createInitialNetwork(),
	};
	await db.interviews.put(record);
	await db.protocols.update(protocol.id, { lastUsedAt: now });
	return record;
}
