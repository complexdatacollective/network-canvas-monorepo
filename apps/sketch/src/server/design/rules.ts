// Single-answer rules shared by analyse.ts and compile.ts: slugs, option values,
// attribute -> variable mapping and condition resolution. Pure functions only.
import {
  DYNAMIC_VALUE_MARKER,
  escapeMessageText,
} from '@codaco/protocol-validation';

import type { AttributeKind, DesignAttribute, Operator } from './schema.ts';

/** Sketch writes every protocol in English, its one language. */
export const SKETCH_LOCALE = 'en';
export const SKETCH_LOCALIZATION = {
  defaultLocale: SKETCH_LOCALE,
  locales: [SKETCH_LOCALE],
};

/**
 * Participant-facing text as schema 9 holds it: one translation per language.
 * Schema 9 reads text as a message, so braces the models wrote are escaped to
 * show as written, and the character schema 9 reserves for dynamic values is
 * dropped.
 */
export const localized = (text: string) => ({
  [SKETCH_LOCALE]: escapeMessageText(text.replaceAll(DYNAMIC_VALUE_MARKER, '')),
});

export type Severity = 'adjusted' | 'degraded' | 'note';
export type DesignIssue = {
  severity: Severity;
  code: string;
  path: string;
  message: string;
};

/** Attribute after analysis: `builtin` marks attributes Sketch created. */
export type NAttribute = Omit<DesignAttribute, 'kind'> & {
  builtin?: 'name' | 'layout' | 'other' | 'location' | 'consent' | 'tag';
  kind: AttributeKind | 'location';
};

/** The parts of an attribute that resolveCondition reads. */
export type ConditionTarget = Pick<
  NAttribute,
  'kind' | 'options' | 'optionScores'
>;

/** The built-in name every node has: free text, so conditions on it compare words. */
export const NAME_CONDITION_TARGET: ConditionTarget = {
  kind: 'text',
  options: [],
  optionScores: [],
};

export const slug = (s: string): string => {
  const out = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['‘’ʼ`]/g, '') // strip apostrophes BEFORE slugging: "I don't know" -> i_dont_know
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '');
  return /^[0-9]/.test(out) ? `v_${out}` : out;
};

