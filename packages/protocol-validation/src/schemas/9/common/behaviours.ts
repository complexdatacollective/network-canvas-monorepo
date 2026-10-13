import { z } from 'zod';

// Shared behaviours for the canvas-based layout interfaces (Sociogram and
// Narrative). Each behaviour is an optional boolean:
// - automaticLayout: position nodes with a force-directed layout
// - allowRepositioning: let the participant drag nodes to reposition them
// - freeDraw: let the participant draw annotations on the canvas
export const canvasBehavioursSchema = z
  .strictObject({
    automaticLayout: z.boolean().optional(),
    allowRepositioning: z.boolean().optional(),
    freeDraw: z.boolean().optional(),
  })
  .optional();

// Shared behaviours for the bin interfaces (OrdinalBin and CategoricalBin).
// - interactionMode: how the participant places a node in a bin. 'drag' (or
//   absent) is drag-and-drop from the drawer; 'select' presents one node at a
//   time and places it in the bin the participant clicks or taps. Both write
//   the same value.
export const binBehavioursSchema = z
  .strictObject({
    interactionMode: z.enum(['drag', 'select']).optional(),
  })
  .optional();
