import { Button } from "@codaco/legacy-ui/components";
import { AnimatePresence, motion } from "motion/react";
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
	<motion.div className="new-stage-screen__interfaces">
		{items.length === 0 && (
			<div className="new-stage-screen__interfaces--empty">
				<p>
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
