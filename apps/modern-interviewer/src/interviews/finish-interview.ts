import type { FinishHandler } from "@codaco/interview";
import { db } from "../lib/db";

export const finishInterviewInDb: FinishHandler = async (interviewId: string) => {
	const now = new Date().toISOString();
	await db.interviews.update(interviewId, {
		finishTime: now,
		lastUpdated: now,
	});
};
