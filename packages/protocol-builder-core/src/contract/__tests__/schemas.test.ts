// @vitest-environment node
import { Exit, Schema } from 'effect';
import * as RpcSchema from 'effect/unstable/rpc/RpcSchema';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { assetSourceSchema } from '@codaco/protocol-validation';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  InvalidShape,
  NotLockHolder,
  PromotionFailed,
  ProtocolNotFound,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '../errors.ts';
import { ProtocolBuilderGroup, type ProtocolBuilderTag } from '../group.ts';
import {
  ProtocolEventSchema,
  SectionIdSchema,
  StageResourceInputSchema,
  StageSectionIdSchema,
  SubmitResultSchema,
} from '../schemas.ts';
import { HostSession } from '../session.ts';

// `Schema.toCodecJson` is the codec the rpc serializers derive for every
// payload, success and error, so a JSON round trip through it is what a
// client on either transport actually receives.
type Contract = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};

const overJson = <S extends Contract>(schema: S, value: S['Type']) => {
  const codec = Schema.toCodecJson(schema);
  const encoded = Schema.encodeUnknownSync(codec)(value);
  const wire: unknown = JSON.parse(JSON.stringify(encoded));
  const decoded: S['Type'] = Schema.decodeUnknownSync(codec)(wire);
  return { wire, decoded };
};

const accepts = <S extends Contract>(schema: S, value: unknown) =>
  Exit.isSuccess(Schema.decodeUnknownExit(schema)(value));

const stage = sectionId({ kind: 'stage', stageId: 'information-1' });

const contentRequest = (
  source: string,
  bytes = new Uint8Array([1, 2, 250]),
) => ({
  protocolId: 'protocol-1',
  editId: 'edit-1',
  requestId: 'request-1',
  request: {
    kind: 'content' as const,
    contentKind: 'image' as const,
    name: 'A picture',
    source,
    contentType: 'image/png',
    bytes,
  },
});

describe('a revision sequence on the wire', () => {
  it('survives JSON as a decimal string, past the float range', () => {
    const sequence = 9_007_199_254_740_993n;
    const { wire, decoded } = overJson(SubmitResultSchema, {
      revision: { sequence, contentHash: 'hash-1' },
    });
    expect(wire).toEqual({
      revision: { sequence: '9007199254740993', contentHash: 'hash-1' },
    });
    expect(decoded.revision.sequence).toBe(sequence);
  });

  it('carries a replayable event its cursor, and presence none', () => {
    const { decoded } = overJson(ProtocolEventSchema, {
      type: 'lock',
      sectionId: stage,
      cursor: '42',
    });
    expect(decoded).toEqual({ type: 'lock', sectionId: stage, cursor: '42' });

    const presence = overJson(ProtocolEventSchema, {
      type: 'presence',
      present: [],
    });
    expect(presence.wire).toEqual({ type: 'presence', present: [] });
  });
});

describe("a staged file's bytes on the wire", () => {
  it('survive JSON as base64', () => {
    const input = contentRequest('photo.png');
    const { wire, decoded } = overJson(StageResourceInputSchema, input);
    expect(wire).toMatchObject({ request: { bytes: 'AQL6' } });
    expect(decoded.request.kind).toBe('content');
    if (decoded.request.kind === 'content') {
      expect(decoded.request.bytes).toBeInstanceOf(Uint8Array);
      expect([...decoded.request.bytes]).toEqual([1, 2, 250]);
    }
  });

  it('survive a representative asset byte for byte', () => {
    const bytes = new Uint8Array(256 * 1024).map((_, i) => (i * 31) % 256);
    const { decoded } = overJson(
      StageResourceInputSchema,
      contentRequest('large.png', bytes),
    );
    expect(decoded.request.kind === 'content' && decoded.request.bytes).toEqual(
      bytes,
    );
  });
});

describe('a section id', () => {
  it('refuses a string that is not one', () => {
    for (const id of ['bogus', 'stage:', 'codebook:node:', '']) {
      expect(accepts(SectionIdSchema, id)).toBe(false);
    }
  });

  it("decodes to the taxonomy's own branded id", () => {
    expect(Schema.decodeUnknownSync(SectionIdSchema)('stage:abc')).toBe(
      sectionId({ kind: 'stage', stageId: 'abc' }),
    );
    expectTypeOf<
      typeof SectionIdSchema.Type
    >().toEqualTypeOf<ProtocolSectionId>();
    expectTypeOf<typeof SectionIdSchema.Encoded>().toEqualTypeOf<string>();
    expectTypeOf<
      typeof StageSectionIdSchema.Type
    >().toEqualTypeOf<ProtocolSectionId>();
  });

  it('is only a stage where a stage is asked for', () => {
    expect(accepts(StageSectionIdSchema, 'stage:abc')).toBe(true);
    for (const id of ['codebook:node:person', 'codebook:ego', 'settings']) {
      expect(accepts(SectionIdSchema, id)).toBe(true);
      expect(accepts(StageSectionIdSchema, id)).toBe(false);
    }
  });
});

