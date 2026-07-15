import { z } from 'zod';

// The Sociogram/NetworkComposer canvas background: exactly one of a custom
// image or a concentric-circles count (0 or more rings). Narrative has no
// image variant and declares its circles-only background inline.
export const imageOrCirclesBackgroundSchema = z
  .strictObject({
    image: z.string().min(1).optional(),
    concentricCircles: z.number().int().nonnegative().optional(),
    skewedTowardCenter: z.boolean().optional(),
  })
  .superRefine((background, ctx) => {
    if (background.image === undefined) {
      if (background.concentricCircles === undefined) {
        ctx.addIssue({
          code: 'custom' as const,
          message:
            'concentricCircles is required when background has no image.',
          path: ['concentricCircles'],
        });
      }
    } else if (background.concentricCircles !== undefined) {
      ctx.addIssue({
        code: 'custom' as const,
        message:
          'concentricCircles cannot be set when background has an image.',
        path: ['concentricCircles'],
      });
    }
  });
