import type { z } from 'zod';

// NormalizedDesign (+ optional Wording) -> schema 9 protocol input
// (z.input<typeof CurrentProtocolSchema> in production), generated assets,
// a stage map (compiled index -> design stage or compiler-added stage) and a
// codebook source map. Deterministic and total on analyse() output.
import {
  createDefaultFinishSessionStage,
  type CurrentProtocolSchema,
  missingSuppliedStageText,
  withInterfaceText,
} from '@codaco/protocol-validation';
import { TESTING_MAPBOX_TOKEN } from '@codaco/shared-consts';

import type { GeneratedAsset, ProtocolSummary } from '../../shared/api.ts';
import type { NormalizedDesign, NStage } from './analyse.ts';
import {
  type NAttribute,
  type DesignIssue,
  graphemes,
  humanise,
  localized,
  resolveCondition,
  SKETCH_LOCALE,
  slug,
  type ResolvedRule,
  SKETCH_LOCALIZATION,
  variableFor,
} from './rules.ts';
import type { Wording } from './schema.ts';
import { worldCountriesGeojson } from './world-countries.ts';

type Json = Record<string, unknown>;

/**
 * What compile() emits: the INPUT side of the schema 9 protocol schema (before
 * zod's transforms and brands). The compiler assembles stages from plain
 * records keyed by the design, so the object is built as `Json` and asserted
 * to this type once, at the return. The type documents intent; it is not the
 * check. `validateProtocol` is, and build.ts always runs it.
 */
export type SketchProtocol = z.input<typeof CurrentProtocolSchema>;

export type { GeneratedAsset };
export type StageSource =
  | { designIndex: number; designId: string; kind: string }
  | { added: 'researcher notes' | 'consent' | 'consent gate' | 'finish' };
export type CompileResult = {
  protocol: SketchProtocol;
  assets: GeneratedAsset[];
  summary: ProtocolSummary;
  stageMap: StageSource[];
  /** protocol path prefix -> design location, for codebook paths */
  sourceMap: Map<string, string>;
};
export type CompileOptions = {
  /** Contents of the world-countries GeoJSON; defaults to the copy bundled with Sketch. Only read when a geospatial stage exists. */
  worldGeojson?: string;
  /** Defaults to TESTING_MAPBOX_TOKEN from @codaco/shared-consts. */
  mapboxToken?: string;
  now?: Date;
  /** issues from analyse(), listed on the researcher-notes screen */
  issues?: DesignIssue[];
};

export const MAPBOX_ASSET_ID = 'mapbox-testing-token';
export const GEOJSON_ASSET_ID = 'world-countries-geojson';
const MAP_REGION_PRESETS: Record<
  string,
  { center: [number, number]; zoom: number }
> = {
  world: { center: [10, 25], zoom: 1.5 },
  europe: { center: [15, 52], zoom: 3 },
  africa: { center: [20, 2], zoom: 2.5 },
  asia: { center: [90, 30], zoom: 2.2 },
  middle_east: { center: [45, 28], zoom: 3.5 },
  north_america: { center: [-100, 45], zoom: 2.5 },
  south_america: { center: [-60, -15], zoom: 2.5 },
  oceania: { center: [140, -25], zoom: 2.8 },
};
const ICONS = {
  people: 'add-a-person',
  places: 'add-a-place',
  organisations: 'add-a-context',
  other: 'add-a-context',
} as const;
const SHAPES = ['circle', 'square', 'diamond'] as const;
const CONSENT: NAttribute = {
  id: 'consent',
  label: 'Consent',
  question: 'Do you agree to take part in this study?',
  kind: 'yes_no',
  options: ['Yes, I agree to take part', 'No, I do not want to take part'],
  optionScores: [],
  numberRange: [],
  required: true,
  builtin: 'consent',
};
/** The English of a localized string Sketch wrote. */
const textOf = (text: unknown): string =>
  String((text as Record<string, string>)[SKETCH_LOCALE]);

/** Sets `value` at `path` in `target`, creating the records on the way. */
const setAt = (target: Json, path: readonly string[], value: unknown) => {
  let at = target;
  path.slice(0, -1).forEach((k) => {
    if (typeof at[k] !== 'object' || at[k] === null) at[k] = {};
    at = at[k] as Json;
  });
  at[path.at(-1)!] = value;
};

const INFO_TITLES = {
  welcome: 'Welcome',
  instructions: 'Before you begin',
  transition: 'Next',
  closing: 'Thank you',
} as const;

