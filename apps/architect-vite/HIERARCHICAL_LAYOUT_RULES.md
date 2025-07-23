# Hierarchical Timeline Layout Rules

This document describes the layout rules implemented by the hierarchical timeline layout algorithm in Network Canvas Architect.

## Overview

The hierarchical layout system arranges timeline nodes in a tree structure with the following key characteristics:

- Top-to-bottom flow
- Automatic branch width calculation
- Intelligent vertical spacing
- Convergence point handling

## Core Layout Rules

### 1. Tree Structure Rules

#### 1.1 Root Node

- There must be exactly one root node in the timeline
- The root node is positioned at the top center of the layout
- The root node has no parent connections

#### 1.2 Branch Nodes

- Branch nodes must have at least 2 child connections
- Branch nodes create horizontal distribution of their children
- Branch width is calculated based on the combined width of all child subtrees

#### 1.3 Stage Nodes

- Stage nodes can have 0 or 1 child connections
- Stage nodes represent linear progression in the timeline
- Multiple stage nodes can converge to a single node (convergence point)

#### 1.4 Convergence Points

- Special nodes (like FinishStage) that multiple branches lead to
- Must be horizontally centered in the layout
- Should not be included when calculating branch depths or node counts

### 2. Horizontal Positioning Rules

#### 2.1 Node Width Calculation

- Each node has a base width (default: 180px)
- Subtree width = max(node width, sum of children widths + horizontal spacing)
- Horizontal spacing between siblings (default: 60px)

#### 2.2 Center Alignment

- Root nodes are centered horizontally
- Convergence points (like FinishStage) are centered horizontally
- Nodes are centered within their allocated subtree width

### 3. Vertical Positioning Rules

#### 3.1 Basic Vertical Spacing

- Vertical spacing between levels (default: 80px)
- Initial positions are calculated top-down based on depth

#### 3.2 Reference Branch Selection

- When multiple sibling branches exist, identify the "reference branch"
- Reference branch = the branch with the longest linear chain of nodes
- Linear chain length = maximum depth of nodes in the branch (excluding convergence points)

#### 3.3 Single-Node Branch Alignment

- Single-node branches must align horizontally with the middle node of the reference branch
- For a reference branch with N nodes (indices 0 to N-1):
  - Middle node index = floor(N / 2)
  - Example: For 3 nodes, middle index = 1

#### 3.4 Multi-Node Branch Distribution

- Branches with multiple nodes are distributed within the vertical span of the reference branch
- Distribution follows a "space-between" pattern:
  - First node aligns with the top of the reference branch
  - Last node aligns with the bottom of the reference branch
  - Middle nodes are evenly distributed in between
  - Spacing = (total available height - sum of node heights) / (number of nodes - 1)

### 4. Special Cases

#### 4.1 Two-Sibling Distribution

- When only two branches exist as siblings:
  - If one has multiple nodes and one has a single node
  - The single node is centered within the vertical span of the multi-node branch

#### 4.2 Convergence Point Handling

- Nodes named "FinishStage" are treated as convergence points
- Convergence points are excluded from:
  - Branch depth calculations
  - Node count calculations
  - Reference branch node collection
- This prevents artificial inflation of branch sizes

### 5. Layout Calculation Order

1. **Build Tree Structure**
   - Identify root node
   - Establish parent-child relationships
   - Calculate node depths

2. **Calculate Subtree Widths** (bottom-up)
   - Start from leaf nodes
   - Calculate combined width of children
   - Apply to parent nodes recursively

3. **Calculate Initial Positions** (top-down)
   - Position root at (0, 0)
   - Position children based on subtree widths
   - Apply horizontal spacing

4. **Adjust Vertical Spacing**
   - Find all branch points (nodes with multiple children)
   - For each branch point:
     - Identify reference branch (longest linear chain)
     - Align single-node branches with middle of reference
     - Distribute multi-node branches within reference span

5. **Center Special Nodes**
   - Identify convergence points
   - Center them horizontally within the total layout width

## Implementation Constants

```typescript
const LAYOUT_CONFIG = {
  nodeWidth: 180,        // Base width of a node
  nodeHeight: 120,       // Base height of a node
  horizontalSpacing: 60, // Space between sibling nodes
  verticalSpacing: 80,   // Space between vertical levels
  minZoom: 0.1,         // Minimum zoom level
  maxZoom: 3,           // Maximum zoom level
  zoomStep: 0.1         // Zoom increment
};
```

## Visual Examples

### Example 1: Single-Node Branch Alignment

```
        Root
         |
     [Branch]
    /    |    \
  N1   [N2]    N3
         |      |
        N4     N5
                |
               N6
```

- N1 aligns with N4 (middle of reference branch N3-N5-N6)

### Example 2: Multi-Node Branch Distribution

```
        Root
         |
     [Branch]
    /         \
  N1          N4
   |           |
  N2          N5
   |           |
  N3          N6
```

- N1-N2-N3 distributed to span same height as N4-N5-N6

## Validation Rules

1. Every line must have exactly one root node
2. All node references must point to existing nodes
3. Branch nodes must have at least 2 children
4. No circular references are allowed
5. All paths must eventually lead to a convergence point or terminal node
