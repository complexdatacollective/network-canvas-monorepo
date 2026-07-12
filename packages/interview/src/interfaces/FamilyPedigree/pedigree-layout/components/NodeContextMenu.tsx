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
  | 'edit'
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
  // Nodes can only be changed while building the pedigree. Once finalized there
  // are no available actions, so the node renders without a menu.
  if (isFinalized) {
    return children;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={children} />
      <DropdownMenuContent>
        <DropdownMenuItem
          className={menuItemClass}
          data-testid="pedigree-menu-parent"
          onClick={() => onAction('parent')}
        >
          Add parent
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClass}
          data-testid="pedigree-menu-child"
          onClick={() => onAction('child')}
        >
          Add child
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClass}
          data-testid="pedigree-menu-partner"
          onClick={() => onAction('partner')}
        >
          Add partner
        </DropdownMenuItem>
        <DropdownMenuItem
          className={menuItemClass}
          data-testid="pedigree-menu-sibling"
          disabled={!canAddSibling}
          onClick={() => onAction('sibling')}
        >
          <span className="flex flex-col items-start">
            <span>Add sibling</span>
            {!canAddSibling && (
              <span className="text-xs opacity-70">Add a parent first</span>
            )}
          </span>
        </DropdownMenuItem>
        {!isEgo && (
          <>
            <DropdownMenuSeparator className="my-1 h-px bg-current/20" />
            <DropdownMenuItem
              className={menuItemClass}
              data-testid="pedigree-menu-edit"
              onClick={() => onAction('edit')}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className={destructiveMenuItemClass}
              data-testid="pedigree-menu-delete"
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
