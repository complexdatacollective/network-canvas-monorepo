import { findIndex } from "lodash";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import Pips from "./Pips";
import Prompt from "./Prompt";

interface PromptItem {
	id: string;
	text: string;
}

interface PromptsProps {
	prompts: PromptItem[];
	currentPrompt: string;
	speakable?: boolean;
}

/**
 * Displays prompts
 */
const Prompts = ({ currentPrompt, prompts, speakable = false }: PromptsProps) => {
	const prevPromptRef = useRef<number>();

	const currentIndex = findIndex(prompts, (prompt) => prompt.id === currentPrompt);

	useEffect(() => {
		prevPromptRef.current = currentIndex;
	}, [currentPrompt]);

	const backwards = useMemo(() => currentIndex < (prevPromptRef.current ?? 0), [currentIndex]);

	return (
		<motion.div
			className="prompts"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{
				duration: 0.5,
			}}
		>
			{prompts.length > 1 ? (
				<Pips count={prompts.length} currentIndex={currentIndex} />
			) : (
				<div className="prompts__spacer" />
			)}
			<AnimatePresence custom={backwards} exitBeforeEnter initial={false}>
				{prompts.map(
					({ id, text }) =>
						prompts[currentIndex].id === id && (
							<Prompt key={id} id={id} text={text} backwards={backwards} speakable={speakable} />
						),
				)}
			</AnimatePresence>
			<div className="prompts__spacer" />
		</motion.div>
	);
};

export default Prompts;
