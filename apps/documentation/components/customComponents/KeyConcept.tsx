import Image from "next/image";
import type { ReactNode } from "react";
import PopoutBox from "~/components/PopoutBox";
import { cn } from "~/lib/utils";

type KeyConceptProps = {
	title: string;
	children: ReactNode;
};

const KeyConcept = ({ children, title }: KeyConceptProps) => {
	return (
		<PopoutBox
			title={title}
			className={cn(
				"bg-accent/10 [--link:var(--accent)]",
				"![background-color:color-mix(in_oklab,hsl(var(--background))_80%,hsl(var(--accent)))]",
			)}
			iconClassName="bg-white"
			icon={<Image src="/images/key-concept.svg" width={32} height={32} alt={title} />}
		>
			{children}
		</PopoutBox>
	);
};

export default KeyConcept;
