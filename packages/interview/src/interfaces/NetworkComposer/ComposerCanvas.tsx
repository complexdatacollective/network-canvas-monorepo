'use client';

import { clamp } from 'es-toolkit';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  entityPrimaryKeyProperty,
  type NcEdge,
  type NcNode,
} from '@codaco/shared-consts';
import CanvasNode from '~/canvas/CanvasNode';
import EdgeLayer from '~/canvas/EdgeLayer';
import { useCanvasStore, type CanvasStoreApi } from '~/canvas/useCanvasStore';

import { type ComposerStoreApi, useComposerStore } from './useComposerStore';

type Position = { x: number; y: number };

export type NodeTapModifiers = { shift: boolean; meta: boolean };

type ComposerCanvasProps = {
  canvasStore: CanvasStoreApi;
  composerStore: ComposerStoreApi;
  nodes: NcNode[];
  edges: NcEdge[];
  background: ReactNode;
  allowRepositioning?: boolean;
  simulation?: {
    moveNode: (nodeId: string, position: Position) => void;
    releaseNode: (nodeId: string) => void;
  } | null;
  onBackgroundTap: (position: Position) => void;
  onNodeTap: (nodeId: string, modifiers: NodeTapModifiers) => void;
  onEdgeTap: (edgeId: string) => void;
  onNodeDragEnd: (nodeId: string, position: Position) => void;
  renamingNodeId?: string | null;
  onCommitRename?: (nodeId: string, value: string) => void;
};

const DRAG_THRESHOLD = 5;

type RenameInputProps = {
  nodeId: string;
  canvasStore: CanvasStoreApi;
  onCommit: (value: string) => void;
};

function RenameInput({ nodeId, canvasStore, onCommit }: RenameInputProps) {
  const [value, setValue] = useState('');
  const committed = useRef(false);
  const position = useCanvasStore(canvasStore, (s) => s.positions.get(nodeId));

  const commit = useCallback(() => {
    if (committed.current) return;
    committed.current = true;
    onCommit(value);
  }, [onCommit, value]);

  if (!position) return null;

  return (
    <input
      data-testid="composer-node-rename"
      aria-label="Node name"
      type="text"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
      onBlur={commit}
      className="border-primary bg-background absolute z-20 w-32 -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-1 text-center text-sm outline-none"
      style={{
        left: `${position.x * 100}%`,
        top: `${position.y * 100}%`,
      }}
    />
  );
}

