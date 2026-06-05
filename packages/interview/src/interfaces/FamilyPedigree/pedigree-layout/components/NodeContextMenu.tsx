'use client';

import type { ReactElement } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import { cx } from '@codaco/fresco-ui/utils/cva';

export type NodeContextMenuAction =
  | 'parent'
  | 'child'
  | 'partner'
  | 'sibling'
  | 'editName'
  | 'delete';

type NodeContextMenuProps = {
  isEgo: boolean;
  isFinalized: boolean;
  canAddSibling: boolean;
  onAction: (action: NodeContextMenuAction) => void;
  children: ReactElement;
};

const menuItemClass = cx(
  'relative flex cursor-default items-center gap-2 px-8 py-2 text-sm font-semibold outline-hidden select-none',
  'data-highlighted:bg-accent data-highlighted:text-accent-contrast',
);

const destructiveMenuItemClass = cx(
  menuItemClass,
  'text-destructive data-highlighted:bg-destructive data-highlighted:text-destructive-contrast',
);

export default function NodeContextMenu({
  isEgo,
  isFinalized,
  canAddSibling,
  onAction,
  children,
}: NodeContextMenuProps) {
  // Once finalized only names may be edited, so the ego (whose name is fixed)
  // has no available actions and shows no menu.
  if (isFinalized && isEgo) {
    return children;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children} />
      <DropdownMenuContent>
        {!isFinalized && (
          <>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => onAction('parent')}
            >
              Add parent
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => onAction('child')}
            >
              Add child
            </DropdownMenuItem>
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => onAction('partner')}
            >
              Add partner
            </DropdownMenuItem>
            {canAddSibling && (
              <DropdownMenuItem
                className={menuItemClass}
                onClick={() => onAction('sibling')}
              >
                Add sibling
              </DropdownMenuItem>
            )}
          </>
        )}
        {!isEgo && (
          <>
            {!isFinalized && (
              <DropdownMenuSeparator className="my-1 h-px bg-current/20" />
            )}
            <DropdownMenuItem
              className={menuItemClass}
              onClick={() => onAction('editName')}
            >
              Edit name
            </DropdownMenuItem>
          </>
        )}
        {!isFinalized && !isEgo && (
          <>
            <DropdownMenuSeparator className="my-1 h-px bg-current/20" />
            <DropdownMenuItem
              className={destructiveMenuItemClass}
              onClick={() => onAction('delete')}
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
