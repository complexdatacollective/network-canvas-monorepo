import { createContext } from "react";
import type { ProtocolWithMetadata } from "~/types";

type IndexEntry = {
	id: string;
	name: string;
	type: string;
	stages: string[];
	[key: string]: unknown;
};

type SummaryContextType = {
	protocol: ProtocolWithMetadata | null;
	index: IndexEntry[];
};

const SummaryContext = createContext<SummaryContextType>({ protocol: null, index: [] });

export default SummaryContext;
