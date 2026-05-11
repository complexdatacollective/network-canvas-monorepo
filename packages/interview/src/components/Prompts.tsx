"use client";

import UIPrompts from "./Prompts/Prompts";
import { usePrompts } from "./Prompts/usePrompts";

const Prompts = ({ small, id }: { small?: boolean; id?: string }) => {
	const { prompt, prompts } = usePrompts();

	return <UIPrompts currentPromptId={prompt.id} prompts={prompts} small={small} id={id} />;
};

export default Prompts;
