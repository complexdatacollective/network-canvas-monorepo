import { z } from 'zod';

// The Narrative's behaviours. Each behaviour is an optional boolean:
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

// The Sociogram's behaviours. Participants move nodes only in a layout task,
// and a Sociogram offers no free drawing, so automatic layout is the only one.
export const sociogramBehavioursSchema = z
  .strictObject({
    automaticLayout: z.boolean().optional(),
  })
  .optional();

// Shared behaviours for the bin interfaces (OrdinalBin and CategoricalBin).
// Absent, each keeps today's behaviour:
// - interactionMode: 'drag' places nodes by dragging them onto a bin;
//   'select' presents one node at a time and places it on the bin clicked
// - requireCompletePlacement: keep the participant on the stage until every
//   node has been placed for the current prompt
export const binBehavioursSchema = z
  .strictObject({
    interactionMode: z.enum(['drag', 'select']).optional(),
    requireCompletePlacement: z.boolean().optional(),
  })
  .optional();
