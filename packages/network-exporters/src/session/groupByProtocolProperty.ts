import { protocolProperty } from "@codaco/shared-consts";
import { groupBy } from "es-toolkit";
import type { SessionsByProtocol, SessionWithNetworkEgo } from "../types";

export default function groupByProtocolProperty(s: SessionWithNetworkEgo[]): SessionsByProtocol {
	return groupBy(s, (i) => i.sessionVariables[protocolProperty]);
}
