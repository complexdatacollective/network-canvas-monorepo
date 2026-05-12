"use client";

import Surface from "@codaco/fresco-ui/layout/Surface";
import { ALLOWED_MARKDOWN_SECTION_TAGS, RenderMarkdown } from "@codaco/fresco-ui/RenderMarkdown";
import Heading from "@codaco/fresco-ui/typography/Heading";

type IntroPanelProps = {
	title: string;
	text: string;
};

export default function IntroPanel({ title, text }: IntroPanelProps) {
	return (
		<div className="flex size-full items-center justify-center">
			<Surface className="h-auto max-h-[75%] shadow-xl" maxWidth="3xl">
				<Heading level="h1" className="text-center">
					{title}
				</Heading>
				<RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>{text}</RenderMarkdown>
			</Surface>
		</div>
	);
}
