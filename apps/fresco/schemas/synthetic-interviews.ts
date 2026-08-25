import { z } from 'zod';

import {
  MAX_SYNTHETIC_INTERVIEWS,
  parseSyntheticBatchToken,
} from '@codaco/protocol-utilities';

/**
 * The generation request the settings page posts.
 *
 * Server-side only, deliberately: the batch ceiling belongs to
 * `@codaco/protocol-utilities` (it is a property of asking for synthetic data,
 * not of any one host), and importing the engine package into a client bundle
 * would drag the whole generator in behind it. The count input receives the
 * ceiling as a prop from its server component instead.
 */
export const generateSyntheticInterviewsSchema = z.object({
  protocolId: z.string().min(1),
  count: z.number().int().min(1).max(MAX_SYNTHETIC_INTERVIEWS),
  simulateDropOut: z.boolean().default(true),
  respectSkipLogicAndFiltering: z.boolean().default(false),
  /**
   * Pin the batch's seed to reproduce an earlier one byte for byte. Omitted,
   * the route draws a fresh seed per batch and reports it with the
   * completion event.
   */
  seed: z.number().int().optional(),
  /**
   * Pin the batch's start-window anchor — the identity's other half, since
   * session dates and every date-relative drawn value follow it. Omitted,
   * the route draws a fresh day-quantised anchor and reports it with the
   * completion event alongside the seed.
   */
  startWindow: z.string().datetime().optional(),
  /**
   * The whole identity as the one copyable string the completion event
   * reports (`<seed>-<YYYY-MM-DD>`, or a bare seed). The dashboard sends
   * this; the identity logic stays server-side, where the engine already
   * lives, rather than being duplicated into a client bundle. Wins over the
   * split fields when both are sent.
   */
  batchToken: z
    .string()
    .refine((token) => parseSyntheticBatchToken(token) !== null, {
      message:
        'A batch token is the value a batch reported: a number, or number-YYYY-MM-DD',
    })
    .optional(),
});
