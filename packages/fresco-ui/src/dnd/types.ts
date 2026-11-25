// Core types for drag and drop
export type DragMetadata = Record<string, unknown>;

export type DragItem = {
  id: string;
  type: string;
  metadata?: DragMetadata;
  _sourceZone: string | null;
};

export type DropTarget = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accepts: string[];
  acceptsFilter?: (metadata: DragMetadata | undefined) => boolean;
  announcedName?: string;
};

export type UseDropTargetReturn = {
  dropProps: {
    'ref': (element: HTMLElement | null) => void;
    'aria-label'?: string;
    'data-zone-id'?: string;
    'style'?: React.CSSProperties;
    'tabIndex'?: number;
  };
  isOver: boolean;
  willAccept: boolean;
  isDragging: boolean;
};

/**
 * What a drop handler returns: whether it took the drop. `false`, or a promise
 * that resolves to `false`, says it refused it (the change the drop would make
 * was not made); anything else, or a promise of anything else, says it took
 * it, at the moment the promise resolves.
 */
export type DropOutcome =
  // oxlint-disable-next-line typescript/no-invalid-void-type -- a handler that returns nothing takes every drop
  boolean | void | Promise<boolean | void>;

export type DropCallback = (metadata?: DragMetadata) => DropOutcome;

/**
 * What a drop on a target means, for an enclosing `DragFeedbackListener`: a
 * name its owner gives meaning to, or a function that names it for each drop
 * from the dropped item's metadata, for a target whose drops mean different
 * things for different items. Undefined declares none.
 */
export type DropFeedback =
  | string
  | ((metadata: DragMetadata | undefined) => string | undefined);

export type DropTargetState = DropTarget & {
  canDrop: boolean;
  isOver: boolean;
};

export type HitDetector = (
  x: number,
  y: number,
  dropTargets: Map<string, DropTargetState>,
) => string | null;
