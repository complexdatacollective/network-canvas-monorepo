import { Heading, Paragraph } from "@codaco/ui";
import { Clock } from "lucide-react";
import type { ReactNode } from "react";

export const SummaryCard = ({
	duration,
	children,
}: {
	children: ReactNode;
	duration: string;
}) => {
	return (
		<summary className="text-base-sm my-8 rounded-lg border border-border bg-accent p-6 text-accent-foreground [--link:var(--accent-foreground)]">
			{children}
			<Heading variant={"h4-all-caps"}>Duration:</Heading>
			<Paragraph className="flex items-center gap-2" margin="none">
				<Clock className="h-5 w-5 shrink-0" /> {duration}
			</Paragraph>
		</summary>
	);
};

export const SummarySection = ({ children }: { children: ReactNode }) => {
	return (
		<>
			<Heading variant={"h4-all-caps"}>Summary:</Heading>
			{children}
		</>
	);
};

export const PrerequisitesSection = ({ children }: { children: ReactNode }) => {
	return (
		<>
			<Heading variant={"h4-all-caps"}>Prerequisites:</Heading>
			{children}
		</>
	);
};