describe("a staged file's name", () => {
  // The protocol schema validates the manifest with zod; the contract with
  // Effect. Both must refuse the same names, or a host could stage a file the
  // protocol would then refuse to publish.
  const REFUSED = ['..', 'a/b', 'a\\b', '', '../x.png', '/x.png'];
  const ACCEPTED = ['photo.png', 'a..b.mp4', '.hidden', 'with space.csv'];

  it.each(REFUSED)('refuses %j on both schemas', (source) => {
    expect(assetSourceSchema.safeParse(source).success).toBe(false);
    expect(accepts(StageResourceInputSchema, contentRequest(source))).toBe(
      false,
    );
  });

  it.each(ACCEPTED)('accepts %j on both schemas', (source) => {
    expect(assetSourceSchema.safeParse(source).success).toBe(true);
    expect(accepts(StageResourceInputSchema, contentRequest(source))).toBe(
      true,
    );
  });
});

const TAGS = [
  'AcquireLock',
  'Create',
  'Delete',
  'GetSection',
  'ListSections',
  'RefactorDeleteEntityType',
  'RefactorDeleteVariable',
  'ReleaseLock',
  'ResourcesDiscard',
  'ResourcesInspect',
  'ResourcesList',
  'ResourcesPreview',
  'ResourcesStage',
  'Submit',
  'WatchProtocol',
] as const satisfies ReadonlyArray<ProtocolBuilderTag>;

const failure = {
  reason: 'unavailable',
  message: 'down',
  retryable: true,
} as const;

// One instance of each refusal, so a procedure's declared error is read by
// what it accepts rather than by how the union happens to be built.
const REFUSALS = [
  new ProtocolNotFound({ protocolId: 'protocol-1' }),
  new SectionNotFound({ sectionId: stage }),
  new NotLockHolder({ sectionId: stage }),
  new PromotionFailed({ failure }),
  new SectionExists({ sectionId: stage }),
  new InvalidShape({ sectionId: stage, issues: [] }),
  new SectionsLocked({ blocked: [] }),
  new ReferencesRemain({ remaining: [] }),
];

const BASE = ['ProtocolNotFound', 'SectionNotFound'];
const REFACTOR = [...BASE, 'ReferencesRemain', 'SectionsLocked'];

// Today's oRPC contract, procedure by procedure: `oc.errors(protocolErrors)`
// on every one, and the `.errors(…)` each added.
const DECLARED: Record<(typeof TAGS)[number], ReadonlyArray<string>> = {
  AcquireLock: BASE,
  ReleaseLock: BASE,
  GetSection: BASE,
  ListSections: BASE,
  WatchProtocol: BASE,
  Submit: [
    ...BASE,
    'InvalidShape',
    'NotLockHolder',
    'PromotionFailed',
    'SectionsLocked',
  ],
  Create: [
    ...BASE,
    'InvalidShape',
    'PromotionFailed',
    'SectionExists',
    'SectionsLocked',
  ],
  Delete: REFACTOR,
  RefactorDeleteVariable: REFACTOR,
  RefactorDeleteEntityType: REFACTOR,
  ResourcesList: BASE,
  ResourcesStage: BASE,
  ResourcesDiscard: BASE,
  ResourcesInspect: BASE,
  ResourcesPreview: BASE,
};

describe('the protocol-builder group', () => {
  const rpcs = [...ProtocolBuilderGroup.requests.values()];

  it('declares exactly the fifteen procedures, once each', () => {
    const tags = rpcs.map((rpc) => rpc._tag);
    expect(tags.length).toBe(TAGS.length);
    expect([...tags].sort()).toEqual([...TAGS]);
  });

  it.each(TAGS)('%s refuses exactly what it refused before', (tag) => {
    const rpc = ProtocolBuilderGroup.requests.get(tag);
    if (rpc === undefined) throw new Error(`no ${tag}`);
    const error = RpcSchema.isStreamSchema(rpc.successSchema)
      ? rpc.successSchema.error
      : rpc.errorSchema;
    const declared = REFUSALS.filter((refusal) => Schema.is(error)(refusal))
      .map((refusal) => refusal._tag)
      .sort();
    expect(declared).toEqual([...DECLARED[tag]].sort());
  });

  it.each(TAGS)('%s runs behind the host session', (tag) => {
    const rpc = ProtocolBuilderGroup.requests.get(tag);
    expect(rpc?.middlewares.has(HostSession)).toBe(true);
  });

  it('streams only WatchProtocol', () => {
    const streaming = rpcs
      .filter((rpc) => RpcSchema.isStreamSchema(rpc.successSchema))
      .map((rpc) => rpc._tag);
    expect(streaming).toEqual(['WatchProtocol']);
  });

  it('keeps each refusal its message', () => {
    expect(REFUSALS.map((refusal) => refusal.message)).toEqual([
      'no such protocol',
      'no such section',
      'the section is not locked by this caller',
      'the resources this write promotes could not be committed',
      'the protocol already has this section',
      'the document is not shaped like this section',
      'another editor holds a section this change has to write',
      'the change would leave references this host cannot remove',
    ]);
  });
});
