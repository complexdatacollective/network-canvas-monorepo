import { z } from 'zod';

// Parsed in two stages: a loose shape whose superRefine produces the targeted,
// author-facing messages, piped into a union that narrows the STATIC TYPE to
// the two real variants (image XOR concentric circles). The union must accept
// exactly what the refine accepts, so a refine failure is always reported with
// the friendly message and the pipe stage never fails on its own.
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
  })
  .pipe(
    z.union([
      z.strictObject({
        image: z.string().min(1),
        concentricCircles: z.undefined().optional(),
        skewedTowardCenter: z.boolean().optional(),
      }),
      z.strictObject({
        image: z.undefined().optional(),
        concentricCircles: z.number().int().nonnegative(),
        skewedTowardCenter: z.boolean().optional(),
      }),
    ]),
  );
