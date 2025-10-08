"use client";
import { Heading } from "@codaco/ui";
import type { JSX } from "react";
import WorkInProgress from "~/components/customComponents/WorkInProgress";
import type { HeadingNode } from "~/lib/tableOfContents";
import { usePathname } from "~/navigation";
import FancyHeading from "./FancyHeading";
import TableOfContents from "./TableOfContents";

export default function Article({
	content,
	headings,
	title,
	showToc,
	wip,
}: {
	content: JSX.Element;
	headings: HeadingNode[];
	title: string;
	showToc: boolean;
	wip?: boolean;
}) {
	const pathname = usePathname();

	// Todo: nextjs has hooks specifically for this: useSelectedLayoutSegment
	const project = pathname.split("/")[1];
	const section = pathname.split("/")[2]?.replace(/-/g, " "); // replace hyphens with spaces

	return (
		<>
			<article className="@container/article mx-4 mb-5 w-full max-w-[75ch] flex-1 overflow-y-hidden lg:mx-8 xl:mx-10 2xl:mx-20">
				<header>
					<Heading variant="h4-all-caps" margin="none" className="text-accent">
						{project} {section && <>🠖 {section}</>}
					</Heading>
					<FancyHeading variant="h1" className="!mt-0">
						{title}
					</FancyHeading>
				</header>
				{wip && <WorkInProgress />}
				{showToc && <TableOfContents headings={headings} />}
				{content}
			</article>
			{showToc && <TableOfContents headings={headings} sideBar />}
		</>
	);
}
