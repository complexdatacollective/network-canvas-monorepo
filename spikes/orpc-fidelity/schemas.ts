import { z } from 'zod';

// Port of spikes/openapi-fidelity/schemas.ts to plain Zod 4 + oRPC idiom:
// named components come from Zod's own registry via .meta({ id }) instead of
// @hono/zod-openapi's .openapi('Name').

export const VariableValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
  .meta({ id: 'VariableValue' });

const AttributesSchema = z
  .record(z.string(), VariableValueSchema)
  .meta({ id: 'Attributes' });

// --- 1. Entity-type discriminated union ---------------------------------

export const NodeEntitySchema = z
  .object({
    entityType: z.literal('node'),
    id: z.uuid(),
    type: z.string(),
    attributes: AttributesSchema,
  })
  .meta({ id: 'NodeEntity' });

export const EdgeEntitySchema = z
  .object({
    entityType: z.literal('edge'),
    id: z.uuid(),
    type: z.string(),
    from: z.uuid(),
    to: z.uuid(),
    attributes: AttributesSchema,
  })
  .meta({ id: 'EdgeEntity' });

export const EgoEntitySchema = z
  .object({
    entityType: z.literal('ego'),
    id: z.uuid(),
    attributes: AttributesSchema,
  })
  .meta({ id: 'EgoEntity' });

export const EntitySchema = z
  .discriminatedUnion('entityType', [
    NodeEntitySchema,
    EdgeEntitySchema,
    EgoEntitySchema,
  ])
  .meta({ id: 'Entity' });

// --- 2. Session lifecycle event union -----------------------------------

export const SessionEventSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('session.started'),
        sessionId: z.uuid(),
        occurredAt: z.iso.datetime(),
      })
      .meta({ id: 'SessionStartedEvent' }),
    z
      .object({
        type: z.literal('session.stage_completed'),
        sessionId: z.uuid(),
        stageId: z.string(),
        stageIndex: z.int().nonnegative(),
        occurredAt: z.iso.datetime(),
      })
      .meta({ id: 'SessionStageCompletedEvent' }),
    z
      .object({
        type: z.literal('session.finished'),
        sessionId: z.uuid(),
        occurredAt: z.iso.datetime(),
      })
      .meta({ id: 'SessionFinishedEvent' }),
    z
      .object({
        type: z.literal('session.abandoned'),
        sessionId: z.uuid(),
        lastStageId: z.string().nullable(),
        occurredAt: z.iso.datetime(),
      })
      .meta({ id: 'SessionAbandonedEvent' }),
  ])
  .meta({ id: 'SessionEvent' });

// --- 3. Composite payloads ----------------------------------------------

export const NetworkSchema = z
  .object({
    nodes: z.array(NodeEntitySchema),
    edges: z.array(EdgeEntitySchema),
    ego: z.union([EgoEntitySchema, z.null()]),
  })
  .meta({ id: 'Network' });

export const SessionSchema = z
  .object({
    id: z.uuid(),
    studyId: z.uuid(),
    wave: z.int().nonnegative(),
    status: z.enum(['in_progress', 'finished', 'abandoned']),
    network: NetworkSchema,
    lastEvent: z.union([SessionEventSchema, z.null()]),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'Session' });

export const SessionPageSchema = z
  .object({
    data: z.array(SessionSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .meta({ id: 'SessionPage' });

export const ProblemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.int(),
    detail: z.string().optional(),
  })
  .meta({ id: 'Problem' });
