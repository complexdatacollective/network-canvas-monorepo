import { Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';

export type DeckCardMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
};

// The actions of a card that offers more than removing it (every protocol's
// card: see its details, delete it). Sized and styled like the card's remove
// control, in the same place.
export function DeckCardMenu({
  label,
  items,
}: {
  /** Accessible name of the menu button. */
  label: string;
  items: readonly DeckCardMenuItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <IconButton
            icon={<Ellipsis />}
            aria-label={label}
            variant="outline"
            color="dynamic"
            className="bg-rich-black/60 text-platinum size-[max(40px,10cqi)] border text-[max(16px,4cqi)]"
            // The card activates on a click that reaches it; opening its menu
            // must not also start an interview.
            onClick={(event) => event.stopPropagation()}
          />
        }
      />
      <DropdownMenuContent side="bottom" align="end">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            icon={item.icon}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
