import { z } from '@hono/zod-openapi';

// Realistic Studio response shapes, mirroring the session/network payloads the
// public API will serve (#1248). Three discriminated-union patterns are
// exercised deliberately:
//  1. entity-type union (node | edge | ego) — the codebook entity shape
//  2. event union (session lifecycle events) — webhook/event feed shape
//  3. nullable + heterogeneous attribute values — researcher-defined data

// Researcher-defined attribute values: string | number | boolean | string[] | null
export const VariableValueSchema = z
  .union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])
  .openapi('VariableValue');

const AttributesSchema = z
  .record(z.string(), VariableValueSchema)
  .openapi('Attributes');

// --- 1. Entity-type discriminated union ---------------------------------

export const NodeEntitySchema = z
  .object({
    entityType: z.literal('node'),
    id: z.uuid(),
    type: z.string(),
    attributes: AttributesSchema,
  })
  .openapi('NodeEntity');

export const EdgeEntitySchema = z
  .object({
    entityType: z.literal('edge'),
    id: z.uuid(),
    type: z.string(),
    from: z.uuid(),
    to: z.uuid(),
    attributes: AttributesSchema,
  })
  .openapi('EdgeEntity');

export const EgoEntitySchema = z
  .object({
    entityType: z.literal('ego'),
    id: z.uuid(),
    attributes: AttributesSchema,
  })
  .openapi('EgoEntity');

export const EntitySchema = z
  .discriminatedUnion('entityType', [
    NodeEntitySchema,
    EdgeEntitySchema,
    EgoEntitySchema,
  ])
  .openapi('Entity');

// --- 2. Session lifecycle event union -----------------------------------

export const SessionEventSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('session.started'),
        sessionId: z.uuid(),
        occurredAt: z.iso.datetime(),
      })
      .openapi('SessionStartedEvent'),
    z
      .object({
        type: z.literal('session.stage_completed'),
        sessionId: z.uuid(),
        stageId: z.string(),
        stageIndex: z.int().nonnegative(),
        occurredAt: z.iso.datetime(),
      })
      .openapi('SessionStageCompletedEvent'),
    z
      .object({
        type: z.literal('session.finished'),
        sessionId: z.uuid(),
        occurredAt: z.iso.datetime(),
      })
      .openapi('SessionFinishedEvent'),
    z
      .object({
        type: z.literal('session.abandoned'),
        sessionId: z.uuid(),
        lastStageId: z.string().nullable(),
        occurredAt: z.iso.datetime(),
      })
      .openapi('SessionAbandonedEvent'),
  ])
  .openapi('SessionEvent');

// --- 3. Composite payloads ----------------------------------------------

export const NetworkSchema = z
  .object({
    nodes: z.array(NodeEntitySchema),
    edges: z.array(EdgeEntitySchema),
    ego: z.union([EgoEntitySchema, z.null()]),
  })
  .openapi('Network');

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
  .openapi('Session');

// Pagination envelope per the API ADR conventions.
export const SessionPageSchema = z
  .object({
    data: z.array(SessionSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .openapi('SessionPage');

// RFC 9457 problem details.
export const ProblemSchema = z
  .object({
    // No `.default()`: contract schemas must have identical input and output
    // types (the ADR's fidelity lint rule).
    type: z.string(),
    title: z.string(),
    status: z.int(),
    detail: z.string().optional(),
  })
  .openapi('Problem');
