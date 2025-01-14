import "server-only";
import { createCachedFunction } from "~/lib/cache";
import { prisma } from "~/utils/db";

export const getSummaryStatistics = createCachedFunction(async () => {
	const counts = await prisma.$transaction([
		prisma.interview.count(),
		prisma.protocol.count(),
		prisma.participant.count(),
	]);

	return {
		interviewCount: counts[0],
		protocolCount: counts[1],
		participantCount: counts[2],
	};
}, ["summaryStatistics", "interviewCount", "protocolCount", "participantCount"]);
