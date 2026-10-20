// analyse(raw StudyDesign) -> { design: NormalizedDesign, issues }.
// Pure, deterministic, idempotent. Every repair is ALWAYS applied, so compile()
// is total on its output; severity only decides whether attempt 1 retries:
//   adjusted = safe fix, intent kept           -> never retries (counted, not listed)
//   degraded = content dropped / not buildable -> retries on attempt 1; on attempt 2
//              the conservative repair (drop the offending piece) ships and is
//              listed on the researcher-notes screen and in the UI
//   note     = design-quality remark           -> never retries
// Repairs never re-bind a reference to a different entity, never move a stage
// and never insert a stage the model did not write (consent excepted, which
// the compiler owns). Unknown references are dropped.
import {
  type DesignIssue,
  type NAttribute,
  resolveCondition,
  slug,
} from './rules.ts';
import {
  ATTRIBUTE_KINDS,
  type DesignStage,
  type StudyDesign,
} from './schema.ts';

// Screens one unfiltered census may take before the design is sent back.
const CENSUS_SCREEN_LIMIT = 45;
export type NStage = DesignStage & { rawIndex: number };
export type NNodeType = Omit<StudyDesign['nodeTypes'][number], 'attributes'> & {
  attributes: NAttribute[];
};
export type NRelationship = Omit<
  StudyDesign['relationships'][number],
  'attributes'
> & { attributes: NAttribute[] };
export type NormalizedDesign = Omit<
  StudyDesign,
  'stages' | 'egoAttributes' | 'nodeTypes' | 'relationships'
> & {
  egoAttributes: NAttribute[];
  nodeTypes: NNodeType[];
  relationships: NRelationship[];
  stages: NStage[];
  /** attributes with optionScores: excluded from Wording, flagged on the researcher-notes screen */
  instrumentAttributes: string[];
};

const MAX_MIN_NODES = 50;

const CONSENT_IDS = new Set([
  'consent',
  'consent_given',
  'consent_to_participate',
  'informed_consent',
  'participant_consent',
]);

/** Every declarable kind: everything a form can render (the builtin 'location' is not one). */
const FORM_KINDS: NAttribute['kind'][] = [...ATTRIBUTE_KINDS];

const NAME_ALIASES = new Set([
  'name',
  'first_name',
  'nickname',
  'full_name',
  'alter_name',
  'person_name',
  'initials',
  'given_name',
  'display_name',
]);
const deepTrim = <T>(v: T): T =>
  (typeof v === 'string'
    ? v.trim()
    : Array.isArray(v)
      ? v.map(deepTrim)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v).map(([k, x]) => [k, deepTrim(x)]),
          )
        : v) as T;

export const needsRetry = (issues: DesignIssue[]) =>
  issues.some((i) => i.severity === 'degraded');

