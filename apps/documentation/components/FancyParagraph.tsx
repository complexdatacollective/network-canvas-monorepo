import { Paragraph, type ParagraphProps } from "@codaco/ui";
import { motion } from "motion/react";
import { Children } from "react";

// FancyParagraph animates individual words in a paragraph.
const FancyParagraph = (props: ParagraphProps) => {
	const { children, ...rest } = props;

	const words = Children.toArray(children);

	const variants = {
		hidden: { y: "100%" },
		visible: (custom: number) => ({
			y: 0,
			transition: {
				type: "spring",
				stiffness: 200,
				damping: 30,
				mass: 1,
				delay: 0.1 * custom,
			},
		}),
	};

	const renderWord = (word: string, outerIndex: number) => {
		const segments = word.split(" ");
		return segments.map((segment, innerIndex) => (
			<span
				// biome-ignore lint/suspicious/noArrayIndexKey: word index won't change
				key={`${outerIndex}-${innerIndex}`}
				className="relative -top-[0.75em] -mb-[1em] inline-block overflow-hidden"
			>
				<motion.span
					custom={outerIndex + innerIndex}
					variants={variants}
					initial="hidden"
					animate="visible"
					className="inline-block"
				>
					{segment}&nbsp;
				</motion.span>
			</span>
		));
	};

	return (
		<Paragraph {...rest}>
			{words.map((word, index) =>
				typeof word === "string" ? (
					renderWord(word, index)
				) : (
					<motion.span
						// biome-ignore lint/suspicious/noArrayIndexKey: word index won't change
						key={index}
						custom={index}
						variants={variants}
						initial="hidden"
						animate="visible"
						className="inline-block"
					>
						{word}
					</motion.span>
				),
			)}
		</Paragraph>
	);
};

export default FancyParagraph;
