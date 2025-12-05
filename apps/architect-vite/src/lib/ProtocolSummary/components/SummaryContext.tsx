import { createContext } from "react";
import type { ProtocolWithMetadata } from "~/types";

export type IndexEntry = {
	id: string;
	name: string;
	type: string;
	component?: string;
	stages: string[];
	[key: string]: unknown;
};

type SummaryContextType = {
	protocol: ProtocolWithMetadata;
	index: IndexEntry[];
	workingPath: string;
};

const SummaryContext = createContext<SummaryContextType>({
	protocol: {} as ProtocolWithMetadata,
	index: [],
	workingPath: "",
});

export default SummaryContext;
