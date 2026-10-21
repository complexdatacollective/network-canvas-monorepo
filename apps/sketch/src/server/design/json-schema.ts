// zod 4 -> ONE JSON Schema accepted by both Anthropic structured outputs
// (output_config.format {type:'json_schema', schema}) and OpenAI Responses
// strict json_schema (text.format {type:'json_schema', name, strict:true, schema}).
// The normaliser only RENAMES (definitions->$defs, oneOf->anyOf, const->enum)
// and closes objects; everything else is ASSERTED so a schema change that
// would be rejected by a provider fails the unit test instead of production.
import { z } from 'zod';

type Json = { [k: string]: unknown };

// Keywords we allow anywhere in the emitted schema (outside `properties` maps).
const ALLOWED = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'anyOf',
  'enum',
  'description',
  '$ref',
  '$defs',
  'title',
]);

export type ProviderSchemaOptions = {
  /** true (default): shared sub-schemas (.meta({id})) go to $defs. false: inline everything (fallback if a provider rejects $ref inside anyOf branches). */
  defs?: boolean;
};

export const toProviderJsonSchema = (
  schema: z.ZodType,
  opts: ProviderSchemaOptions = {},
): Json => {
  const raw = z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'output',
    unrepresentable: 'throw',
    cycles: 'throw',
    reused: 'inline',
  }) as Json;
  const defs = (raw.definitions ?? {}) as Json;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== 'object') return node;
    const o = node as Json;
    if (typeof o.$ref === 'string') {
      const keys = Object.keys(o).filter((k) => k !== '$ref');
      if (keys.length)
        throw new Error(
          `$ref with sibling keys ${keys.join(',')}: do not .describe() a .meta({id}) schema at its use site`,
        );
      const name = o.$ref.replace('#/definitions/', '');
      if (opts.defs === false) return walk(defs[name]);
      return { $ref: `#/$defs/${name}` };
    }
    const out: Json = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === '$schema' || k === 'id') continue; // `id` is zod's registry id echoed into the def
      if (k === 'definitions') {
        if (opts.defs !== false)
          out.$defs = Object.fromEntries(
            Object.entries(v as Json).map(([dk, dv]) => [dk, walk(dv)]),
          );
        continue;
      }
      if (k === 'properties') {
        out.properties = Object.fromEntries(
          Object.entries(v as Json).map(([pk, pv]) => [pk, walk(pv)]),
        );
        continue;
      }
      if (k === 'oneOf') {
        out.anyOf = walk(v);
        continue;
      }
      if (k === 'const') {
        out.enum = [v];
        if (!o.type) out.type = typeof v;
        continue;
      }
      out[k] = walk(v);
    }
    if (out.type === 'object') out.additionalProperties = false;
    return out;
  };
  const result = walk(raw) as Json;
  assertProviderSafe(result);
  return result;
};

/** Every anyOf / oneOf and every type array counts toward Anthropic's 16 union-typed parameters. */
export const countUnions = (s: unknown): number => {
  let n = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const o = node as Json;
    if (Array.isArray(o.anyOf) || Array.isArray(o.oneOf)) n++;
    if (Array.isArray(o.type)) n++;
    Object.values(o).forEach(walk);
  };
  walk(s);
  return n;
};

/** Properties not listed in `required` (Anthropic caps at 24; OpenAI strict allows 0). */
export const countOptional = (s: unknown): number => {
  let n = 0;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const o = node as Json;
    if (o.type === 'object' && o.properties) {
      const req = new Set((o.required as string[]) ?? []);
      n += Object.keys(o.properties as Json).filter((k) => !req.has(k)).length;
    }
    Object.values(o).forEach(walk);
  };
  walk(s);
  return n;
};

export const schemaStats = (s: Json) => {
  let properties = 0,
    objects = 0,
    enums = 0,
    maxEnum = 0,
    anyOfBranches = 0,
    maxDepth = 0;
  const walk = (node: unknown, depth: number) => {
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth));
    if (!node || typeof node !== 'object') return;
    const o = node as Json;
    if (o.type === 'object') {
      objects++;
      maxDepth = Math.max(maxDepth, depth);
      properties += Object.keys((o.properties as Json) ?? {}).length;
    }
    if (Array.isArray(o.enum)) {
      enums++;
      maxEnum = Math.max(maxEnum, o.enum.length);
    }
    if (Array.isArray(o.anyOf)) anyOfBranches += o.anyOf.length;
    for (const [k, v] of Object.entries(o))
      walk(v, o.type === 'object' && k === 'properties' ? depth + 1 : depth);
  };
  walk(s, 0);
  return {
    unions: countUnions(s),
    optional: countOptional(s),
    properties,
    objects,
    enums,
    maxEnum,
    anyOfBranches,
    maxObjectDepth: maxDepth,
    bytes: JSON.stringify(s).length,
  };
};

const assertProviderSafe = (root: Json) => {
  if (root.type !== 'object' || root.anyOf)
    throw new Error('root must be a plain object');
  const walk = (node: unknown, path: string, inProps: boolean) => {
    if (Array.isArray(node))
      return node.forEach((x, i) => walk(x, `${path}[${i}]`, false));
    if (!node || typeof node !== 'object') return;
    const o = node as Json;
    if (inProps || path.endsWith('.$defs')) {
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`, false);
      return;
    }
    for (const k of Object.keys(o))
      if (!ALLOWED.has(k))
        throw new Error(`keyword "${k}" not allowed at ${path}`);
    if (o.type === 'object') {
      if (o.additionalProperties !== false)
        throw new Error(`open object at ${path}`);
      const props = Object.keys((o.properties as Json) ?? {});
      const req = (o.required as string[]) ?? [];
      // ASSERT, never force: a stray .optional() must fail the build.
      if (props.length !== req.length || props.some((p) => !req.includes(p)))
        throw new Error(`not every property required at ${path}`);
    }
    if (Array.isArray(o.type)) throw new Error(`type array (union) at ${path}`);
    if (
      Array.isArray(o.enum) &&
      o.enum.some((v) => v === null || typeof v === 'object')
    )
      throw new Error(`non-primitive enum at ${path}`);
    for (const [k, v] of Object.entries(o))
      walk(v, `${path}.${k}`, k === 'properties');
  };
  walk(root, '$', false);
  if (JSON.stringify(root).includes('"#/definitions/'))
    throw new Error('unrewritten $ref');
};
