import {
	caseProperty,
	codebookHashProperty,
	protocolName,
	protocolProperty,
	sessionExportTimeProperty,
	sessionFinishTimeProperty,
	sessionProperty,
	sessionStartTimeProperty,
} from "@codaco/shared-consts";
import { hash } from "ohash";
import type { InterviewExportInput, SessionVariables } from "../input";
import type { ExportOptions } from "../options";

/**
 * Creates an object containing all required session metadata for export
 * and appends it to the session
 */

export const formatExportableSessions = (sessions: InterviewExportInput[], exportOptions: ExportOptions) => {
	return sessions.map((session) => {
		const sessionProtocol = session.protocol;

		const sessionVariables: SessionVariables = {
			[caseProperty]: session.participantIdentifier,
			[sessionProperty]: session.id,
			[protocolProperty]: sessionProtocol.hash,
			[protocolName]: sessionProtocol.name,
			[codebookHashProperty]: hash(sessionProtocol.codebook),
			[sessionStartTimeProperty]: session.startTime.toISOString(),
			[sessionFinishTimeProperty]: session.finishTime?.toISOString() ?? undefined,
			[sessionExportTimeProperty]: new Date().toISOString(),
			COMMIT_HASH: exportOptions.commitHash ?? "",
			APP_VERSION: exportOptions.appVersion ?? "",
		};

		return {
			...session.network,
			sessionVariables,
		};
	});
};
