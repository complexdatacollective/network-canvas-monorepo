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
  onNodeTap: (nodeId: string) => void;
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
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const selectedNodeIds = useComposerStore(
    composerStore,
    (s) => s.selectedNodeIds,
  );

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

  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    downRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleBackgroundPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const down = downRef.current;
      downRef.current = null;
      if (!down) return;
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
    [onBackgroundTap],
  );

  return (
    <div
      ref={canvasRef}
      className="relative size-full overflow-hidden"
      role="application"
      onPointerDown={handleBackgroundPointerDown}
      onPointerUp={handleBackgroundPointerUp}
    >
      <div className="absolute inset-0 flex items-center justify-center">
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
            onSelect={onNodeTap}
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
    </div>
  );
}
