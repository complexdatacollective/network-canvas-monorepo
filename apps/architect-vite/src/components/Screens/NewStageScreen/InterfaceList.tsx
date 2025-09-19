import { AnimatePresence, motion } from "motion/react";
import { Button } from "~/lib/legacy-ui/components";
import Interface from "./Interface";

type InterfaceListProps = {
	items?: Array<{ type: string }>;
	onSelect: (type: string) => void;
	highlightedIndex?: number;
	handleClearSearchAndFilter: () => void;
	setHighlighted: (index: number) => void;
	removeHighlighted: (index: number) => void;
};

const InterfaceList = ({
	items = [],
	onSelect,
	highlightedIndex = null,
	handleClearSearchAndFilter,
	setHighlighted,
	removeHighlighted,
}: InterfaceListProps) => (
	<motion.div className="flex flex-col my-4">
		{items.length === 0 && (
			<div className="absolute inset-0 flex flex-col items-center justify-center">
				<p className="text-center mb-4">
					No interfaces match your filter and/or search results. Try a different combination of types, or clear your
					filters and search query to see all available interfaces.
				</p>
				<Button onClick={handleClearSearchAndFilter}>Clear search and filter</Button>
			</div>
		)}
		<AnimatePresence initial={false}>
			{items.map(({ type: interfaceType }, index) => (
				<Interface
					key={interfaceType}
					type={interfaceType}
					onClick={onSelect}
					highlighted={index === highlightedIndex}
					setHighlighted={() => setHighlighted(index)}
					removeHighlighted={() => removeHighlighted(index)}
				/>
			))}
		</AnimatePresence>
	</motion.div>
);

export default InterfaceList;
