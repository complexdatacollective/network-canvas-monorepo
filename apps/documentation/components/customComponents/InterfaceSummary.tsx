import { Paragraph } from "@codaco/ui";
import type { ReactNode } from "react";

export const InterfaceSummary = ({ children }: { children: ReactNode }) => {
	return <div className="mb-4 flex flex-col sm:flex-row sm:items-center">{children}</div>;
};

export const InterfaceMeta = ({
	type,
	creates,
	usesprompts,
}: {
	type: string;
	creates: string;
	usesprompts: string;
}) => {
	return (
		<div className="flex flex-col content-center justify-center space-y-6 sm:pl-6">
			<Paragraph>
				<strong className="uppercase">Type:</strong> <br /> {type}
			</Paragraph>
			<Paragraph>
				<strong className="uppercase">Creates:</strong> <br /> {creates}
			</Paragraph>
			<Paragraph>
				<strong className="uppercase">Uses Prompts:</strong> <br />
				{usesprompts}
			</Paragraph>
		</div>
	);
};
