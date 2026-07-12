import { AnimatePresence, motion } from 'motion/react';

import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import Interface from './Interface';
type InterfaceListProps = {
  items?: Array<{
    type: string;
  }>;
  onSelect: (type: string) => void;
  highlightedIndex?: number;
  handleClearSearchAndFilter: () => void;
  setHighlighted: (index: number) => void;
  removeHighlighted: (index: number) => void;
};
const InterfaceList = ({
  items = [],
  onSelect,
  highlightedIndex,
  handleClearSearchAndFilter,
  setHighlighted,
  removeHighlighted,
}: InterfaceListProps) => (
  <motion.div className="flex flex-col">
    {items.length === 0 && (
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Paragraph className="mb-4 w-4/5 text-center">
          No interfaces match your filter and/or search results. Try a different
          combination of types, or clear your filters and search query to see
          all available interfaces.
        </Paragraph>
        <Button onClick={handleClearSearchAndFilter}>
          Clear search and filter
        </Button>
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
