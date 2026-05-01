import { protocolProperty } from "@codaco/shared-consts";
import { groupBy } from "es-toolkit";
import type { FormattedSession } from "../input";

export default function groupByProtocolProperty<S extends FormattedSession>(sessions: S[]): Record<string, S[]> {
	return groupBy(sessions, (s) => s.sessionVariables[protocolProperty]);
}
