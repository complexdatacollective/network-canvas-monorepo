import { AnimatePresence, motion } from 'motion/react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import Interface from './Interface';
const messages = defineMessages({
  noInterfacesMatchYourFilterAndOr: {
    id: 'architect.screens.newStageScreen.interfaceList.noInterfacesMatchYourFilterAndOr',
    defaultMessage:
      'No interfaces match your filter and/or search results. Try a different combination of types, or clear your filters and search query to see all available interfaces.',
    description:
      'Visible text in components / Screens / NewStageScreen / InterfaceList.',
  },
  clearSearchAndFilter: {
    id: 'architect.screens.newStageScreen.interfaceList.clearSearchAndFilter',
    defaultMessage: 'Clear search and filter',
    description:
      'Visible text in components / Screens / NewStageScreen / InterfaceList.',
  },
});

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
}: InterfaceListProps) => {
  const intl = useAppIntl();
  return (
    <motion.div className="flex flex-col">
      {items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Paragraph className="mb-4 w-4/5 text-center">
            {intl.formatMessage(messages.noInterfacesMatchYourFilterAndOr)}
          </Paragraph>
          <Button onClick={handleClearSearchAndFilter}>
            {intl.formatMessage(messages.clearSearchAndFilter)}
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
};
export default InterfaceList;