export const analyse = (
  raw: StudyDesign,
): {
  design: NormalizedDesign;
  issues: DesignIssue[];
  fatal: string | null;
} => {
  const issues: DesignIssue[] = [];
  const add = (
    severity: DesignIssue['severity'],
    code: string,
    path: string,
    message: string,
  ) => issues.push({ severity, code, path, message });
  const d = deepTrim(structuredClone(raw)) as unknown as NormalizedDesign;
  d.stages = (raw.stages as DesignStage[]).map((s, i) => ({
    ...deepTrim(structuredClone(s)),
    rawIndex: i,
  })) as NStage[];
  d.instrumentAttributes = [];

  // ---- ids -------------------------------------------------------------------
  const fixId = (id: string, fallback: string, path: string) => {
    const s = slug(id) || slug(fallback);
    if (s !== id)
      add('adjusted', 'ID_SLUGGED', path, `id "${id}" became "${s}".`);
    return s;
  };
  const typeIds = new Set<string>();
  const uniqueTypeId = (id: string, path: string) => {
    let x = id || 'type';
    if (typeIds.has(x)) {
      for (let n = 2; typeIds.has(x); n++) x = `${id}_${n}`;
      add(
        'degraded',
        'DUPLICATE_TYPE_ID',
        path,
        `Two node types / relationships use id "${id}"; the second became "${x}". Give each its own id.`,
      );
    }
    typeIds.add(x);
    return x;
  };
  d.nodeTypes.forEach((n, i) => {
    n.id = uniqueTypeId(
      fixId(n.id, n.singular || `node_${i + 1}`, `nodeTypes[${i}].id`),
      `nodeTypes[${i}].id`,
    );
  });
  d.relationships.forEach((r, i) => {
    r.id = uniqueTypeId(
      fixId(r.id, r.name || `relationship_${i + 1}`, `relationships[${i}].id`),
      `relationships[${i}].id`,
    );
  });

  // display names unique across node types and relationships (exact compare in schema 8)
  const names = new Set<string>();
  const uniqueName = (
    name: string,
    fallback: string,
    suffix: string,
    path: string,
  ) => {
    let x = name || fallback;
    if (names.has(x)) {
      const base = `${x} ${suffix}`;
      x = base;
      for (let n = 2; names.has(x); n++) x = `${base} ${n}`;
      add(
        'adjusted',
        'NAME_CLASH',
        path,
        `Display name "${name}" is already used; it became "${x}".`,
      );
    }
    names.add(x);
    return x;
  };
  d.nodeTypes.forEach((n, i) => {
    n.singular = uniqueName(
      n.singular,
      n.id,
      '(type)',
      `nodeTypes[${i}].singular`,
    );
    if (!n.plural) n.plural = `${n.singular}s`;
    if (!n.nameQuestion)
      n.nameQuestion = `What is the name of this ${n.singular.toLowerCase()}?`;
  });
  d.relationships.forEach((r, i) => {
    r.name = uniqueName(r.name, r.id, '(tie)', `relationships[${i}].name`);
  });

  // ---- attributes --------------------------------------------------------------
  const nameAlias = new Map<string, string>(); // "node:t/first_name" -> "name"
  const consentAlias = new Set<string>();
  const fixAttributes = (
    list: NAttribute[],
    scope: string,
    prefix: string,
    path: string,
  ): NAttribute[] => {
    const out: NAttribute[] = [];
    const seen = new Map<string, NAttribute>();
    list.forEach((a, i) => {
      const p = `${path}[${i}]`;
      const original = a.id;
      a.id =
        fixId(a.id, a.label || `attribute_${i + 1}`, `${p}.id`) ||
        `attribute_${i + 1}`;
      if (
        scope.startsWith('node:') &&
        (NAME_ALIASES.has(a.id) || a.id === `${prefix}_name`) &&
        (a.kind === 'text' || a.kind === 'long_text')
      ) {
        nameAlias.set(`${scope}/${original}`, 'name');
        nameAlias.set(`${scope}/${a.id}`, 'name');
        add(
          'adjusted',
          'NAME_ALIASED',
          p,
          `"${original}" is the built-in name; the duplicate attribute was removed.`,
        );
        return;
      }
      // Only an attribute that IS the participation consent is folded; one that merely
      // mentions consent ("recontact_consent") is ordinary data and is kept.
      if (scope === 'ego' && a.kind === 'yes_no' && CONSENT_IDS.has(a.id)) {
        consentAlias.add(a.id);
        if (!d.includeConsent) {
          d.includeConsent = true;
          if (!d.consentText) d.consentText = a.question;
          add(
            'degraded',
            'CONSENT_FOLDED',
            p,
            `Consent attribute "${a.id}" was replaced by the built-in consent question (includeConsent); the interview ends if the participant declines.`,
          );
        } else
          add(
            'adjusted',
            'CONSENT_FOLDED',
            p,
            `Consent attribute "${a.id}" duplicates the built-in consent question and was removed.`,
          );
        return;
      }
      if (
        a.id === 'name' ||
        a.id === 'layout' ||
        (scope === 'ego' && a.id === 'consent')
      ) {
        // a replacement no other attribute here already uses
        const taken = (x: string) =>
          seen.has(x) || list.some((o) => o !== a && slug(o.id) === x);
        let r = `${a.id}_value`;
        for (let n = 2; taken(r); n++) r = `${a.id}_value_${n}`;
        nameAlias.set(`${scope}/${a.id}`, r);
        add(
          'adjusted',
          'RESERVED_ID',
          `${p}.id`,
          `"${a.id}" is reserved; it became "${r}".`,
        );
        a.id = r;
      }
      // options
      const before = a.options.length;
      const seenOpt = new Set<string>();
      a.options = a.options.filter(
        (o) =>
          o &&
          !seenOpt.has(o.toLowerCase()) &&
          (seenOpt.add(o.toLowerCase()), true),
      );
      if (a.options.length !== before)
        add(
          'adjusted',
          'OPTIONS_DEDUPED',
          `${p}.options`,
          `Empty or duplicate options of "${a.id}" were removed.`,
        );
      const isChoice =
        a.kind === 'single_choice' ||
        a.kind === 'multi_choice' ||
        a.kind === 'ordered';
      if (
        a.kind === 'single_choice' &&
        a.options.length === 2 &&
        /^yes$/i.test(a.options[0]!) &&
        /^no$/i.test(a.options[1]!)
      ) {
        a.kind = 'yes_no';
        a.options = [];
        add(
          'adjusted',
          'CHOICE_TO_YES_NO',
          p,
          `"${a.id}" has only Yes/No options; it became yes_no.`,
        );
      } else if (isChoice && a.options.length < 2) {
        add(
          'degraded',
          'TOO_FEW_OPTIONS',
          `${p}.options`,
          `${a.kind} attribute "${a.id}" needs at least 2 options; it was turned into free text.`,
        );
        a.kind = 'text';
        a.options = [];
        a.optionScores = [];
      } else if (
        isChoice &&
        a.options.length > (a.kind === 'ordered' ? 7 : 10)
      ) {
        const max = a.kind === 'ordered' ? 7 : 10;
        add(
          'degraded',
          'TOO_MANY_OPTIONS',
          `${p}.options`,
          `"${a.id}" has ${a.options.length} options; at most ${max} are allowed. Only the first ${max} were kept.`,
        );
        a.options = a.options.slice(0, max);
      } else if (
        !isChoice &&
        a.kind !== 'yes_no' &&
        a.kind !== 'slider' &&
        a.options.length
      ) {
        a.options = [];
        add(
          'adjusted',
          'OPTIONS_IGNORED',
          `${p}.options`,
          `${a.kind} attributes take no options.`,
        );
      }
      if (
        a.kind === 'yes_no' &&
        a.options.length !== 0 &&
        a.options.length !== 2
      ) {
        a.options = [];
        add(
          'adjusted',
          'YES_NO_LABELS',
          `${p}.options`,
          `yes_no "${a.id}" uses Yes/No labels.`,
        );
      }
      if (a.kind === 'slider' && a.options.length !== 2) {
        a.options = ['Low', 'High'];
        add(
          'adjusted',
          'SLIDER_LABELS',
          `${p}.options`,
          `slider "${a.id}" needs exactly 2 end labels; Low/High were used.`,
        );
      }
      // optionScores
      if (a.optionScores.length && a.kind !== 'ordered') {
        a.optionScores = [];
        add(
          'adjusted',
          'SCORES_IGNORED',
          `${p}.optionScores`,
          `optionScores apply only to ordered attributes.`,
        );
      }
      if (a.optionScores.length) {
        const ok =
          a.optionScores.length === a.options.length &&
          a.optionScores.every(Number.isInteger) &&
          new Set(a.optionScores).size === a.optionScores.length;
        if (!ok) {
          add(
            'degraded',
            'BAD_SCORES',
            `${p}.optionScores`,
            `optionScores of "${a.id}" must be one distinct whole number per option (${a.options.length}); they were dropped and options scored 1..n.`,
          );
          a.optionScores = [];
        }
      }
      // numberRange
      if (a.numberRange.length && a.kind !== 'number') {
        a.numberRange = [];
        add(
          'adjusted',
          'RANGE_IGNORED',
          `${p}.numberRange`,
          'numberRange applies only to number attributes.',
        );
      }
      if (a.numberRange.length && a.numberRange.length !== 2) {
        a.numberRange = [];
        add(
          'degraded',
          'BAD_RANGE',
          `${p}.numberRange`,
          `numberRange of "${a.id}" must be [] or [minimum, maximum]; it was dropped.`,
        );
      }
      if (a.numberRange.length === 2) {
        let [lo, hi] = a.numberRange.map(Math.round) as [number, number];
        if (lo > hi) {
          [lo, hi] = [hi, lo];
          add(
            'adjusted',
            'RANGE_SWAPPED',
            `${p}.numberRange`,
            `numberRange of "${a.id}" was reversed.`,
          );
        }
        a.numberRange = [lo, hi];
      }
      if (!a.label) a.label = a.id.replace(/_/g, ' ');
      // duplicates within scope
      const prev = seen.get(a.id);
      if (prev) {
        if (
          JSON.stringify({ ...prev, id: '' }) ===
          JSON.stringify({ ...a, id: '' })
        ) {
          add(
            'adjusted',
            'DUPLICATE_MERGED',
            p,
            `Identical duplicate of "${a.id}" removed.`,
          );
          return;
        }
        let x = `${a.id}_2`;
        for (let n = 3; seen.has(x); n++) x = `${a.id}_${n}`;
        add(
          'degraded',
          'DUPLICATE_ATTRIBUTE_ID',
          p,
          `Two different attributes use id "${a.id}"; the second became "${x}" and every reference to "${a.id}" points at the first. Give each attribute its own id.`,
        );
        a.id = x;
      }
      seen.set(a.id, a);
      // recorded under the final id, after any duplicate rename
      if (a.optionScores.length)
        d.instrumentAttributes.push(`${scope}/${a.id}`);
      out.push(a);
    });
    return out;
  };
  d.egoAttributes = fixAttributes(d.egoAttributes, 'ego', '', 'egoAttributes');
  d.nodeTypes.forEach((n, i) => {
    n.attributes = fixAttributes(
      n.attributes,
      `node:${n.id}`,
      n.id,
      `nodeTypes[${i}].attributes`,
    );
  });
  d.relationships.forEach((r, i) => {
    r.attributes = fixAttributes(
      r.attributes,
      `rel:${r.id}`,
      r.id,
      `relationships[${i}].attributes`,
    );
  });
  if (!d.includeConsent) d.consentText = '';

  // ---- lookup helpers ------------------------------------------------------------
  const nodeType = (id: string) => d.nodeTypes.find((n) => n.id === id);
  const rel = (id: string) => d.relationships.find((r) => r.id === id);
  const listOf = (scope: string): NAttribute[] =>
    scope === 'ego'
      ? d.egoAttributes
      : scope.startsWith('node:')
        ? (nodeType(scope.slice(5))?.attributes ?? [])
        : (rel(scope.slice(4))?.attributes ?? []);
  const describeScope = (scope: string) =>
    scope === 'ego'
      ? 'egoAttributes'
      : scope.startsWith('node:')
        ? `node type "${scope.slice(5)}"`
        : `relationship "${scope.slice(4)}"`;
  const elsewhere = (id: string, scope: string) => {
    const scopes = [
      'ego',
      ...d.nodeTypes.map((n) => `node:${n.id}`),
      ...d.relationships.map((r) => `rel:${r.id}`),
    ].filter((s) => s !== scope && listOf(s).some((a) => a.id === id));
    return scopes.length
      ? ` It exists on ${scopes.map(describeScope).join(', ')}, not here.`
      : '';
  };
  /** Resolve an attribute reference in one scope; '' if unresolvable (issue recorded). */
  const resolveAttr = (
    ref: string,
    scope: string,
    path: string,
    kinds: NAttribute['kind'][] | null,
    what: string,
  ): string => {
    const sev = 'degraded';
    let id = slug(ref);
    if (!id) {
      if (ref.trim())
        add(
          sev,
          'UNKNOWN_ATTRIBUTE',
          path,
          `${what} "${ref}" is not a usable attribute id (letters a-z and digits only).`,
        );
      return '';
    }
    id = nameAlias.get(`${scope}/${id}`) ?? id;
    // tolerate the type prefix being written or omitted ("person_closeness" <-> "closeness")
    const prefix = scope.split(':')[1];
    if (prefix && !listOf(scope).some((a) => a.id === id)) {
      const alt = id.startsWith(`${prefix}_`)
        ? id.slice(prefix.length + 1)
        : `${prefix}_${id}`;
      if (listOf(scope).some((a) => a.id === alt) || alt === 'name')
        id = nameAlias.get(`${scope}/${alt}`) ?? alt;
    }
    if (id === 'name' && scope.startsWith('node:'))
      return kinds && !kinds.includes('text')
        ? (add(
            sev,
            'WRONG_KIND',
            path,
            `${what} "name" is text, but this needs ${kinds.join(' or ')}.`,
          ),
          '')
        : 'name';
    const a = listOf(scope).find((x) => x.id === id);
    const avail =
      listOf(scope)
        .filter((x) => !kinds || kinds.includes(x.kind))
        .map((x) => `${x.id} (${x.kind})`)
        .join(', ') || 'none';
    if (!a) {
      add(
        sev,
        'UNKNOWN_ATTRIBUTE',
        path,
        `${what} "${ref}" is not an attribute of ${describeScope(scope)}.${elsewhere(id, scope)} Matching attributes there: ${avail}.`,
      );
      return '';
    }
    if (kinds && !kinds.includes(a.kind)) {
      add(
        sev,
        'WRONG_KIND',
        path,
        `${what} "${a.id}" on ${describeScope(scope)} is ${a.kind}, but this needs ${kinds.join(' or ')}. Matching attributes there: ${avail}.`,
      );
      return '';
    }
    return a.id;
  };
  /** Resolve a type reference. "" with exactly one candidate is filled (adjusted); an unknown id is never re-bound. */
  const resolveType = (
    ref: string,
    list: { id: string }[],
    what: string,
    path: string,
  ): string => {
    const id = slug(ref);
    if (!id && list.length === 1) {
      add(
        'adjusted',
        'TYPE_FILLED',
        path,
        `Empty ${what} reference: used the only ${what}, "${list[0]!.id}".`,
      );
      return list[0]!.id;
    }
    if (list.some((x) => x.id === id)) return id;
    add(
      'degraded',
      'UNKNOWN_TYPE',
      path,
      `${what} "${ref}" is not declared. Declared: ${list.map((x) => x.id).join(', ') || 'none'}.`,
    );
    return '';
  };
  const createTag = (
    scope: string,
    ref: string,
    label: string,
    path: string,
  ): string => {
    const id = slug(ref);
    if (!id) {
      add(
        'degraded',
        'MISSING_ATTRIBUTE',
        path,
        `Tag "${ref}" has no usable id (letters a-z and digits only). Tag removed.`,
      );
      return '';
    }
    if (
      id === 'name' ||
      id === 'layout' ||
      nameAlias.get(`${scope}/${id}`) === 'name'
    ) {
      add(
        'degraded',
        'RESERVED_ID',
        path,
        `"${ref}" is reserved for the built-in ${id === 'layout' ? 'map position' : 'name'}; it cannot be a yes_no tag. Removed.`,
      );
      return '';
    }
    const existing = resolveAttrQuiet(scope, id);
    if (existing) return existing;
    const nt = nodeType(scope.slice(5))!;
    nt.attributes.push({
      id,
      label: label || id.replace(/_/g, ' '),
      question: '',
      kind: 'yes_no',
      options: [],
      optionScores: [],
      numberRange: [],
      required: false,
      builtin: 'tag',
    });
    add(
      'adjusted',
      'TAG_CREATED',
      path,
      `yes_no attribute "${id}" was created on node type "${nt.id}".`,
    );
    return id;
  };
  const resolveAttrQuiet = (scope: string, id: string) => {
    const x = nameAlias.get(`${scope}/${id}`) ?? id;
    const prefix = scope.split(':')[1];
    const alt = prefix
      ? x.startsWith(`${prefix}_`)
        ? x.slice(prefix.length + 1)
        : `${prefix}_${x}`
      : x;
    return (
      listOf(scope).find((a) => a.id === x)?.id ??
      listOf(scope).find((a) => a.id === alt)?.id
    );
  };

  // ---- stages -------------------------------------------------------------------------
  const stageIds = new Set<string>();
  const named = new Set<string>(); // node types named by an earlier stage
  const createdRels = new Set<string>();
  const mappedLocations = new Set<string>(); // "scope/attr" recorded by a geospatial prompt
  const sociogramTypes = new Set<string>(); // node types with a map that places every node
  const partialSociogramTypes = new Set<string>();
  const namedAfterMap = new Set<string>(); // node types a generator added to after their full map
  const collected = new Set<string>(); // "scope/attr" collected by an earlier stage
  const markCollected = (scope: string, id: string) =>
    id && collected.add(`${scope}/${id}`);
  const kept: NStage[] = [];

  const checkFilter = (
    s: NStage & {
      filter: {
        match: string;
        conditions: { attributeId: string; operator: string; value: string }[];
      };
    },
    nodeTypeId: string,
    path: string,
  ) => {
    const scope = `node:${nodeTypeId}`;
    s.filter.conditions = s.filter.conditions.filter((c, i) => {
      const p = `${path}.filter.conditions[${i}]`;
      if (c.operator === 'any_exist' || c.operator === 'none_exist') {
        add(
          'degraded',
          'BAD_FILTER',
          p,
          `${c.operator} cannot be used in a filter; use skipLogic. Condition removed.`,
        );
        return false;
      }
      const id = resolveAttr(
        c.attributeId,
        scope,
        `${p}.attributeId`,
        null,
        'Filter attribute',
      );
      if (!id) return false;
      if (id !== 'name' && !collected.has(`${scope}/${id}`)) {
        add(
          'degraded',
          'CONDITION_BEFORE_COLLECTED',
          p,
          `Filter tests "${id}", which no EARLIER stage collects. Condition removed.`,
        );
        return false;
      }
      const a =
        id === 'name'
          ? ({
              kind: 'text',
              options: [],
              optionScores: [],
            } as unknown as NAttribute)
          : listOf(scope).find((x) => x.id === id);
      const r = resolveCondition(
        'node',
        nodeTypeId,
        a,
        id,
        c.operator as never,
        c.value,
      );
      if (typeof r === 'string') {
        add('degraded', 'BAD_CONDITION', p, `${r} Condition removed.`);
        return false;
      }
      c.attributeId = id;
      return true;
    });
  };
  const checkSkip = (s: NStage, path: string) => {
    const sk = s.skipLogic;
    if (sk.mode === 'always_show' && sk.conditions.length) {
      add(
        'adjusted',
        'SKIP_IGNORED',
        `${path}.skipLogic`,
        'mode always_show: conditions were ignored.',
      );
      sk.conditions = [];
    }
    sk.conditions = sk.conditions.filter((c, i) => {
      const p = `${path}.skipLogic.conditions[${i}]`;
      if (c.about === 'participant' && consentAlias.has(slug(c.attributeId))) {
        add(
          'adjusted',
          'CONSENT_CONDITION',
          p,
          'Consent gating is automatic; condition removed.',
        );
        return false;
      }
      let scope = 'ego';
      let typeId = '';
      let entity: 'ego' | 'node' | 'edge' = 'ego';
      if (c.about === 'nodes') {
        typeId = resolveType(c.typeId, d.nodeTypes, 'node type', `${p}.typeId`);
        if (!typeId) return false;
        if (!named.has(typeId)) {
          add(
            'degraded',
            'CONDITION_BEFORE_COLLECTED',
            p,
            `Skip condition tests "${typeId}" nodes before any earlier stage names them. Condition removed.`,
          );
          return false;
        }
        scope = `node:${typeId}`;
        entity = 'node';
      } else if (c.about === 'relationships') {
        typeId = resolveType(
          c.typeId,
          d.relationships,
          'relationship',
          `${p}.typeId`,
        );
        if (!typeId) return false;
        if (!createdRels.has(typeId)) {
          add(
            'degraded',
            'CONDITION_BEFORE_COLLECTED',
            p,
            `Skip condition tests "${typeId}" ties before any earlier stage creates them. Condition removed.`,
          );
          return false;
        }
        scope = `rel:${typeId}`;
        entity = 'edge';
      }
      let id = '';
      let a: NAttribute | undefined;
      if (!(c.operator === 'any_exist' || c.operator === 'none_exist')) {
        id = resolveAttr(
          c.attributeId,
          scope,
          `${p}.attributeId`,
          null,
          'Skip-condition attribute',
        );
        if (!id) return false;
        if (id !== 'name' && !collected.has(`${scope}/${id}`)) {
          add(
            'degraded',
            'CONDITION_BEFORE_COLLECTED',
            p,
            `Skip condition tests "${id}" on ${describeScope(scope)}, which no EARLIER stage collects.`,
          );
          return false;
        }
        a =
          id === 'name'
            ? ({
                kind: 'text',
                options: [],
                optionScores: [],
              } as unknown as NAttribute)
            : listOf(scope).find((x) => x.id === id);
      }
      const r = resolveCondition(entity, typeId, a, id, c.operator, c.value);
      if (typeof r === 'string') {
        add('degraded', 'BAD_CONDITION', p, `${r} Condition removed.`);
        return false;
      }
      c.typeId = typeId;
      c.attributeId = id;
      return true;
    });
    // network-query ANDs every node rule against ONE node (every tie rule against ties
    // of ONE node), so under "all" conditions on different types can never hold together.
    if (sk.mode !== 'always_show' && sk.match === 'all') {
      const firstType: Partial<Record<'nodes' | 'relationships', string>> = {};
      sk.conditions = sk.conditions.filter((c) => {
        if (c.about === 'participant' || c.operator === 'none_exist')
          return true;
        const seen = firstType[c.about];
        if (seen === undefined || seen === c.typeId) {
          firstType[c.about] = c.typeId;
          return true;
        }
        const one = c.about === 'nodes' ? 'node' : 'tie';
        add(
          'degraded',
          'MIXED_ALL_CONDITION',
          `${path}.skipLogic`,
          `With match "all", every ${c.about} condition must hold for the SAME ${one}, so a condition on "${c.typeId}" cannot be combined with one on "${seen}". Condition on "${c.typeId}" removed; use match "any" or separate stages.`,
        );
        return false;
      });
    }
    if (sk.mode !== 'always_show' && !sk.conditions.length) {
      add(
        'degraded',
        'EMPTY_SKIP',
        `${path}.skipLogic`,
        `mode ${sk.mode} has no usable conditions; the stage is always shown.`,
      );
      sk.mode = 'always_show';
    }
  };

  for (const s of d.stages) {
    const path = `stages[${s.rawIndex}]`;
    let followUp: NStage | null = null;
    let id =
      fixId(s.id, `${s.kind}_${s.rawIndex + 1}`, `${path}.id`) ||
      `stage_${s.rawIndex + 1}`;
    if (['consent', 'consent_given', 'researcher_notes'].includes(id))
      id = `${id}_stage`;
    if (stageIds.has(id)) {
      let x = `${id}_2`;
      for (let n = 3; stageIds.has(x); n++) x = `${id}_${n}`;
      add(
        'adjusted',
        'DUPLICATE_STAGE_ID',
        `${path}.id`,
        `Stage id "${id}" repeated; it became "${x}".`,
      );
      id = x;
    }
    s.id = id;
    const drop = (code: string, msg: string) => {
      add('degraded', code, path, `${msg} The stage was removed.`);
    };
    const needsNamed = (t: string) => {
      if (!named.has(t)) {
        drop(
          'STAGE_BEFORE_NAMES',
          `Stage "${id}" uses "${t}" nodes before any earlier nameGenerator creates them.`,
        );
        return false;
      }
      return true;
    };
    // Both stages need an interviewer to talk the participant through
    // their network, and only earn their place when that talk is data.
    if (
      (s.kind === 'narrative' || s.kind === 'networkComposer') &&
      !(d.administration === 'face_to_face' && d.qualitative)
    ) {
      add(
        s.kind === 'narrative' ? 'adjusted' : 'degraded',
        'NEEDS_FACE_TO_FACE_QUALITATIVE',
        path,
        `${s.kind} "${id}" is only for face_to_face studies with a qualitative element (administration "${d.administration}", qualitative ${String(d.qualitative)}). The stage was removed.${s.kind === 'networkComposer' ? ' Name people with a nameGenerator and draw ties on a sociogram instead.' : ''}`,
      );
      continue;
    }
    checkSkip(s, path);
    switch (s.kind) {
      case 'information':
        if (!s.content && !s.purpose)
          add(
            'note',
            'EMPTY_INFORMATION',
            path,
            `Information "${id}" has no content draft.`,
          );
        break;
      case 'egoForm': {
        const ids = s.attributeIds
          .map((a, i) =>
            consentAlias.has(slug(a))
              ? ''
              : resolveAttr(
                  a,
                  'ego',
                  `${path}.attributeIds[${i}]`,
                  null,
                  'Form attribute',
                ),
          )
          .filter(Boolean);
        const uniq = [...new Set(ids)];
        if (!uniq.length) {
          if (s.attributeIds.every((a) => consentAlias.has(slug(a)))) {
            add(
              'adjusted',
              'CONSENT_FORM_REMOVED',
              path,
              'A hand-written consent form was replaced by the built-in consent question.',
            );
            continue;
          }
          drop('EMPTY_FORM', `egoForm "${id}" has no usable attributes.`);
          continue;
        }
        s.attributeIds = uniq;
        uniq.forEach((x) => markCollected('ego', x));
        break;
      }
      case 'nameGenerator': {
        const t = resolveType(
          s.nodeTypeId,
          d.nodeTypes,
          'node type',
          `${path}.nodeTypeId`,
        );
        if (!t) {
          drop('UNKNOWN_TYPE', `nameGenerator "${id}" has no valid node type.`);
          continue;
        }
        s.nodeTypeId = t;
        const scope = `node:${t}`;
        const kinds: NAttribute['kind'][] | null =
          s.method === 'roster'
            ? ['text', 'long_text', 'number', 'yes_no']
            : FORM_KINDS;
        s.attributeIds = [
          ...new Set(
            s.attributeIds
              .map((a, i) =>
                resolveAttr(
                  a,
                  scope,
                  `${path}.attributeIds[${i}]`,
                  kinds,
                  s.method === 'roster' ? 'Roster column' : 'Form attribute',
                ),
              )
              .filter((x) => x && x !== 'name'),
          ),
        ];
        if (s.method === 'quick_add' && s.attributeIds.length) {
          add(
            'adjusted',
            'METHOD_TO_FORM',
            path,
            'quick_add with attributes became a form name generator.',
          );
          s.method = 'form';
        }
        if (s.method === 'form' && !s.attributeIds.length) {
          add(
            'adjusted',
            'METHOD_TO_QUICK_ADD',
            path,
            'form name generator without attributes became quick_add.',
          );
          s.method = 'quick_add';
        }
        if (s.method === 'form' && named.has(t))
          add(
            'degraded',
            'FORM_AFTER_NAMES',
            path,
            `nameGenerator "${s.id}" uses a form, but people named by an earlier generator can be added here from the "Already mentioned" panel without the form, so they would miss its questions. Use quick_add here and ask ${s.attributeIds.join(', ')} in an alterForm after it.`,
          );
        if (s.method === 'form' && s.attributeIds.length > 3)
          add(
            'note',
            'LONG_NAMING_FORM',
            path,
            'More than 3 attributes at naming time discourages naming more people.',
          );
        s.prompts = s.prompts.filter((p, i) => {
          if (!p.text) {
            add(
              'degraded',
              'EMPTY_PROMPT',
              `${path}.prompts[${i}]`,
              'Prompt without text removed.',
            );
            return false;
          }
          if (p.tagAttributeId) {
            const tag = resolveAttrQuiet(scope, slug(p.tagAttributeId));
            const a = tag && listOf(scope).find((x) => x.id === tag);
            if (a && a.kind !== 'yes_no') {
              add(
                'degraded',
                'WRONG_KIND',
                `${path}.prompts[${i}].tagAttributeId`,
                `Tag "${a.id}" is ${a.kind}; tags must be yes_no. Tag removed.`,
              );
              p.tagAttributeId = '';
            } else
              p.tagAttributeId = createTag(
                scope,
                p.tagAttributeId,
                '',
                `${path}.prompts[${i}].tagAttributeId`,
              );
            if (p.tagAttributeId) markCollected(scope, p.tagAttributeId);
          }
          return true;
        });
        if (!s.prompts.length) {
          drop('NO_PROMPTS', `nameGenerator "${id}" has no prompts.`);
          continue;
        }
        // A roster hides everyone already named, so a person picked for one
        // prompt cannot be picked for the next and would miss its tag. A form
        // after the roster asks each tag question about everyone picked.
        const rosterTags = s.prompts
          .map((p) => p.tagAttributeId)
          .filter(Boolean);
        if (
          s.method === 'roster' &&
          s.prompts.length > 1 &&
          rosterTags.length
        ) {
          s.prompts.forEach((p) => {
            const a = listOf(scope).find((x) => x.id === p.tagAttributeId);
            if (a && !a.question) a.question = p.text;
          });
          followUp = {
            kind: 'alterForm',
            id: `${id}_overlap`,
            rawIndex: s.rawIndex,
            purpose: `Records every prompt of "${id}" for each person picked, since the roster lets a person be picked only once.`,
            interviewerNote: '',
            skipLogic: s.skipLogic,
            nodeTypeId: t,
            filter: { match: 'all', conditions: [] },
            attributeIds: [...new Set(rosterTags)],
          };
          add(
            'adjusted',
            'ROSTER_OVERLAP_FORM',
            path,
            `A roster lets each person be picked once, so a form after "${id}" asks every prompt's question about each person picked.`,
          );
        }
        s.minNodes = Math.max(0, Math.round(s.minNodes || 0));
        s.maxNodes = Math.max(0, Math.round(s.maxNodes || 0));
        // a roster generates this many placeholder rows; nobody names more
        if (s.minNodes > MAX_MIN_NODES) {
          add(
            'adjusted',
            'MIN_LOWERED',
            path,
            `minNodes lowered to ${MAX_MIN_NODES}.`,
          );
          s.minNodes = MAX_MIN_NODES;
        }
        if (s.maxNodes && s.maxNodes < s.minNodes) {
          add(
            'adjusted',
            'MAX_RAISED',
            path,
            `maxNodes raised to minNodes (${s.minNodes}).`,
          );
          s.maxNodes = s.minNodes;
        }
        s.attributeIds.forEach((x) => markCollected(scope, x));
        named.add(t);
        // people named after the map have no position on it
        if (sociogramTypes.delete(t)) namedAfterMap.add(t);
        break;
      }
      case 'alterForm':
      case 'bins':
      case 'sociogram':
      case 'relationshipCensus':
      case 'narrative':
      case 'geospatial': {
        const t = resolveType(
          s.nodeTypeId,
          d.nodeTypes,
          'node type',
          `${path}.nodeTypeId`,
        );
        if (!t) {
          drop('UNKNOWN_TYPE', `Stage "${id}" has no valid node type.`);
          continue;
        }
        s.nodeTypeId = t;
        if (!needsNamed(t)) continue;
        const scope = `node:${t}`;
        checkFilter(s as never, t, path);
        if (s.kind === 'alterForm') {
          s.attributeIds = [
            ...new Set(
              s.attributeIds
                .map((a, i) =>
                  resolveAttr(
                    a,
                    scope,
                    `${path}.attributeIds[${i}]`,
                    FORM_KINDS,
                    'Form attribute',
                  ),
                )
                .filter((x) => x && x !== 'name'),
            ),
          ];
          if (!s.attributeIds.length) {
            drop('EMPTY_FORM', `alterForm "${id}" has no usable attributes.`);
            continue;
          }
          s.attributeIds.forEach((x) => markCollected(scope, x));
        } else if (s.kind === 'bins') {
          s.prompts = s.prompts.filter((p, i) => {
            const a = resolveAttr(
              p.attributeId,
              scope,
              `${path}.prompts[${i}].attributeId`,
              // a drop replaces the value, so bins cannot record several choices
              ['ordered', 'single_choice'],
              'Bin attribute',
            );
            if (!a || !p.text) {
              if (a)
                add(
                  'degraded',
                  'EMPTY_PROMPT',
                  `${path}.prompts[${i}]`,
                  'Prompt without text removed.',
                );
              return false;
            }
            p.attributeId = a;
            const kind = listOf(scope).find((x) => x.id === a)!.kind;
            if (p.allowOther && kind === 'ordered') {
              p.allowOther = false;
              add(
                'adjusted',
                'OTHER_IGNORED',
                `${path}.prompts[${i}].allowOther`,
                'allowOther applies only to category bins.',
              );
            }
            if (
              kind === 'ordered' &&
              listOf(scope).find((x) => x.id === a)!.options.length > 6
            )
              add(
                'note',
                'MANY_BINS',
                `${path}.prompts[${i}]`,
                `More than 6 ordered bins are hard to use.`,
              );
            markCollected(scope, a);
            return true;
          });
          if (!s.prompts.length) {
            drop('NO_PROMPTS', `bins "${id}" has no usable prompts.`);
            continue;
          }
        } else if (s.kind === 'sociogram') {
          s.prompts = s.prompts.filter((p, i) => {
            const pp = `${path}.prompts[${i}]`;
            if (!p.text) {
              add(
                'degraded',
                'EMPTY_PROMPT',
                pp,
                'Prompt without text removed.',
              );
              return false;
            }
            if (p.task === 'connect') {
              const r = resolveType(
                p.relationshipId,
                d.relationships,
                'relationship',
                `${pp}.relationshipId`,
              );
              if (!r) return false;
              p.relationshipId = r;
              p.attributeId = '';
              createdRels.add(r);
            } else if (p.task === 'highlight') {
              const ex = resolveAttrQuiet(scope, slug(p.attributeId));
              const a = ex && listOf(scope).find((x) => x.id === ex);
              if (a && a.kind !== 'yes_no') {
                add(
                  'degraded',
                  'WRONG_KIND',
                  `${pp}.attributeId`,
                  `Highlight "${a.id}" is ${a.kind}; highlights must be yes_no. Prompt removed.`,
                );
                return false;
              }
              if (!slug(p.attributeId)) {
                add(
                  'degraded',
                  'MISSING_ATTRIBUTE',
                  `${pp}.attributeId`,
                  'A highlight prompt needs a yes_no attributeId. Prompt removed.',
                );
                return false;
              }
              p.attributeId = createTag(
                scope,
                p.attributeId,
                '',
                `${pp}.attributeId`,
              );
              p.relationshipId = '';
              if (!p.attributeId) return false;
              markCollected(scope, p.attributeId);
            } else {
              p.relationshipId = '';
              p.attributeId = '';
            }
            return true;
          });
          if (!s.prompts.length) {
            drop('NO_PROMPTS', `sociogram "${id}" has no usable prompts.`);
            continue;
          }
          // A narrative can only reuse a map that places every node: one with
          // skip conditions or a filter may leave nodes without positions.
          if (
            s.skipLogic.mode === 'always_show' &&
            !s.filter.conditions.length
          ) {
            sociogramTypes.add(t);
            namedAfterMap.delete(t);
          } else partialSociogramTypes.add(t);
        } else if (s.kind === 'relationshipCensus') {
          const censusRels = new Set<string>();
          s.prompts = s.prompts.filter((p, i) => {
            const pp = `${path}.prompts[${i}]`;
            const r = resolveType(
              p.relationshipId,
              d.relationships,
              'relationship',
              `${pp}.relationshipId`,
            );
            if (!r || !p.text) {
              if (r)
                add(
                  'degraded',
                  'EMPTY_PROMPT',
                  pp,
                  'Prompt without text removed.',
                );
              return false;
            }
            // A second question on the same relationship shares its edges:
            // the later answer is preselected from, and a "no" deletes, the
            // tie the earlier question created.
            if (createdRels.has(r) || censusRels.has(r)) {
              add(
                'degraded',
                'DUPLICATE_RELATIONSHIP_CREATOR',
                `${pp}.relationshipId`,
                `Relationship "${r}" is already created by an earlier question, so this one would overwrite its answers. Prompt removed; give a distinct question its own relationship type.`,
              );
              return false;
            }
            censusRels.add(r);
            p.relationshipId = r;
            if (s.method === 'with_strength') {
              const ordered = rel(r)!.attributes.filter(
                (a) => a.kind === 'ordered',
              );
              if (!p.strengthAttributeId && ordered.length === 1) {
                p.strengthAttributeId = ordered[0]!.id;
                add(
                  'adjusted',
                  'STRENGTH_FILLED',
                  `${pp}.strengthAttributeId`,
                  `Used the only ordered attribute "${ordered[0]!.id}".`,
                );
              } else
                p.strengthAttributeId = resolveAttr(
                  p.strengthAttributeId,
                  `rel:${r}`,
                  `${pp}.strengthAttributeId`,
                  ['ordered'],
                  'Strength attribute',
                );
              if (!p.strengthAttributeId) {
                add(
                  'degraded',
                  'NO_STRENGTH',
                  pp,
                  `with_strength needs an ordered attribute of the relationship "${r}".`,
                );
              }
              if (!p.noTieLabel) p.noTieLabel = 'Not connected';
            } else {
              p.strengthAttributeId = '';
              p.noTieLabel = '';
            }
            return true;
          });
          if (!s.prompts.length) {
            drop(
              'NO_PROMPTS',
              `relationshipCensus "${id}" has no usable prompts.`,
            );
            continue;
          }
          if (
            s.method === 'with_strength' &&
            s.prompts.some((p) => !p.strengthAttributeId)
          ) {
            if (s.prompts.every((p) => !p.strengthAttributeId)) {
              s.method = 'every_pair';
              add(
                'degraded',
                'NO_STRENGTH',
                path,
                'No prompt has an ordered strength attribute; the census is asked as yes/no every_pair questions instead.',
              );
            } else {
              for (const p of s.prompts.filter((q) => !q.strengthAttributeId))
                add(
                  'degraded',
                  'NO_STRENGTH_REMOVED',
                  path,
                  `Prompt "${p.text}" was removed: relationship "${p.relationshipId}" has no ordered strength attribute, and a with_strength census cannot mix in yes/no prompts. Add an ordered attribute or put it in its own every_pair census.`,
                );
              s.prompts = s.prompts.filter((p) => p.strengthAttributeId);
            }
          }
          for (const p of s.prompts) {
            createdRels.add(p.relationshipId);
            if (p.strengthAttributeId)
              markCollected(`rel:${p.relationshipId}`, p.strengthAttributeId);
          }
          // Pairs grow with the square of the people shown, so an unfiltered
          // census of a large network is the heaviest thing a design can ask.
          if (!s.filter.conditions.length) {
            const n = Math.round(d.burdenEstimate?.expectedPeople ?? 0);
            const screens =
              s.method === 'one_at_a_time'
                ? s.prompts.length * (n - 1)
                : (s.prompts.length * n * (n - 1)) / 2;
            if (screens > CENSUS_SCREEN_LIMIT)
              add(
                'degraded',
                'UNFILTERED_CENSUS',
                path,
                `"${id}" asks about every pair of the ~${n} people expected, about ${screens} screens. Decide which people the tie question needs: filter the census to a core the research question is about (people named at a core prompt, or rated close), or, if it needs everyone, use a lighter method (one_at_a_time, or a sociogram connect prompt) or a lower maxNodes, and say why in the rationale.`,
              );
          }
        } else if (s.kind === 'narrative') {
          if (!sociogramTypes.has(t)) {
            drop(
              'NARRATIVE_WITHOUT_MAP',
              namedAfterMap.has(t)
                ? `narrative "${id}" reuses the positions of an EARLIER sociogram of node type "${t}", but a nameGenerator after that sociogram adds "${t}" nodes that have no position, so the narrative would leave them out. Put a sociogram (always_show, no filter) after the last nameGenerator, or remove the narrative.`
                : partialSociogramTypes.has(t)
                  ? `narrative "${id}" reuses the positions of an EARLIER sociogram of node type "${t}", but every such sociogram has skip conditions or a filter, so some nodes would have no position and the narrative map would be partly or wholly empty. Give one of them always_show and no filter, or remove the narrative.`
                  : `narrative "${id}" needs an EARLIER sociogram of node type "${t}" (it reuses that map's positions). Add one, or remove the narrative.`,
            );
            continue;
          }
          s.views = s.views.map((v, i) => {
            const pv = `${path}.views[${i}]`;
            if (!v.label) {
              v.label = `View ${i + 1}`;
              add(
                'adjusted',
                'VIEW_LABEL',
                pv,
                'View without label got a default.',
              );
            }
            // a view can only group or highlight by values an earlier stage collects
            const collectedHere = (attr: string, field: string) => {
              if (!attr || collected.has(`${scope}/${attr}`)) return attr;
              add(
                'degraded',
                'VIEW_ATTRIBUTE_NOT_COLLECTED',
                `${pv}.${field}`,
                `No earlier stage collects "${attr}"; removed from the view.`,
              );
              return '';
            };
            v.groupByAttributeId = v.groupByAttributeId
              ? collectedHere(
                  resolveAttr(
                    v.groupByAttributeId,
                    scope,
                    `${pv}.groupByAttributeId`,
                    ['single_choice', 'multi_choice'],
                    'Group attribute',
                  ),
                  'groupByAttributeId',
                )
              : '';
            v.highlightAttributeIds = v.highlightAttributeIds
              .map((h, j) =>
                collectedHere(
                  resolveAttr(
                    h,
                    scope,
                    `${pv}.highlightAttributeIds[${j}]`,
                    ['yes_no'],
                    'Highlight attribute',
                  ),
                  `highlightAttributeIds[${j}]`,
                ),
              )
              .filter(Boolean);
            v.relationshipIds = v.relationshipIds
              .map((r, j) => {
                const x = resolveType(
                  r,
                  d.relationships,
                  'relationship',
                  `${pv}.relationshipIds[${j}]`,
                );
                if (x && !createdRels.has(x)) {
                  add(
                    'degraded',
                    'RELATIONSHIP_NOT_CREATED',
                    `${pv}.relationshipIds[${j}]`,
                    `No earlier stage creates "${x}" ties; removed from the view.`,
                  );
                  return '';
                }
                return x;
              })
              .filter(Boolean);
            return v;
          });
          if (!s.views.length) {
            s.views = [
              {
                label: 'Your network',
                groupByAttributeId: '',
                relationshipIds: [...createdRels],
                highlightAttributeIds: [],
              },
            ];
            add(
              'adjusted',
              'DEFAULT_VIEW',
              path,
              'narrative without views got one default view.',
            );
          }
        } else if (s.kind === 'geospatial') {
          s.prompts = s.prompts.filter((p, i) => {
            if (!p.text) {
              add(
                'degraded',
                'EMPTY_PROMPT',
                `${path}.prompts[${i}]`,
                'Prompt without text removed.',
              );
              return false;
            }
            let loc = slug(p.locationAttributeId) || `country_${i + 1}`;
            if (loc === 'name' || loc === 'layout') loc = `${loc}_country`;
            // Each map question records its own answer: a second prompt on
            // the same location would overwrite the first.
            if (mappedLocations.has(`${scope}/${loc}`)) {
              let x = `${loc}_2`;
              for (
                let n = 3;
                mappedLocations.has(`${scope}/${x}`) ||
                listOf(scope).some((a) => a.id === x);
                n++
              )
                x = `${loc}_${n}`;
              add(
                'adjusted',
                'LOCATION_DUPLICATE',
                `${path}.prompts[${i}].locationAttributeId`,
                `"${loc}" is already recorded by another map question; this one records "${x}".`,
              );
              loc = x;
            }
            const ex = listOf(scope).find((a) => a.id === loc);
            if (ex && ex.kind !== 'location') {
              // The first `<loc>_map[_n]` id that is free or a location
              // attribute no other map question records.
              let x = `${loc}_map`;
              for (let n = 2; ; n++) {
                const taken = listOf(scope).find((a) => a.id === x);
                if (
                  (!taken || taken.kind === 'location') &&
                  !mappedLocations.has(`${scope}/${x}`)
                )
                  break;
                x = `${loc}_map_${n}`;
              }
              add(
                'adjusted',
                'LOCATION_RENAMED',
                `${path}.prompts[${i}].locationAttributeId`,
                `"${loc}" is already a ${ex.kind} attribute; the map attribute became "${x}".`,
              );
              loc = x;
            }
            if (!listOf(scope).some((a) => a.id === loc))
              nodeType(t)!.attributes.push({
                id: loc,
                label: loc.replace(/_/g, ' '),
                question: '',
                kind: 'location',
                options: [],
                optionScores: [],
                numberRange: [],
                required: false,
                builtin: 'location',
              });
            p.locationAttributeId = loc;
            mappedLocations.add(`${scope}/${loc}`);
            markCollected(scope, loc);
            return true;
          });
          if (!s.prompts.length) {
            drop('NO_PROMPTS', `geospatial "${id}" has no prompts.`);
            continue;
          }
        }
        break;
      }
      case 'networkComposer': {
        const t = resolveType(
          s.nodeTypeId,
          d.nodeTypes,
          'node type',
          `${path}.nodeTypeId`,
        );
        if (!t) {
          drop(
            'UNKNOWN_TYPE',
            `networkComposer "${id}" has no valid node type.`,
          );
          continue;
        }
        s.nodeTypeId = t;
        const scope = `node:${t}`;
        s.groupAttributeId = s.groupAttributeId
          ? resolveAttr(
              s.groupAttributeId,
              scope,
              `${path}.groupAttributeId`,
              ['multi_choice'],
              'Group attribute',
            )
          : '';
        s.attributeIds = [
          ...new Set(
            s.attributeIds
              .map((a, i) =>
                resolveAttr(
                  a,
                  scope,
                  `${path}.attributeIds[${i}]`,
                  FORM_KINDS,
                  'Form attribute',
                ),
              )
              .filter((x) => x && x !== 'name' && x !== s.groupAttributeId),
          ),
        ];
        const relSeen = new Set<string>();
        s.relationships = s.relationships.filter((e, i) => {
          const pe = `${path}.relationships[${i}]`;
          const r = resolveType(
            e.relationshipId,
            d.relationships,
            'relationship',
            `${pe}.relationshipId`,
          );
          if (!r || relSeen.has(r)) return false;
          relSeen.add(r);
          e.relationshipId = r;
          e.attributeIds = [
            ...new Set(
              e.attributeIds
                .map((a, j) =>
                  resolveAttr(
                    a,
                    `rel:${r}`,
                    `${pe}.attributeIds[${j}]`,
                    FORM_KINDS,
                    'Form attribute',
                  ),
                )
                .filter(Boolean),
            ),
          ];
          return true;
        });
        s.attributeIds.forEach((x) => markCollected(scope, x));
        markCollected(scope, s.groupAttributeId);
        for (const e of s.relationships) {
          createdRels.add(e.relationshipId);
          e.attributeIds.forEach((x) =>
            markCollected(`rel:${e.relationshipId}`, x),
          );
        }
        named.add(t);
        // the canvas places everyone it shows, so a narrative can reuse it
        if (s.skipLogic.mode === 'always_show') {
          sociogramTypes.add(t);
          namedAfterMap.delete(t);
        } else partialSociogramTypes.add(t);
        break;
      }
      case 'relationshipForm': {
        const r = resolveType(
          s.relationshipId,
          d.relationships,
          'relationship',
          `${path}.relationshipId`,
        );
        if (!r) {
          drop(
            'UNKNOWN_TYPE',
            `relationshipForm "${id}" has no valid relationship.`,
          );
          continue;
        }
        if (!createdRels.has(r)) {
          drop(
            'FORM_BEFORE_TIES',
            `relationshipForm "${id}" asks about "${r}" ties before any earlier stage creates them.`,
          );
          continue;
        }
        s.relationshipId = r;
        s.attributeIds = [
          ...new Set(
            s.attributeIds
              .map((a, i) =>
                resolveAttr(
                  a,
                  `rel:${r}`,
                  `${path}.attributeIds[${i}]`,
                  null,
                  'Form attribute',
                ),
              )
              .filter(Boolean),
          ),
        ];
        if (!s.attributeIds.length) {
          drop(
            'EMPTY_FORM',
            `relationshipForm "${id}" has no usable attributes.`,
          );
          continue;
        }
        s.attributeIds.forEach((x) => markCollected(`rel:${r}`, x));
        break;
      }
    }
    stageIds.add(id);
    kept.push(s);
    if (followUp && !stageIds.has(followUp.id)) {
      stageIds.add(followUp.id);
      kept.push(followUp);
    }
  }
  d.stages = kept;

  // ---- one writer per attribute ------------------------------------------------------
  // Bins, sociogram highlights, tie strength and prompt tags write without a
  // form's validation, so an attribute a form also asks could reach that form
  // with values it would reject. The earlier writer keeps the attribute, so
  // nothing that reads it in between loses its value; the later one drops it.
  // One exception: a roster's overlap form replaces the roster's tags (it
  // runs straight after them).
  type Writer = { at: number; stage: NStage; drop: () => void; what: string };
  const formAt = new Map<string, number>();
  const unvalidated: (Writer & { key: string })[] = [];
  const binsKeys = new Set<string>();
  d.stages.forEach((s, at) => {
    if (
      s.kind === 'alterForm' ||
      (s.kind === 'nameGenerator' && s.method === 'form')
    )
      s.attributeIds.forEach((x) => {
        const k = `node:${s.nodeTypeId}/${x}`;
        if (!formAt.has(k)) formAt.set(k, at);
      });
    if (s.kind === 'relationshipForm')
      s.attributeIds.forEach((x) => {
        const k = `rel:${s.relationshipId}/${x}`;
        if (!formAt.has(k)) formAt.set(k, at);
      });
    if (s.kind === 'networkComposer') {
      s.attributeIds.forEach((x) => {
        const k = `node:${s.nodeTypeId}/${x}`;
        if (!formAt.has(k)) formAt.set(k, at);
      });
      s.relationships.forEach((e) =>
        e.attributeIds.forEach((x) => {
          const k = `rel:${e.relationshipId}/${x}`;
          if (!formAt.has(k)) formAt.set(k, at);
        }),
      );
    }
    const site = (key: string, what: string, drop: () => void) =>
      unvalidated.push({ key, at, stage: s, drop, what });
    if (s.kind === 'nameGenerator')
      s.prompts.forEach((p) => {
        if (p.tagAttributeId)
          site(`node:${s.nodeTypeId}/${p.tagAttributeId}`, 'prompt tag', () => {
            p.tagAttributeId = '';
          });
      });
    if (s.kind === 'bins')
      s.prompts.forEach((p) => {
        const key = `node:${s.nodeTypeId}/${p.attributeId}`;
        // Each drop replaces the stored value, so a second bins question on
        // the same attribute silently discards the first one's answers.
        if (binsKeys.has(key)) {
          s.prompts = s.prompts.filter((x) => x !== p);
          add(
            'degraded',
            'DUPLICATE_BINS_WRITER',
            `stages[${s.rawIndex}]`,
            `"${p.attributeId}" is already sorted by an earlier bins question, so this one would overwrite its answers. Prompt removed; give a distinct question its own attribute.`,
          );
          return;
        }
        binsKeys.add(key);
        site(key, 'bins prompt', () => {
          s.prompts = s.prompts.filter((x) => x !== p);
        });
      });
    if (s.kind === 'sociogram')
      s.prompts.forEach((p) => {
        if (p.task === 'highlight')
          site(
            `node:${s.nodeTypeId}/${p.attributeId}`,
            'highlight prompt',
            () => {
              // A narrative may reuse this map, so its last prompt stays as
              // a plain arrangement task rather than removing the stage.
              if (s.prompts.length > 1)
                s.prompts = s.prompts.filter((x) => x !== p);
              else {
                const plural = nodeType(s.nodeTypeId)?.plural ?? 'People';
                p.task = 'position';
                p.attributeId = '';
                p.text = `Arrange the ${plural.toLowerCase()} on the map in a way that makes sense to you.`;
              }
            },
          );
      });
    if (s.kind === 'networkComposer' && s.groupAttributeId)
      site(`node:${s.nodeTypeId}/${s.groupAttributeId}`, 'group', () => {
        s.groupAttributeId = '';
      });
    if (s.kind === 'relationshipCensus' && s.method === 'with_strength')
      s.prompts.forEach((p) =>
        site(
          `rel:${p.relationshipId}/${p.strengthAttributeId}`,
          'strength',
          // a form can only come first once earlier ties exist, so this
          // census's prompt is not needed to create them
          () => {
            s.prompts = s.prompts.filter((x) => x !== p);
          },
        ),
      );
  });
  const fromForms = new Set<string>();
  for (const w of unvalidated) {
    const formIndex = formAt.get(w.key);
    if (formIndex === undefined) continue;
    const form = d.stages[formIndex]!;
    const formWins = formIndex < w.at || form.id === `${w.stage.id}_overlap`;
    const attr = w.key.split('/')[1];
    if (formWins) {
      w.drop();
      add(
        'adjusted',
        'WRITTEN_BY_FORM',
        `stages[${w.stage.rawIndex}]`,
        `"${attr}" is asked in the form "${form.id}", so the ${w.what} in "${w.stage.id}" no longer records it.`,
      );
    } else fromForms.add(w.key);
  }
  const keepUnwritten = (scope: string, ids: string[], s: NStage) =>
    ids.filter((x) => {
      if (!fromForms.has(`${scope}/${x}`)) return true;
      add(
        'adjusted',
        'FORM_FIELD_WRITTEN_ELSEWHERE',
        `stages[${s.rawIndex}].attributeIds`,
        `"${x}" is recorded by an earlier stage, so "${s.id}" no longer asks it.`,
      );
      return false;
    });
  d.stages = d.stages.filter((s) => {
    if (s.kind === 'networkComposer') {
      s.attributeIds = keepUnwritten(`node:${s.nodeTypeId}`, s.attributeIds, s);
      for (const e of s.relationships)
        e.attributeIds = keepUnwritten(
          `rel:${e.relationshipId}`,
          e.attributeIds,
          s,
        );
      return true;
    }
    if (
      s.kind === 'alterForm' ||
      s.kind === 'relationshipForm' ||
      (s.kind === 'nameGenerator' && s.method === 'form')
    ) {
      const scope =
        s.kind === 'relationshipForm'
          ? `rel:${s.relationshipId}`
          : `node:${s.nodeTypeId}`;
      s.attributeIds = keepUnwritten(scope, s.attributeIds, s);
      if (s.kind === 'nameGenerator') {
        if (!s.attributeIds.length) s.method = 'quick_add';
        return true;
      }
      if (!s.attributeIds.length) {
        add(
          'adjusted',
          'EMPTY_STAGE_REMOVED',
          `stages[${s.rawIndex}]`,
          `"${s.id}" had nothing left to ask and was removed.`,
        );
        return false;
      }
    }
    if (
      (s.kind === 'bins' ||
        s.kind === 'sociogram' ||
        s.kind === 'relationshipCensus') &&
      !s.prompts.length
    ) {
      add(
        'adjusted',
        'EMPTY_STAGE_REMOVED',
        `stages[${s.rawIndex}]`,
        `"${s.id}" had nothing left to ask and was removed.`,
      );
      return false;
    }
    return true;
  });

  // ---- framing notes ----------------------------------------------------------------
  if (
    !d.stages.some(
      (s) => s.kind === 'nameGenerator' || s.kind === 'networkComposer',
    )
  )
    add(
      'note',
      'NO_NAME_GENERATOR',
      'stages',
      'The design names no nodes, so it collects no network.',
    );
  if (d.stages[0]?.kind !== 'information')
    add(
      'note',
      'NO_WELCOME',
      'stages[0]',
      'The interview does not start with a welcome screen.',
    );
  if (d.stages.at(-1)?.kind !== 'information')
    add(
      'note',
      'NO_CLOSING',
      'stages',
      'The interview does not end with a closing screen.',
    );
  for (const [scope, list] of [
    ['ego', d.egoAttributes] as const,
    ...d.nodeTypes.map((n) => [`node:${n.id}`, n.attributes] as const),
    ...d.relationships.map((r) => [`rel:${r.id}`, r.attributes] as const),
  ])
    for (const a of list)
      if (!collected.has(`${scope}/${a.id}`))
        add(
          'note',
          'NEVER_COLLECTED',
          describeScope(scope),
          `Attribute "${a.id}" is declared but no stage collects it.`,
        );
  for (const r of d.relationships)
    if (!createdRels.has(r.id))
      add(
        'note',
        'NEVER_CREATED',
        `relationships "${r.id}"`,
        `No stage creates "${r.id}" ties.`,
      );

  const fatal = d.stages.every((s) => s.kind === 'information')
    ? 'The design has no stage that collects data.'
    : null;
  return { design: d, issues, fatal };
};