/** Ray-casting point-in-polygon test (normalized coordinates). */
function isPointInPolygon(point: Position, polygon: Position[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const { x, y } = point;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function ComposerCanvas({
  canvasStore,
  composerStore,
  nodes,
  edges,
  background,
  allowRepositioning = true,
  simulation = null,
  onBackgroundTap,
  onNodeTap,
  onEdgeTap,
  onNodeDragEnd,
  renamingNodeId = null,
  onCommitRename,
}: ComposerCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  // Records the starting point of a background gesture (null when no gesture).
  const downRef = useRef<{ x: number; y: number } | null>(null);
  // Whether the current gesture started on the background (not a child node).
  const gestureIsBackground = useRef(false);
  // Whether the lasso has been started for the current gesture.
  const lassoActive = useRef(false);
  // Captures pointer modifier state from the most recent pointer-down event.
  const modifierRef = useRef<NodeTapModifiers>({ shift: false, meta: false });

  const selectedNodeIds = useComposerStore(
    composerStore,
    (s) => s.selectedNodeIds,
  );
  const lassoPoints = useComposerStore(composerStore, (s) => s.lassoPoints);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      canvasStore.getState().setCanvasDimensions({ width, height });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasStore]);

  // Capture phase fires before stopPropagation in child handlers, so this
  // reliably captures modifier state from ALL pointer-downs — including on nodes
  // which call e.stopPropagation() in their own handlers.
  const handleContainerPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      modifierRef.current = { shift: e.shiftKey, meta: e.metaKey };
    },
    [],
  );

  const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;

    // Only start a background gesture when the event target is the canvas
    // itself, not a child element (nodes, edges, etc.).
    if (e.target !== e.currentTarget) return;

    downRef.current = { x: e.clientX, y: e.clientY };
    gestureIsBackground.current = true;
    lassoActive.current = false;
  }, []);

  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!gestureIsBackground.current) return;
      const down = downRef.current;
      if (!down) return;

      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved < DRAG_THRESHOLD) return;

      const { activeTool, startLasso, addLassoPoint } =
        composerStore.getState();
      if (activeTool.kind !== 'select') return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (!lassoActive.current) {
        lassoActive.current = true;
        // Include the starting point in the lasso.
        startLasso();
        addLassoPoint({
          x: clamp((down.x - rect.left) / rect.width, 0, 1),
          y: clamp((down.y - rect.top) / rect.height, 0, 1),
        });
      }

      addLassoPoint({
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      });
    },
    [composerStore],
  );

  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      const wasBackground = gestureIsBackground.current;
      gestureIsBackground.current = false;

      if (!wasBackground || !down) return;

      if (lassoActive.current) {
        lassoActive.current = false;
        // Hit-test each node's canvas-store position against the lasso polygon.
        const {
          lassoPoints: pts,
          selectNodes,
          endLasso,
        } = composerStore.getState();
        if (pts && pts.length >= 3) {
          const { positions } = canvasStore.getState();
          const insideIds: string[] = [];
          for (const node of nodes) {
            const nodeId = node[entityPrimaryKeyProperty];
            const pos = positions.get(nodeId);
            if (pos && isPointInPolygon(pos, pts)) {
              insideIds.push(nodeId);
            }
          }
          selectNodes(insideIds);
        }
        endLasso();
        return;
      }

      // Pure tap (distance < DRAG_THRESHOLD): call onBackgroundTap.
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved >= DRAG_THRESHOLD) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      onBackgroundTap({
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      });
    },
    [composerStore, canvasStore, nodes, onBackgroundTap],
  );

  const lassoPolygonPoints =
    lassoPoints && lassoPoints.length >= 2
      ? lassoPoints.map((p) => `${p.x},${p.y}`).join(' ')
      : null;

  return (
    <div
      ref={canvasRef}
      className="relative size-full overflow-hidden"
      role="application"
      onPointerDownCapture={handleContainerPointerDownCapture}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
    >
      {/* Decorative background must not capture pointer events, otherwise its
          full-canvas layer becomes the pointerdown target and the background-tap
          handler (which requires e.target === the canvas) never fires — breaking
          add-node, tap-to-deselect, and lasso selection. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {background}
      </div>
      <EdgeLayer edges={edges} store={canvasStore} onEdgeSelect={onEdgeTap} />
      {nodes.map((node) => {
        const nodeId = node[entityPrimaryKeyProperty];
        return (
          <CanvasNode
            key={nodeId}
            node={node}
            canvasRef={canvasRef}
            store={canvasStore}
            onDragEnd={onNodeDragEnd}
            onSelect={(id) => onNodeTap(id, modifierRef.current)}
            selected={selectedNodeIds.has(nodeId)}
            allowRepositioning={allowRepositioning}
            simulation={simulation}
          />
        );
      })}
      {renamingNodeId && onCommitRename && (
        <RenameInput
          key={renamingNodeId}
          nodeId={renamingNodeId}
          canvasStore={canvasStore}
          onCommit={(value) => onCommitRename(renamingNodeId, value)}
        />
      )}
      {lassoPolygonPoints !== null && (
        <svg
          viewBox="0 0 1 1"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <polygon
            points={lassoPolygonPoints}
            fill="currentColor"
            fillOpacity={0.1}
            stroke="currentColor"
            strokeWidth={0.002}
            strokeDasharray="0.01 0.005"
          />
        </svg>
      )}
    </div>
  );
}
