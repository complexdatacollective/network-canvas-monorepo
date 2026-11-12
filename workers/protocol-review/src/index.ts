import { DurableObject } from 'cloudflare:workers';

import { createAnthropicModel } from './anthropic-model.ts';
import { LIMITER_INSTANCE_NAME } from './constants.ts';
import type { ProviderAvailability } from './contract.ts';
import {
  type AdmitRequest,
  type AdmitResult,
  type AvailabilityRequest,
  admit,
  availability,
  type LimiterStore,
  type SettleRequest,
  settle,
} from './limiter.ts';
import { createPostHogNotifier, logFailure } from './notify.ts';
import { createOpenAIModel } from './openai-model.ts';
import { handleRequest } from './review.ts';
import { createSqlStore } from './sql-store.ts';

/**
 * Wires the review service to Cloudflare: the limiter's Durable Object, the
 * shared-review KV namespace, the model, and PostHog. The logic lives in the
 * modules it imports, which are tested without the Workers runtime.
 */

/**
 * `DEV_ALLOWED_ORIGIN` is set only in `.dev.vars` for local development, so
 * the generated `Env` does not declare it.
 */
type ReviewEnv = Env & { DEV_ALLOWED_ORIGIN?: string };

/**
 * Every hourly window and each provider's daily spending, in one SQLite-backed instance
 * (`LIMITER_INSTANCE_NAME`). Its methods hold no awaits, so each runs to
 * completion before the next request's starts, and the counts stay exact.
 */
export class ReviewLimiter extends DurableObject<Env> {
  private readonly store: LimiterStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.store = createSqlStore(ctx.storage.sql);
  }

  availability(request: AvailabilityRequest): ProviderAvailability[] {
    return availability(this.store, request);
  }

  admit(request: AdmitRequest): AdmitResult {
    return admit(this.store, request);
  }

  settle(request: SettleRequest): void {
    settle(this.store, request);
  }
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
};

export default {
  fetch(request, env: ReviewEnv, ctx) {
    const limiter = env.LIMITER.getByName(LIMITER_INSTANCE_NAME);
    return handleRequest(request, {
      devOrigin: env.DEV_ALLOWED_ORIGIN,
      limiter: {
        availability: async (availabilityRequest) =>
          limiter.availability(availabilityRequest),
        admit: async (admitRequest) => limiter.admit(admitRequest),
        settle: async (settleRequest) => {
          await limiter.settle(settleRequest);
        },
      },
      models: {
        anthropic: createAnthropicModel(env.ANTHROPIC_API_KEY),
        openai: createOpenAIModel(env.OPENAI_API_KEY),
      },
      sharedReviews: {
        put: async (key, value, options) => {
          await env.SHARED_REVIEWS.put(key, value, options);
        },
      },
      notify: createPostHogNotifier((input, init) => fetch(input, init)),
      log: logFailure,
      waitUntil: (promise) => ctx.waitUntil(promise),
      now: () => Date.now(),
      randomId: () => crypto.randomUUID(),
      hash: sha256Hex,
    });
  },
} satisfies ExportedHandler<ReviewEnv>;
