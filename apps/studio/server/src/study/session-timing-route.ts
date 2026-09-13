import type { Handler } from 'hono';
import type pg from 'pg';
import { z } from 'zod';

import {
  openInterviewSession,
  releaseInterviewSession,
  SessionTimingError,
  StageTimingSchema,
  StageTimingValidationError,
  writeInterviewTiming,
} from './session-timing.ts';

const BodySchema = z.object({
  writerId: z.string().trim().min(1).max(128),
  holderEpoch: z.number().int().nonnegative().safe(),
  syncRevision: z.number().int().nonnegative().safe(),
  stageTiming: StageTimingSchema.optional(),
  currentStageIndex: z.number().int().nonnegative().max(10_000).optional(),
  currentStageId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .nullable()
    .optional(),
});

const OpenBodySchema = z.object({
  writerId: z.string().trim().min(1).max(128),
  takeover: z.boolean().optional(),
});

const ReleaseBodySchema = z.object({
  writerId: z.string().trim().min(1).max(128),
  holderEpoch: z.number().int().nonnegative().safe(),
});

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * The participant runtime's timing-only sync seam. Network/entity writes will
 * use the same holder and revision fence when the Studio interview surface is
 * implemented; this route deliberately accepts no participant answers.
 */
export function createSessionTimingRoute(pool: pg.Pool): Handler {
  return async (context) => {
    const accessToken = bearerToken(context.req.header('Authorization'));
    const sessionId = context.req.param('sessionId');
    if (!accessToken || !sessionId) {
      return context.json({ error: 'Not found' }, 404);
    }

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'Invalid timing payload' }, 400);
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'Invalid timing payload' }, 400);
    }

    try {
      const outcome = await writeInterviewTiming(pool, {
        ...parsed.data,
        sessionId,
        accessToken,
      });
      return context.json({
        success: true,
        applied: outcome.applied,
        frozen: outcome.kind === 'frozen',
        syncRevision: outcome.syncRevision,
      });
    } catch (error) {
      if (error instanceof SessionTimingError) {
        if (error.code === 'HOLDER_CONFLICT') {
          return context.json(
            { error: 'Session writer is no longer active' },
            409,
          );
        }
        return context.json({ error: 'Not found' }, 404);
      }
      if (error instanceof z.ZodError) {
        return context.json({ error: 'Invalid timing payload' }, 400);
      }
      if (error instanceof StageTimingValidationError) {
        return context.json({ error: 'Invalid timing payload' }, 400);
      }
      throw error;
    }
  };
}

/** Claims the participant writer fence before the first timing sync. */
export function createSessionTimingOpenRoute(pool: pg.Pool): Handler {
  return async (context) => {
    const accessToken = bearerToken(context.req.header('Authorization'));
    const sessionId = context.req.param('sessionId');
    if (!accessToken || !sessionId) {
      return context.json({ error: 'Not found' }, 404);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'Invalid timing payload' }, 400);
    }
    const parsed = OpenBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json({ error: 'Invalid timing payload' }, 400);
    }
    try {
      const opened = await openInterviewSession(pool, {
        sessionId,
        accessToken,
        writerId: parsed.data.writerId,
        takeover: parsed.data.takeover,
      });
      return context.json({
        success: true,
        holderEpoch: opened.holderEpoch,
        syncRevision: opened.syncRevision,
        stageTiming: opened.stageTiming,
      });
    } catch (error) {
      if (error instanceof SessionTimingError) {
        return context.json(
          {
            error:
              error.code === 'HOLDER_CONFLICT'
                ? 'Session writer is no longer active'
                : 'Not found',
          },
          error.code === 'HOLDER_CONFLICT' ? 409 : 404,
        );
      }
      throw error;
    }
  };
}

/** Voluntarily releases the authenticated writer fence. */
export function createSessionTimingReleaseRoute(pool: pg.Pool): Handler {
  return async (context) => {
    const accessToken = bearerToken(context.req.header('Authorization'));
    const sessionId = context.req.param('sessionId');
    if (!accessToken || !sessionId) {
      return context.json({ error: 'Not found' }, 404);
    }
    const parsed = ReleaseBodySchema.safeParse(
      await context.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return context.json({ error: 'Invalid timing payload' }, 400);
    }
    try {
      const released = await releaseInterviewSession(pool, {
        sessionId,
        accessToken,
        ...parsed.data,
      });
      return context.json({ success: true, released });
    } catch (error) {
      if (error instanceof SessionTimingError) {
        return context.json({ error: 'Not found' }, 404);
      }
      if (error instanceof z.ZodError) {
        return context.json({ error: 'Invalid timing payload' }, 400);
      }
      throw error;
    }
  };
}
