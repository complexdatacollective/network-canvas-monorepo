import type { SessionPayload, SyncHandler } from "@codaco/interview";
import { db } from "../lib/db";

// SyncHandler is invoked by the interview engine after every reducer
// commit. We persist the whole session payload to Dexie so the user
// can resume after a crash or app restart.
export const syncInterviewToDb: SyncHandler = async (interviewId: string, session: SessionPayload) => {
	await db.interviews.update(interviewId, {
		network: session.network,
		startTime: session.startTime,
		lastUpdated: session.lastUpdated,
		finishTime: session.finishTime,
		exportTime: session.exportTime,
		stageMetadata: session.stageMetadata,
		stageRequiresEncryption: session.stageRequiresEncryption,
	});
};

export async function updateInterviewStep(interviewId: string, currentStep: number): Promise<void> {
	await db.interviews.update(interviewId, { currentStep });
}
