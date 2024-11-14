import { CheckSquare, XOctagon } from "lucide-react";
import type { ReactNode } from "react";

export const GoodPractice = ({ children }: { children: ReactNode }) => {
	return (
		<div className="my-3 flex flex-row">
			<CheckSquare className="mt-1.5 h-5 w-5 min-w-5 shrink-0 text-success sm:h-6 sm:w-6" />
			<span className="pl-4">{children}</span>
		</div>
	);
};

export const BadPractice = ({ children }: { children: ReactNode }) => {
	return (
		<div className="my-3 flex flex-row">
			<XOctagon className="mt-1.5 h-5 w-5 min-w-5 shrink-0 text-destructive sm:h-6 sm:w-6" />
			<span className="pl-4">{children}</span>
		</div>
	);
};
