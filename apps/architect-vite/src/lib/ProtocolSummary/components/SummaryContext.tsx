import { createContext } from "react";

type SummaryContextType = {
	protocol: any;
	index: any[];
	workingPath?: string;
};

const SummaryContext = createContext<SummaryContextType>({ protocol: null, index: [], workingPath: undefined });

export default SummaryContext;