export const compile = (
  d: NormalizedDesign,
  wording: Wording | undefined,
  opts: CompileOptions,
): CompileResult => {
  const sourceMap = new Map<string, string>();
  const assets: GeneratedAsset[] = [];
  const assetManifest: Json = {};
  const placeholderNotes: string[] = [];

  // ---- wording overlay (only non-empty strings win) ------------------------------
  const W = {
    stage: new Map((wording?.stages ?? []).map((s) => [s.stageKey, s])),
    prompt: new Map((wording?.prompts ?? []).map((p) => [p.promptKey, p])),
    question: new Map(
      (wording?.questions ?? []).map((q) => [q.questionKey, q.text]),
    ),
  };
  const pick = (...xs: (string | undefined)[]) =>
    xs.find((x) => x && x.trim())?.trim() ?? '';
  const instruments = new Set(d.instrumentAttributes);

  // ---- codebook -------------------------------------------------------------------
  const takenKeys = new Set<string>();
  const keyOf = new Map<string, string>(); // "scope/attrId" -> record key
  const claim = (scope: string, attrId: string, prefix: string) => {
    // "<prefix>_<attr>", without doubling a prefix the model already wrote ("person_closeness" stays as is)
    const tail = attrId.replace('#', '_');
    const base =
      prefix === 'ego' || !tail.startsWith(`${prefix}_`)
        ? `${prefix}_${tail}`
        : tail;
    let k = base;
    for (let n = 2; takenKeys.has(k); n++) k = `${base}_${n}`;
    takenKeys.add(k);
    keyOf.set(`${scope}/${attrId}`, k);
    return k;
  };
  const key = (scope: string, attrId: string) =>
    keyOf.get(`${scope}/${attrId}`)!;
  const nodeKey = new Map<string, string>();
  const relKey = new Map<string, string>();
  const typeKeys = new Set<string>();
  const claimType = (id: string) => {
    let k = slug(id) || 'type';
    for (let n = 2; typeKeys.has(k); n++) k = `${slug(id)}_${n}`;
    typeKeys.add(k);
    return k;
  };
  d.nodeTypes.forEach((n) => nodeKey.set(n.id, claimType(n.id)));
  d.relationships.forEach((r) => relKey.set(r.id, claimType(r.id)));

  // "scope/attr" -> index of the first stage that asks it in a form. A
  // condition reads a yes_no as a form answer only once that form has run;
  // before then, a tag or highlight leaves "no" unset.
  const formFrom = new Map<string, number>();
  const askAt = (k: string, i: number) => {
    if (!formFrom.has(k)) formFrom.set(k, i);
  };
  d.stages.forEach((s, i) => {
    if (s.kind === 'egoForm')
      s.attributeIds.forEach((a) => askAt(`ego/${a}`, i));
    if (
      s.kind === 'alterForm' ||
      (s.kind === 'nameGenerator' && s.method === 'form')
    )
      s.attributeIds.forEach((a) => askAt(`node:${s.nodeTypeId}/${a}`, i));
    if (s.kind === 'relationshipForm')
      s.attributeIds.forEach((a) => askAt(`rel:${s.relationshipId}/${a}`, i));
    if (s.kind === 'networkComposer') {
      s.attributeIds.forEach((a) => askAt(`node:${s.nodeTypeId}/${a}`, i));
      s.relationships.forEach((e) =>
        e.attributeIds.forEach((a) => askAt(`rel:${e.relationshipId}/${a}`, i)),
      );
    }
  });
  if (d.includeConsent) formFrom.set('ego/consent', -1);
  const askedInForm = { has: (k: string) => formFrom.has(k) };
  const askedBefore = (k: string, s: NStage) =>
    (formFrom.get(k) ?? Infinity) < d.stages.indexOf(s);
  const needsLayout = new Set(
    d.stages
      .filter(
        (s) =>
          s.kind === 'sociogram' ||
          s.kind === 'narrative' ||
          s.kind === 'networkComposer',
      )
      .map((s) => (s as { nodeTypeId: string }).nodeTypeId),
  );
  const otherFor = new Set<string>(); // "node:t/attr" with an Other bin
  for (const s of d.stages)
    if (s.kind === 'bins')
      s.prompts.forEach(
        (p) =>
          p.allowOther && otherFor.add(`node:${s.nodeTypeId}/${p.attributeId}`),
      );

  const codebook: Json = {};
  const egoList = d.includeConsent
    ? [CONSENT, ...d.egoAttributes]
    : d.egoAttributes;
  if (egoList.length) {
    const vars: Json = {};
    for (const a of egoList) {
      const k = claim('ego', a.id, 'ego');
      vars[k] = variableFor(a, a.id, askedInForm.has(`ego/${a.id}`));
      sourceMap.set(
        `codebook.ego.variables.${k}`,
        a.builtin ? 'the built-in consent question' : `egoAttributes "${a.id}"`,
      );
    }
    codebook.ego = { variables: vars };
  }
  if (d.nodeTypes.length) {
    const nodes: Json = {};
    d.nodeTypes.forEach((n, i) => {
      const scope = `node:${n.id}`;
      const tk = nodeKey.get(n.id)!;
      const vars: Json = {};
      const nameAttr: NAttribute = {
        id: 'name',
        label: 'Name',
        question: n.nameQuestion,
        kind: 'text',
        options: [],
        optionScores: [],
        numberRange: [],
        required: true,
        builtin: 'name',
      };
      vars[claim(scope, 'name', tk)] = variableFor(nameAttr, 'name', true);
      if (needsLayout.has(n.id))
        vars[claim(scope, 'layout', tk)] = { name: 'layout', type: 'layout' };
      // every declared id up front, so a generated `<id>_other` never takes one
      const names = new Set([
        'name',
        'layout',
        ...n.attributes.map((a) => a.id),
      ]);
      for (const a of n.attributes) {
        const k = claim(scope, a.id, tk);
        vars[k] = variableFor(a, a.id, askedInForm.has(`${scope}/${a.id}`));
        sourceMap.set(
          `codebook.node.${tk}.variables.${k}`,
          `nodeTypes "${n.id}" attribute "${a.id}"`,
        );
        if (otherFor.has(`${scope}/${a.id}`)) {
          let nm = `${a.id}_other`;
          for (let m = 2; names.has(nm); m++) nm = `${a.id}_other_${m}`;
          names.add(nm);
          vars[claim(scope, `${a.id}#other`, tk)] = {
            name: nm,
            type: 'text',
            component: 'Text',
          };
        }
      }
      nodes[tk] = {
        name: n.singular,
        icon: ICONS[n.represents],
        color: `node-color-seq-${(i % 8) + 1}`,
        shape: { default: SHAPES[i % 3] },
        variables: vars,
      };
      sourceMap.set(`codebook.node.${tk}`, `nodeTypes "${n.id}"`);
    });
    codebook.node = nodes;
  }
  if (d.relationships.length) {
    const edges: Json = {};
    d.relationships.forEach((r, i) => {
      const scope = `rel:${r.id}`;
      const tk = relKey.get(r.id)!;
      const vars: Json = {};
      for (const a of r.attributes) {
        const k = claim(scope, a.id, tk);
        vars[k] = variableFor(a, a.id, askedInForm.has(`${scope}/${a.id}`));
        sourceMap.set(
          `codebook.edge.${tk}.variables.${k}`,
          `relationships "${r.id}" attribute "${a.id}"`,
        );
      }
      edges[tk] = {
        name: r.name,
        color: `edge-color-seq-${(i % 8) + 1}`,
        ...(Object.keys(vars).length ? { variables: vars } : {}),
      };
      sourceMap.set(`codebook.edge.${tk}`, `relationships "${r.id}"`);
    });
    codebook.edge = edges;
  }

  // ---- rules ------------------------------------------------------------------------
  const attrIn = (scope: string, id: string): NAttribute | undefined => {
    if (id === 'name' && scope.startsWith('node:'))
      return {
        id: 'name',
        kind: 'text',
        options: [],
        optionScores: [],
      } as unknown as NAttribute;
    const list =
      scope === 'ego'
        ? egoList
        : scope.startsWith('node:')
          ? d.nodeTypes.find((n) => `node:${n.id}` === scope)?.attributes
          : d.relationships.find((r) => `rel:${r.id}` === scope)?.attributes;
    return list?.find((a) => a.id === id);
  };
  let ruleCounter = 0;
  const toRule = (r: ResolvedRule): Json => {
    const scope =
      r.entity === 'ego'
        ? 'ego'
        : r.entity === 'node'
          ? `node:${r.typeId}`
          : `rel:${r.typeId}`;
    const options: Json = {};
    if (r.entity !== 'ego')
      options.type =
        r.entity === 'node' ? nodeKey.get(r.typeId) : relKey.get(r.typeId);
    if (r.attributeId) options.attribute = key(scope, r.attributeId);
    options.operator = r.operator;
    if (r.value !== undefined) options.value = r.value;
    return { id: `rule_${++ruleCounter}`, type: r.entity, options };
  };
  const filterOf = (rules: Json[], match: 'all' | 'any'): Json =>
    rules.length > 1
      ? { join: match === 'any' ? 'OR' : 'AND', rules }
      : { rules };
  const nodeFilter = (s: NStage): Json | undefined => {
    if (!('filter' in s) || !s.filter.conditions.length) return undefined;
    const t = (s as { nodeTypeId: string }).nodeTypeId;
    const rules = s.filter.conditions
      .map((c) =>
        resolveCondition(
          'node',
          t,
          attrIn(`node:${t}`, c.attributeId),
          c.attributeId,
          c.operator,
          c.value,
          askedBefore(`node:${t}/${c.attributeId}`, s),
        ),
      )
      .filter((r): r is ResolvedRule => typeof r !== 'string')
      .map(toRule);
    return rules.length ? filterOf(rules, s.filter.match) : undefined;
  };

  // skip logic, including the mechanical auto-skip for stages whose nodes / ties may not exist
  const guaranteed = new Set<string>();
  const skipFor = (s: NStage): Json | undefined => {
    const sk = s.skipLogic;
    const rules = sk.conditions
      .map((c) => {
        const entity =
          c.about === 'participant'
            ? 'ego'
            : c.about === 'nodes'
              ? 'node'
              : 'edge';
        const scope =
          entity === 'ego'
            ? 'ego'
            : entity === 'node'
              ? `node:${c.typeId}`
              : `rel:${c.typeId}`;
        return resolveCondition(
          entity,
          c.typeId,
          c.attributeId ? attrIn(scope, c.attributeId) : undefined,
          c.attributeId,
          c.operator,
          c.value,
          askedBefore(`${scope}/${c.attributeId}`, s),
        );
      })
      .filter((r): r is ResolvedRule => typeof r !== 'string')
      .map(toRule);
    const destination =
      sk.whenSkipped === 'end_interview'
        ? { destination: { type: 'finish' } }
        : {};
    // auto-skip: nothing to show when no node of the type (or no tie) exists
    const nodeType =
      'nodeTypeId' in s &&
      s.kind !== 'nameGenerator' &&
      s.kind !== 'networkComposer'
        ? s.nodeTypeId
        : '';
    const absentRule: ResolvedRule | undefined =
      nodeType && !guaranteed.has(nodeType)
        ? {
            entity: 'node',
            typeId: nodeType,
            attributeId: '',
            operator: 'NOT_EXISTS',
          }
        : s.kind === 'relationshipForm'
          ? {
              entity: 'edge',
              typeId: s.relationshipId,
              attributeId: '',
              operator: 'NOT_EXISTS',
            }
          : undefined;
    // The auto-skip only ever falls through to the next stage, so it is never merged
    // into a skip that ends the interview.
    const usesAbsent =
      absentRule &&
      (sk.mode === 'always_show' ||
        (sk.mode === 'skip_if' &&
          sk.whenSkipped !== 'end_interview' &&
          (sk.match === 'any' || rules.length === 1)));
    const absent = usesAbsent ? toRule(absentRule) : undefined;
    if (sk.mode === 'always_show')
      return absent
        ? { action: 'SKIP', filter: { rules: [absent] } }
        : undefined;
    if (sk.mode === 'skip_if' && absent)
      return {
        action: 'SKIP',
        filter: { join: 'OR', rules: [...rules, absent] },
        ...destination,
      };
    // show_only_if gets the same guard as a further "and they exist" condition
    if (
      sk.mode === 'show_only_if' &&
      absentRule &&
      sk.whenSkipped !== 'end_interview' &&
      (sk.match === 'all' || rules.length <= 1)
    )
      return {
        action: 'SHOW',
        filter: {
          join: 'AND',
          rules: [...rules, toRule({ ...absentRule, operator: 'EXISTS' })],
        },
      };
    return {
      action: sk.mode === 'skip_if' ? 'SKIP' : 'SHOW',
      filter: filterOf(rules, sk.match),
      ...destination,
    };
  };

  // ---- stages -----------------------------------------------------------------------
  const stages: Json[] = [];
  const stageMap: StageSource[] = [];
  const stageIds = new Set<string>();
  const sid = (id: string) => {
    let x = id;
    for (let n = 2; stageIds.has(x); n++) x = `${id}_${n}`;
    stageIds.add(x);
    return x;
  };
  const label = (designId: string, fallback: string) =>
    graphemes(pick(W.stage.get(designId)?.label, fallback) || 'Stage', 50);
  // Only an Ego Form has an introduction panel in schema 9.
  const intro = (designId: string, title: string, text: string) => ({
    title: localized(pick(W.stage.get(designId)?.title, title)),
    text: localized(pick(W.stage.get(designId)?.text, text)),
  });
  const qKey = (scope: string, id: string) =>
    scope === 'ego' ? `ego/${id}` : `${scope}/${id}`;
  const field = (scope: string, attrId: string) => {
    const a = attrIn(scope, attrId)!;
    const qk = a.builtin === 'consent' ? 'consent' : qKey(scope, attrId);
    // validated instruments keep the design's exact wording
    const polished = instruments.has(`${scope}/${attrId}`)
      ? ''
      : W.question.get(qk);
    return {
      variable: key(scope, attrId),
      prompt: localized(pick(polished, a.question, a.label)),
    };
  };
  const prompt = (designId: string, i: number, draft: string) =>
    localized(pick(W.prompt.get(`${designId}/p${i + 1}`)?.text, draft));
  const nodeSubject = (t: string) => ({ entity: 'node', type: nodeKey.get(t) });
  const relName = (id: string) =>
    d.relationships.find((r) => r.id === id)!.name;
  // ties created so far, with the node type they were drawn between: a map
  // shows only the ties between the people on it
  const createdRels: { ek: string; t: string }[] = [];
  const created = (ek: string, t: string) => {
    if (!createdRels.some((r) => r.ek === ek && r.t === t))
      createdRels.push({ ek, t });
  };
  const createdFor = (t: string) =>
    createdRels.filter((r) => r.t === t).map((r) => r.ek);
  const namedBefore = new Set<string>();
  const lastSociogramAuto = new Map<string, boolean>();
  let ordColor = 0;

  // consent placement: after an opening welcome screen that always shows,
  // else first, so no skip logic can end the interview before consent
  const opening = d.stages[0];
  const consentAfter = d.includeConsent
    ? opening?.kind === 'information' &&
      opening.role === 'welcome' &&
      opening.skipLogic.mode === 'always_show'
      ? 0
      : -1
    : null;
  let gatePending = false;
  const push = (stage: Json, src: StageSource) => {
    if (gatePending) {
      const gate = {
        action: 'SKIP',
        filter: {
          rules: [
            toRule({
              entity: 'ego',
              typeId: '',
              attributeId: 'consent',
              operator: 'EXACTLY',
              value: false,
            }),
          ],
        },
        destination: { type: 'finish' },
      };
      if (stage.skipLogic) {
        // a stage holds one skipLogic: carry the gate on a short screen
        const w = W.stage.get('consent_given');
        stages.push({
          id: sid('consent_given'),
          type: 'Information',
          label: localized('Consent given'),
          skipLogic: gate,
          title: localized(pick(w?.title, 'Thank you')),
          items: [
            {
              id: 'text',
              type: 'text',
              content: localized(
                pick(
                  w?.text,
                  "Thank you for agreeing to take part. Let's begin.",
                ),
              ),
            },
          ],
        });
        stageMap.push({ added: 'consent gate' });
      } else stage.skipLogic = gate;
      gatePending = false;
    }
    stages.push(stage);
    stageMap.push(src);
  };
  const emitConsent = () => {
    push(
      {
        id: sid('consent'),
        type: 'EgoForm',
        label: localized(label('consent', 'Consent')),
        introductionPanel: intro(
          'consent',
          'Taking part',
          d.consentText ||
            'Please read the information about this study before deciding whether to take part.',
        ),
        form: { fields: [field('ego', 'consent')] },
      },
      { added: 'consent' },
    );
    gatePending = true;
  };
  if (consentAfter === -1) emitConsent();

  d.stages.forEach((s, idx) => {
    const src: StageSource = {
      designIndex: s.rawIndex,
      designId: s.id,
      kind: s.kind,
    };
    const base = (id: string, type: string, lbl: string): Json => {
      const st: Json = { id: sid(id), type, label: localized(lbl) };
      if (s.interviewerNote) st.interviewScript = s.interviewerNote;
      const sk = skipFor(s);
      if (sk) st.skipLogic = sk;
      return st;
    };
    const scope = 'nodeTypeId' in s ? `node:${s.nodeTypeId}` : '';
    const nt =
      'nodeTypeId' in s
        ? d.nodeTypes.find((n) => n.id === s.nodeTypeId)!
        : undefined;
    const withFilter = (st: Json) => {
      const f = nodeFilter(s);
      if (f) st.filter = f;
      return st;
    };
    switch (s.kind) {
      case 'information': {
        const w = W.stage.get(s.id);
        const content = pick(w?.text, s.content);
        push(
          {
            ...base(s.id, 'Information', label(s.id, humanise(s.id))),
            title: localized(pick(w?.title, INFO_TITLES[s.role])),
            items: content
              ? [{ id: 'text', type: 'text', content: localized(content) }]
              : [],
          },
          src,
        );
        break;
      }
      case 'egoForm':
        push(
          {
            ...base(s.id, 'EgoForm', label(s.id, humanise(s.id))),
            introductionPanel: intro(
              s.id,
              'About you',
              'Please answer the following questions about yourself.',
            ),
            form: { fields: s.attributeIds.map((a) => field('ego', a)) },
          },
          src,
        );
        break;
      case 'alterForm':
        push(
          withFilter({
            ...base(s.id, 'AlterForm', label(s.id, humanise(s.id))),
            subject: nodeSubject(s.nodeTypeId),
            form: { fields: s.attributeIds.map((a) => field(scope, a)) },
          }),
          src,
        );
        break;
      case 'relationshipForm': {
        const r = d.relationships.find((x) => x.id === s.relationshipId)!;
        push(
          {
            ...base(s.id, 'AlterEdgeForm', label(s.id, humanise(s.id))),
            subject: { entity: 'edge', type: relKey.get(r.id) },
            form: {
              fields: s.attributeIds.map((a) => field(`rel:${r.id}`, a)),
            },
          },
          src,
        );
        break;
      }
      case 'nameGenerator': {
        const n = nt!;
        const nameKey = key(scope, 'name');
        const prompts = s.prompts.map((p, i) => ({
          id: `p${i + 1}`,
          text: prompt(s.id, i, p.text),
          ...(p.tagAttributeId
            ? {
                additionalAttributes: [
                  { variable: key(scope, p.tagAttributeId), value: true },
                ],
              }
            : {}),
        }));
        const behaviours: Json = {};
        if (s.minNodes > 0) behaviours.minNodes = s.minNodes;
        if (s.maxNodes > 0) behaviours.maxNodes = s.maxNodes;
        const common: Json = {
          subject: nodeSubject(n.id),
          prompts,
          ...(Object.keys(behaviours).length ? { behaviours } : {}),
        };
        // An earlier generator named this type, or an earlier prompt here did: either way
        // the people already named are off screen and (with the unique name rule) cannot
        // be retyped, so they must be draggable from a panel.
        const panels =
          (namedBefore.has(n.id) || s.prompts.length > 1) &&
          s.method !== 'roster'
            ? {
                panels: [
                  {
                    id: 'existing',
                    title: localized('Already mentioned'),
                    dataSource: 'existing',
                  },
                ],
              }
            : {};
        const stageLabel = label(s.id, humanise(s.id));
        const st = base(s.id, '', stageLabel);
        if (s.method === 'quick_add')
          push(
            {
              ...st,
              type: 'NameGeneratorQuickAdd',
              ...common,
              quickAdd: nameKey,
              ...panels,
            },
            src,
          );
        else if (s.method === 'form') {
          const w = W.stage.get(s.id);
          push(
            {
              ...st,
              type: 'NameGenerator',
              ...common,
              form: {
                title: localized(
                  pick(w?.title, `Add a ${n.singular.toLowerCase()}`),
                ),
                fields: [
                  {
                    variable: nameKey,
                    prompt: localized(
                      pick(W.question.get(`${scope}/name`), n.nameQuestion),
                    ),
                  },
                  ...s.attributeIds.map((a) => field(scope, a)),
                ],
              },
              ...panels,
            },
            src,
          );
        } else {
          const assetId = `${st.id}_roster`;
          const cols = ['name', ...s.attributeIds]; // variable NAMES: the interview maps CSV headers by name, then key
          // at least as many rows as the stage requires the participant to pick
          const rowCount = Math.max(12, s.minNodes);
          const rows = Array.from({ length: rowCount }, (_, i) => [
            `${n.singular} ${String(i + 1).padStart(2, '0')}`,
            ...s.attributeIds.map((aid) => {
              const a = attrIn(scope, aid)!;
              return a.kind === 'number'
                ? String(
                    a.numberRange.length
                      ? Math.min(a.numberRange[1]!, a.numberRange[0]! + i)
                      : i + 1,
                  )
                : a.kind === 'yes_no'
                  ? String(i % 2 === 0)
                  : `Example ${a.label.toLowerCase()} ${(i % 3) + 1}`;
            }),
          ]);
          const csv = `${[cols, ...rows].map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n')}\n`;
          assets.push({
            id: assetId,
            name: `${assetId}.csv`,
            mimeType: 'text/csv',
            content: csv,
          });
          assetManifest[assetId] = {
            id: assetId,
            type: 'network',
            // Architect picks the parser from this name's extension.
            name: `${n.plural} list (PLACEHOLDER, replace before fielding).csv`,
            source: `${assetId}.csv`,
          };
          placeholderNotes.push(
            `**Placeholder roster.** Stage "${stageLabel}" picks ${n.plural.toLowerCase()} from a generated list of ${rowCount} example rows (${assetId}.csv). Replace it in Architect with your real list before fielding, keeping the column headers: ${cols.join(', ')}.`,
          );
          push(
            {
              ...st,
              type: 'NameGeneratorRoster',
              ...common,
              dataSource: assetId,
              ...(s.attributeIds.length
                ? {
                    cardOptions: {
                      additionalProperties: s.attributeIds.map((a) => ({
                        label: localized(attrIn(scope, a)!.label),
                        variable: key(scope, a),
                      })),
                    },
                  }
                : {}),
              sortOptions: {
                sortOrder: [{ property: nameKey, direction: 'asc' }],
                sortableProperties: [
                  { label: localized('Name'), variable: nameKey },
                ],
              },
              searchOptions: { fuzziness: 0.5, matchProperties: [nameKey] },
            },
            src,
          );
        }
        namedBefore.add(n.id);
        if (s.skipLogic.mode === 'always_show' && s.minNodes >= 1)
          guaranteed.add(n.id);
        break;
      }
      case 'sociogram': {
        const layoutVariable = key(scope, 'layout');
        const automaticLayout = !s.prompts.some((p) => p.task === 'position');
        lastSociogramAuto.set(s.nodeTypeId, automaticLayout);
        const prompts = s.prompts.map((p, i) => {
          const out: Json = {
            id: `p${i + 1}`,
            text: prompt(s.id, i, p.text),
            layout: { layoutVariable },
          };
          if (p.task === 'connect') {
            const ek = relKey.get(p.relationshipId)!;
            created(ek, s.nodeTypeId);
            // only the type being drawn: other types on screen while
            // drawing are easily mistaken for the one being created
            out.edges = { create: ek, display: [ek] };
          } else if (createdFor(s.nodeTypeId).length)
            out.edges = { display: createdFor(s.nodeTypeId) };
          if (p.task === 'highlight')
            out.highlight = {
              allowHighlighting: true,
              variable: key(scope, p.attributeId),
            };
          return out;
        });
        push(
          withFilter({
            ...base(s.id, 'Sociogram', label(s.id, humanise(s.id))),
            subject: nodeSubject(s.nodeTypeId),
            background: { concentricCircles: 4, skewedTowardCenter: true },
            behaviours: { automaticLayout },
            prompts,
          }),
          src,
        );
        break;
      }
      case 'networkComposer': {
        const composerField = (sc: string, a: string) => {
          const f = field(sc, a);
          return {
            variable: f.variable,
            component: variableFor(attrIn(sc, a)!, a, true).component,
            label: f.prompt,
          };
        };
        for (const e of s.relationships) {
          const ek = relKey.get(e.relationshipId)!;
          created(ek, s.nodeTypeId);
        }
        // The participant can switch the composer's layout to manual and
        // arrange people themselves, so a following narrative keeps positions.
        lastSociogramAuto.set(s.nodeTypeId, false);
        namedBefore.add(s.nodeTypeId);
        push(
          {
            ...base(s.id, 'NetworkComposer', label(s.id, humanise(s.id))),
            subject: nodeSubject(s.nodeTypeId),
            quickAdd: key(scope, 'name'),
            layoutVariable: key(scope, 'layout'),
            ...(s.attributeIds.length
              ? {
                  nodeForm: {
                    fields: s.attributeIds.map((a) => composerField(scope, a)),
                  },
                }
              : {}),
            ...(s.groupAttributeId
              ? { convexHullVariable: key(scope, s.groupAttributeId) }
              : {}),
            background: { concentricCircles: 4, skewedTowardCenter: true },
            behaviours: { automaticLayout: true },
            ...(s.relationships.length
              ? {
                  edges: s.relationships.map((e, i) => ({
                    id: `edge${i + 1}`,
                    subject: {
                      entity: 'edge',
                      type: relKey.get(e.relationshipId),
                    },
                    // the toolbar names each relationship
                    label: localized(relName(e.relationshipId)),
                    ...(e.attributeIds.length
                      ? {
                          form: {
                            fields: e.attributeIds.map((a) =>
                              composerField(`rel:${e.relationshipId}`, a),
                            ),
                          },
                        }
                      : {}),
                  })),
                }
              : {}),
          },
          src,
        );
        break;
      }
      case 'narrative':
        push(
          withFilter({
            ...base(s.id, 'Narrative', label(s.id, humanise(s.id))),
            subject: nodeSubject(s.nodeTypeId),
            presets: s.views.map((v, i) => ({
              id: `view${i + 1}`,
              label: localized(
                pick(W.prompt.get(`${s.id}/view${i + 1}`)?.text, v.label),
              ),
              layoutVariable: key(scope, 'layout'),
              ...(v.groupByAttributeId
                ? { groupVariable: key(scope, v.groupByAttributeId) }
                : {}),
              ...(v.relationshipIds.length
                ? {
                    edges: {
                      // the legend names each relationship shown
                      display: v.relationshipIds.map((r) => ({
                        type: relKey.get(r),
                        label: localized(relName(r)),
                      })),
                    },
                  }
                : {}),
              ...(v.highlightAttributeIds.length
                ? {
                    // the legend names each highlighted attribute
                    highlight: v.highlightAttributeIds.map((h) => ({
                      variable: key(scope, h),
                      label: localized(attrIn(scope, h)!.label),
                    })),
                  }
                : {}),
            })),
            background: { concentricCircles: 4, skewedTowardCenter: true },
            // keep participant-placed positions; re-run the force layout only if the map was automatic
            behaviours: {
              automaticLayout: lastSociogramAuto.get(s.nodeTypeId) ?? true,
              allowRepositioning: true,
              freeDraw: true,
            },
          }),
          src,
        );
        break;
      case 'bins': {
        const runs: {
          kind: 'OrdinalBin' | 'CategoricalBin';
          prompts: { p: (typeof s.prompts)[number]; i: number }[];
        }[] = [];
        s.prompts.forEach((p, i) => {
          const kind =
            attrIn(scope, p.attributeId)!.kind === 'ordered'
              ? 'OrdinalBin'
              : 'CategoricalBin';
          if (runs.at(-1)?.kind === kind) runs.at(-1)!.prompts.push({ p, i });
          else runs.push({ kind, prompts: [{ p, i }] });
        });
        runs.forEach((run, ri) => {
          const lbl = label(s.id, humanise(s.id));
          const prompts = run.prompts.map(({ p, i }, j) => {
            const out: Json = {
              id: `p${j + 1}`,
              text: prompt(s.id, i, p.text),
              variable: key(scope, p.attributeId),
            };
            if (run.kind === 'OrdinalBin')
              out.color = `ord-color-seq-${(ordColor++ % 10) + 1}`;
            if (run.kind === 'CategoricalBin' && p.allowOther)
              Object.assign(out, {
                otherVariable: key(scope, `${p.attributeId}#other`),
                otherVariablePrompt: localized('Please describe'),
                otherOptionLabel: localized('Other'),
              });
            return out;
          });
          push(
            withFilter({
              ...base(
                ri ? `${s.id}_${ri + 1}` : s.id,
                run.kind,
                ri ? graphemes(`${lbl} (${ri + 1})`, 50) : lbl,
              ),
              subject: nodeSubject(s.nodeTypeId),
              prompts,
            }),
            src,
          );
        });
        break;
      }
      case 'relationshipCensus': {
        const type =
          s.method === 'every_pair'
            ? 'DyadCensus'
            : s.method === 'one_at_a_time'
              ? 'OneToManyDyadCensus'
              : 'TieStrengthCensus';
        const prompts = s.prompts.map((p, i) => {
          const ek = relKey.get(p.relationshipId)!;
          created(ek, s.nodeTypeId);
          const out: Json = {
            id: `p${i + 1}`,
            text: prompt(s.id, i, p.text),
            createEdge: ek,
          };
          if (type === 'TieStrengthCensus')
            Object.assign(out, {
              edgeVariable: key(
                `rel:${p.relationshipId}`,
                p.strengthAttributeId,
              ),
              negativeLabel: localized(
                pick(
                  W.prompt.get(`${s.id}/p${i + 1}`)?.negativeLabel,
                  p.noTieLabel,
                  'Not connected',
                ),
              ),
            });
          return out;
        });
        const st = withFilter({
          ...base(s.id, type, label(s.id, humanise(s.id))),
          subject: nodeSubject(s.nodeTypeId),
          prompts,
        });
        if (type === 'OneToManyDyadCensus')
          st.behaviours = { removeAfterConsideration: true };
        push(st, src);
        break;
      }
      case 'geospatial': {
        const region =
          MAP_REGION_PRESETS[s.mapRegion] ?? MAP_REGION_PRESETS.world!;
        assetManifest[MAPBOX_ASSET_ID] = {
          id: MAPBOX_ASSET_ID,
          type: 'apikey',
          name: 'Mapbox token (testing only: replace before fielding)',
          value: opts.mapboxToken ?? TESTING_MAPBOX_TOKEN,
        };
        if (!assetManifest[GEOJSON_ASSET_ID]) {
          assetManifest[GEOJSON_ASSET_ID] = {
            id: GEOJSON_ASSET_ID,
            type: 'geojson',
            name: 'World countries (boundaries)',
            source: 'world-countries.geojson',
          };
          assets.push({
            id: GEOJSON_ASSET_ID,
            name: 'world-countries.geojson',
            mimeType: 'application/geo+json',
            content: opts.worldGeojson ?? worldCountriesGeojson(),
          });
          placeholderNotes.push(
            '**Map token.** The map stage uses the Network Canvas testing Mapbox token, which only works on networkcanvas.com sites and localhost. Replace the "Mapbox token" resource with your own token before fielding.',
          );
        }
        push(
          withFilter({
            ...base(s.id, 'Geospatial', label(s.id, humanise(s.id))),
            subject: nodeSubject(s.nodeTypeId),
            mapOptions: {
              tokenAssetId: MAPBOX_ASSET_ID,
              style: 'mapbox://styles/mapbox/light-v11',
              center: region.center,
              initialZoom: region.zoom,
              dataSourceAssetId: GEOJSON_ASSET_ID,
              color: 'ord-color-seq-1',
              targetFeatureProperty: 'name',
              showTransit: false,
              allowSearch: true,
            },
            prompts: s.prompts.map((p, i) => ({
              id: `p${i + 1}`,
              text: prompt(s.id, i, p.text),
              variable: key(scope, p.locationAttributeId),
            })),
          }),
          src,
        );
        break;
      }
    }
    if (consentAfter === idx) emitConsent();
  });

  // ---- researcher notes (template convention: first stage, delete before fielding) ----
  const changed = (opts.issues ?? []).filter((i) => i.severity === 'degraded');
  const instrumentList = [...instruments].map((x) => x.split('/')[1]);
  const notes = [
    `**About this draft.** Sketch drafted this protocol from a study description. Review every stage before fielding.`,
    d.summary && `**Study.** ${d.summary}`,
    d.rationale && `**Design rationale.** ${d.rationale}`,
    instrumentList.length &&
      `**Validated instruments.** Check the wording and scoring of ${instrumentList.join(', ')} against the published instrument; Sketch reproduces them from memory.`,
    ...placeholderNotes,
    changed.length &&
      `**Changes Sketch made.**\n${changed.map((i) => `- ${i.message}`).join('\n')}`,
  ].filter(Boolean) as string[];
  stages.unshift({
    id: sid('researcher_notes'),
    type: 'Information',
    label: localized('Researcher notes (delete before fielding)'),
    title: localized('Notes for the research team'),
    items: [
      { id: 'text', type: 'text', content: localized(notes.join('\n\n')) },
    ],
  });
  stageMap.unshift({ added: 'researcher notes' });

  // Schema 9 ends every interview at a finish stage, with the closing text
  // Network Canvas supplies.
  stages.push(
    createDefaultFinishSessionStage({
      id: sid('finish'),
      localization: SKETCH_LOCALIZATION,
    }),
  );
  stageMap.push({ added: 'finish' });

  // The wording Network Canvas supplies for each stage's own controls and
  // notices, as Architect writes it into a new stage.
  for (const stage of stages)
    for (const { path, value } of missingSuppliedStageText(
      stage as { type: string },
      SKETCH_LOCALIZATION,
    ))
      setAt(stage, path, value);

  const protocol: Json = {
    name: graphemes(
      pick(
        wording?.protocolName,
        d.workingTitle,
        d.summary.split(/[.!?]/)[0],
        'Untitled study',
      ),
      100,
    ),
    description: pick(wording?.protocolDescription, d.summary),
    schemaVersion: 9,
    lastModified: (opts.now ?? new Date()).toISOString(),
    localization: SKETCH_LOCALIZATION,
    codebook,
    ...(Object.keys(assetManifest).length ? { assetManifest } : {}),
    stages,
  };
  const summary: ProtocolSummary = {
    name: String(protocol.name),
    stageCount: stages.length,
    stages: stages.map((st) => ({
      label: textOf(st.label),
      type: String(st.type),
    })),
    nodeTypes: d.nodeTypes.map((n) => n.singular),
    edgeTypes: d.relationships.map((r) => r.name),
    rosterCount: assets.filter((a) => a.mimeType === 'text/csv').length,
  };
  return {
    // The interview's shared words for what the protocol uses.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SketchProtocol
    protocol: withInterfaceText(protocol as SketchProtocol),
    assets,
    summary,
    stageMap,
    sourceMap,
  };
};
