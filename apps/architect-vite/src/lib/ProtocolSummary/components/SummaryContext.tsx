import type { CurrentProtocol } from "@codaco/protocol-validation";
import { createContext } from "react";

type IndexEntry = {
	id: string;
	name: string;
	type: string;
	stages: string[];
	[key: string]: unknown;
};

type SummaryContextType = {
	protocol: CurrentProtocol | null;
	index: IndexEntry[];
};

const SummaryContext = createContext<SummaryContextType>({ protocol: null, index: [] });

export default SummaryContext;