export const humanise = (id: string) => {
  const s = id.replace(/_+/g, ' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
};

export const graphemes = (s: string, max: number) => {
  const seg = [
    ...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(s.trim()),
  ].map((x) => x.segment);
  return seg.length <= max
    ? seg.join('')
    : `${seg
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`;
};

export type OptionValue = { label: string; value: string | number };

/** ordered -> optionScores or 1..n; choices -> unique slugs of the labels. */
const optionValues = (
  a: Pick<NAttribute, 'kind' | 'options' | 'optionScores'>,
): OptionValue[] => {
  if (a.kind === 'ordered') {
    const scores =
      a.optionScores.length === a.options.length ? a.optionScores : [];
    return a.options.map((label, i) => ({
      label,
      value: scores.length ? scores[i]! : i + 1,
    }));
  }
  const taken = new Set<string>();
  return a.options.map((label, i) => {
    const base = slug(label) || `option_${i + 1}`;
    let v = base;
    for (let n = 2; taken.has(v); n++) v = `${base}_${n}`;
    taken.add(v);
    return { label, value: v };
  });
};

type Json = Record<string, unknown>;

/** Options as a codebook holds them, with localized labels. */
const codebookOptions = (
  a: Pick<NAttribute, 'kind' | 'options' | 'optionScores'>,
) =>
  optionValues(a).map(({ label, value }) => ({
    label: localized(label),
    value,
  }));

/**
 * Attribute -> schema 9 variable (without the record key).
 * `askedInForm` decides Boolean (with options) vs Toggle for yes_no.
 */
export const variableFor = (
  a: NAttribute,
  varName: string,
  askedInForm: boolean,
): Json => {
  const v: Json = { name: varName };
  const validation: Json = {};
  if (a.required) validation.required = true;
  switch (a.kind) {
    case 'text':
      Object.assign(v, { type: 'text', component: 'Text' });
      break;
    case 'long_text':
      Object.assign(v, { type: 'text', component: 'TextArea' });
      break;
    case 'number':
      Object.assign(v, { type: 'number', component: 'Number' });
      if (a.numberRange.length === 2) {
        validation.minValue = a.numberRange[0];
        validation.maxValue = a.numberRange[1];
      }
      break;
    case 'yes_no':
      if (askedInForm) {
        const [yes = 'Yes', no = 'No'] = a.options;
        Object.assign(v, {
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: localized(yes), value: true },
            { label: localized(no), value: false, negative: true },
          ],
        });
      } else Object.assign(v, { type: 'boolean', component: 'Toggle' });
      break;
    case 'single_choice':
      Object.assign(v, {
        type: 'categorical',
        component:
          a.options.length <= 5 ? 'ToggleButtonGroup' : 'CheckboxGroup',
        options: codebookOptions(a),
      });
      validation.maxSelected = 1;
      break;
    case 'multi_choice':
      Object.assign(v, {
        type: 'categorical',
        component: 'CheckboxGroup',
        options: codebookOptions(a),
      });
      break;
    case 'ordered': {
      const likert =
        a.options.length >= 3 &&
        a.options.length <= 7 &&
        a.options.every((o) => [...o].length <= 24);
      Object.assign(v, {
        type: 'ordinal',
        component: likert ? 'LikertScale' : 'RadioGroup',
        options: codebookOptions(a),
      });
      break;
    }
    case 'slider':
      Object.assign(v, {
        type: 'scalar',
        component: 'VisualAnalogScale',
        parameters: {
          minLabel: localized(a.options[0] ?? 'Low'),
          maxLabel: localized(a.options[1] ?? 'High'),
        },
      });
      break;
    case 'date':
      Object.assign(v, {
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'full' },
      });
      break;
    case 'month_year':
      Object.assign(v, {
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'month' },
      });
      break;
    case 'year':
      Object.assign(v, {
        type: 'datetime',
        component: 'DatePicker',
        parameters: { type: 'year' },
      });
      break;
    case 'location':
      return { name: varName, type: 'location' };
  }
  if (a.builtin === 'name') validation.unique = true;
  if (Object.keys(validation).length) v.validation = validation;
  return v;
};

/** A condition resolved to schema 9 semantics, still keyed by design ids. */
export type ResolvedRule = {
  entity: 'ego' | 'node' | 'edge';
  typeId: string; // '' for ego
  attributeId: string; // '' for type-level rules
  operator: string;
  value?: unknown;
};

