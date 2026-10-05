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
