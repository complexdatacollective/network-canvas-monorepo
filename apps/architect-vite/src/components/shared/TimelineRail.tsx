import type { ReactNode } from "react";

type Props = {
	children: ReactNode;
};

export default function TimelineRail({ children }: Props) {
	return <div className="relative flex w-full flex-col items-center py-8">{children}</div>;
}