const YES = /^(yes|true|y|1)$/i;
const NO = /^(no|false|n|0)$/i;
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns a resolved rule, or an error message in design vocabulary. */
export const resolveCondition = (
  entity: 'ego' | 'node' | 'edge',
  typeId: string,
  a: ConditionTarget | undefined,
  attributeId: string,
  operator: Operator,
  rawValue: string,
  // A yes_no asked in a form stores an explicit false for No, so a blank
  // answer must not count as No. Tags and highlights are only ever set to true.
  askedInForm = false,
): ResolvedRule | string => {
  if (operator === 'any_exist' || operator === 'none_exist') {
    if (entity === 'ego')
      return `${operator} applies to nodes or relationships, not the participant.`;
    return {
      entity,
      typeId,
      attributeId: '',
      operator: operator === 'any_exist' ? 'EXISTS' : 'NOT_EXISTS',
    };
  }
  if (!a) return `"${attributeId}" is not an attribute here.`;
  const base = { entity, typeId, attributeId };
  if (operator === 'answered') return { ...base, operator: 'EXISTS' };
  if (operator === 'not_answered') return { ...base, operator: 'NOT_EXISTS' };
  const raw = rawValue.trim();
  const findOption = () => {
    const ov = optionValues(a);
    return (
      ov.find((o) => o.label.toLowerCase() === raw.toLowerCase()) ??
      ov.find((o) => slug(o.label) === slug(raw)) ??
      ov.find((o) => String(o.value) === raw)
    );
  };
  const notFor = (k: string, ok: string) =>
    `operator ${operator} does not apply to a ${k} attribute; use ${ok}.`;
  switch (a.kind) {
    case 'yes_no': {
      const yes =
        YES.test(raw) ||
        (!!a.options[0] && raw.toLowerCase() === a.options[0].toLowerCase());
      const no =
        NO.test(raw) ||
        (!!a.options[1] && raw.toLowerCase() === a.options[1].toLowerCase());
      if (!yes && !no)
        return `a yes_no value must be "yes" or "no" (got "${raw}").`;
      if (operator !== 'is' && operator !== 'is_not')
        return notFor('yes_no', 'is / is_not');
      // A form answer is true, false or (optional, skipped) unset: compare
      // exactly, so an unanswered question matches neither yes nor no.
      if (askedInForm)
        return {
          ...base,
          operator: 'EXACTLY',
          value: operator === 'is' ? yes : !yes,
        };
      // Tags and highlights are only ever set to true, so a never-set attribute must
      // count as "no" (EXACTLY false would match nobody): compare against true.
      const isYes = operator === 'is' ? yes : !yes;
      return { ...base, operator: isYes ? 'EXACTLY' : 'NOT', value: true };
    }
    case 'text':
    case 'long_text':
      if (operator === 'is')
        return { ...base, operator: 'EXACTLY', value: raw };
      if (operator === 'is_not')
        return { ...base, operator: 'NOT', value: raw };
      if (!raw) return 'contains needs a word or phrase.';
      if (operator === 'contains')
        return { ...base, operator: 'CONTAINS', value: escapeRegex(raw) };
      if (operator === 'does_not_contain')
        return {
          ...base,
          operator: 'DOES_NOT_CONTAIN',
          value: escapeRegex(raw),
        };
      return notFor('text', 'contains / does_not_contain / answered');
    case 'number': {
      const n = Number(raw);
      if (!raw || !Number.isFinite(n))
        return `value must be a number (got "${raw}").`;
      const m: Partial<Record<Operator, string>> = {
        is: 'EXACTLY',
        is_not: 'NOT',
        greater_than: 'GREATER_THAN',
        less_than: 'LESS_THAN',
        at_least: 'GREATER_THAN_OR_EQUAL',
        at_most: 'LESS_THAN_OR_EQUAL',
      };
      return m[operator]
        ? { ...base, operator: m[operator]!, value: n }
        : notFor(
            'number',
            'is / greater_than / less_than / at_least / at_most',
          );
    }
    case 'ordered': {
      const o = findOption();
      if (!o)
        return `"${raw}" is not an option of "${attributeId}" (${a.options.join(' | ')}).`;
      const ov = optionValues(a);
      const idx = ov.findIndex((x) => x.value === o.value);
      // order follows the options list, not the numeric score
      const pick = (f: (i: number) => boolean) =>
        ov.filter((_, i) => f(i)).map((x) => x.value);
      const sel: Partial<Record<Operator, (string | number)[]>> = {
        greater_than: pick((i) => i > idx),
        less_than: pick((i) => i < idx),
        at_least: pick((i) => i >= idx),
        at_most: pick((i) => i <= idx),
      };
      if (operator === 'is' || operator === 'includes')
        return { ...base, operator: 'EXACTLY', value: o.value };
      if (operator === 'is_not' || operator === 'excludes')
        return { ...base, operator: 'NOT', value: o.value };
      const s = sel[operator];
      if (s)
        return s.length
          ? { ...base, operator: 'INCLUDES', value: s }
          : `no option of "${attributeId}" is ${operator.replace('_', ' ')} "${o.label}".`;
      return notFor(
        'ordered',
        'is / is_not / at_least / at_most / greater_than / less_than',
      );
    }
    case 'single_choice':
    case 'multi_choice': {
      const o = findOption();
      if (!o)
        return `"${raw}" is not an option of "${attributeId}" (${a.options.join(' | ')}).`;
      if (operator === 'is' || operator === 'includes')
        return { ...base, operator: 'INCLUDES', value: o.value };
      if (operator === 'is_not' || operator === 'excludes')
        return { ...base, operator: 'EXCLUDES', value: o.value };
      return notFor('choice', 'includes / excludes');
    }
    default:
      return `only answered / not_answered can test a ${a.kind} attribute.`;
  }
};
