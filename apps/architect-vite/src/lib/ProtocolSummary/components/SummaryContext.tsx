import type { Protocol } from "@codaco/protocol-validation";
import { createContext } from "react";

type SummaryContextType = {
	protocol: Protocol | null;
	index: any[];
};

const SummaryContext = createContext<SummaryContextType>({ protocol: null, index: [] });

export default SummaryContext;
