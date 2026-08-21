import { z } from 'zod';

import { MAX_SYNTHETIC_INTERVIEWS } from '@codaco/protocol-utilities';

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
   * Pin the batch's seed to reproduce an earlier one byte for byte. Omitted —
   * which is what the settings page sends — the route draws a fresh seed per
   * batch and reports it with the completion event.
   */
  seed: z.number().int().optional(),
});
