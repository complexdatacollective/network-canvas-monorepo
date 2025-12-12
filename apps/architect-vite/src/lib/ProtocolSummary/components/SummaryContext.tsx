import type { CurrentProtocol } from "@codaco/protocol-validation";
import { createContext } from "react";

export type IndexEntry = {
	id: string;
	name: string;
	type: string;
	component?: string;
	stages: string[];
	[key: string]: unknown;
};

type SummaryContextType = {
	protocol: CurrentProtocol;
	protocolName: string;
	index: IndexEntry[];
};

const SummaryContext = createContext<SummaryContextType>({
	protocol: {} as CurrentProtocol,
	protocolName: "Untitled Protocol",
	index: [],
});

export default SummaryContext;
