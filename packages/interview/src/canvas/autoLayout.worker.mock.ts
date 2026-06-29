// Deterministic stand-in for autoLayout.worker. Loaded only when
// NEXT_PUBLIC_E2E_TEST=true (see useAutoLayout.ts) so e2e snapshots of
// auto-layout stages don't capture a randomly-evolving d3-force layout.
//
// The `mockLayout` init option selects the layout strategy:
//   'identity' — echo the seeded positions unchanged. Used by Narrative, which
//                seeds from authored positions, so the snapshot shows the
//                authored layout deterministically.
//   'grid'     — lay nodes on a deterministic grid in PIXEL coordinates. Used by
//                Sociogram, which has no meaningful seed.
// Every command emits `end` so isRunning settles on the next event-loop turn
// (the test fixture waits on data-simulation-running="false"). update_node
// applies fx/fy in both modes.

type SimNode = {
  nodeId?: string;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
};

type SimLink = { source: number; target: number };

type MockLayout = 'identity' | 'grid';

type InitializeMessage = {
  type: 'initialize';
  nodes: SimNode[];
  links?: SimLink[];
  options?: { mockLayout?: MockLayout; canvasWidth?: number };
};
type StopMessage = { type: 'stop' };
type StartMessage = { type: 'start' };
type ReheatMessage = { type: 'reheat' };
type UpdateLinksMessage = { type: 'update_links'; links: SimLink[] };
type UpdateNodeMessage = {
  type: 'update_node';
  nodeId: string;
  node: Partial<SimNode>;
};

type Message =
  | InitializeMessage
  | StopMessage
  | StartMessage
  | ReheatMessage
  | UpdateLinksMessage
  | UpdateNodeMessage;

// Fraction of the canvas the grid spans; kept inside the bounds so all positions
// normalize within [0, 1] in the main thread. Falls back to a px span when no
// canvas width is supplied.
const GRID_SPAN_FRACTION = 0.8;
const FALLBACK_GRID_SPAN = 800;

// Build all valid grid cells (px) in row-major order, skipping the top-right
// quadrant where the prompts panel renders and would intercept pointer events.
function buildValidCells(
  side: number,
  span: number,
  center: number,
): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const half = span / 2;
  const step = side > 1 ? span / (side - 1) : 0;
  const origin = side > 1 ? center - half : center;
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) {
      const x = origin + col * step;
      const y = origin + row * step;
      // Skip the top-right quadrant relative to the grid center.
      if (x > center && y < center) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

function gridLayout(input: SimNode[], span: number, center: number): SimNode[] {
  const n = input.length;
  if (n === 0) return [];
  let side = Math.max(1, Math.ceil(Math.sqrt((n * 4) / 3)));
  let cells = buildValidCells(side, span, center);
  while (cells.length < n) {
    side += 1;
    cells = buildValidCells(side, span, center);
  }
  return input.map((node, i) => {
    if (node.fx != null && node.fy != null) {
      return { ...node, x: node.fx, y: node.fy };
    }
    const cell = cells[i]!;
    return { ...node, x: cell.x, y: cell.y };
  });
}

let nodes: SimNode[] = [];
let mockLayout: MockLayout = 'identity';

function emit(type: 'tick' | 'end') {
  postMessage({ type, nodes });
}

function applyLayout(input: SimNode[], canvasWidth?: number): SimNode[] {
  if (mockLayout === 'identity') {
    return input.map((node) => ({ ...node }));
  }
  const span =
    canvasWidth && canvasWidth > 0
      ? canvasWidth * GRID_SPAN_FRACTION
      : FALLBACK_GRID_SPAN;
  const center = canvasWidth && canvasWidth > 0 ? canvasWidth / 2 : 0;
  return gridLayout(input, span, center);
}

self.onmessage = ({ data }: { data: Message }) => {
  switch (data.type) {
    case 'initialize':
      mockLayout = data.options?.mockLayout ?? 'identity';
      nodes = applyLayout(data.nodes, data.options?.canvasWidth);
      emit('tick');
      emit('end');
      break;
    case 'update_links':
    case 'start':
    case 'reheat':
    case 'stop':
      emit('end');
      break;
    case 'update_node': {
      nodes = nodes.map((node) => {
        if (node.nodeId !== data.nodeId) return node;
        const patched: Partial<SimNode> = { ...data.node };
        if (patched.fx === null && node.fx != null) patched.x = node.fx;
        if (patched.fy === null && node.fy != null) patched.y = node.fy;
        if (patched.fx != null) patched.x = patched.fx;
        if (patched.fy != null) patched.y = patched.fy;
        return { ...node, ...patched };
      });
      emit('end');
      break;
    }
    default:
  }
};
