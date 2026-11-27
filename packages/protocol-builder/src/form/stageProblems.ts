import type { IntlShape } from '@codaco/app-i18n/messages';
import { getValue } from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import {
  type Codebook,
  collectLocalizedStringsFromSchema,
  enclosingProtocolObjects,
  findDynamicAttributeProblems,
  findDynamicValueProblems,
  type LocaleTag,
  type LocalizationDeclaration,
  stageSchema,
  textPlaceOf,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { DynamicAttributeOwner } from '../localization/dynamicAttributeNames.ts';
import { namedDynamicAttributeProblem } from '../localization/dynamicAttributeProblems.ts';
import {
  stageDocument,
  type StageFormDraft,
  type StageIdentity,
} from '../stageDocument.ts';
import type { SectionValidationIssue } from './outlineStore.ts';

/** What is wrong with a stage: by section, and about the stage as a whole. */
type StageProblems = Readonly<{
  sections: SectionValidationIssue[];
  whole: string[];
}>;

/** A problem's message, named by what it is about where that helps. */
type Naming = (path: readonly (string | number)[], message: string) => string;

const pathOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((part) => (typeof part === 'symbol' ? String(part) : part));

/**
 * Whether a problem's path is inside one of the stage's dynamic attributes:
 * a version's wording, or the dynamic attribute itself (it is not used, or
 * its logic reads something that does not exist). A problem path is not a
 * translatable string's, so `textPlaceOf` cannot answer for all of these.
 */
const isInDynamicAttribute = (path: readonly (string | number)[]) =>
  path[0] === 'dynamicAttributes';

/**
 * What the protocol's own checks ask of the values a stage's text shows, and
 * of the dynamic attributes it declares, which the stage's schema cannot:
 * that each value is bound and can be shown there, and that each dynamic
 * attribute reads conditions, an attribute and answers that exist. A stage
 * saved without asking would leave the protocol invalid until it is next
 * checked whole.
 */
function protocolRuleProblems(
  document: SectionDoc,
  {
    codebook,
    localization,
    naming,
  }: Readonly<{
    codebook: Readonly<Codebook>;
    localization: LocalizationDeclaration | undefined;
    naming: Naming;
  }>,
): StageProblems {
  // The stage's strings as the protocol has them, at its first stage.
  const hits = collectLocalizedStringsFromSchema(stageSchema, document).map(
    (hit) => {
      const path = ['stages', 0, ...hit.path];
      return { ...hit, path, place: textPlaceOf(path) };
    },
  );
  const stageAsProtocol = {
    codebook,
    stages: [document],
    ...(localization !== undefined && { localization }),
  };
  const sections: SectionValidationIssue[] = [];
  const whole: string[] = [];
  const seen = new Set<string>();
  const report = (problemPath: readonly PropertyKey[], problem: string) => {
    const [root, index, ...rest] = problemPath;
    // A node type's label, which the codebook answers for, not the stage.
    if (root !== 'stages' || index !== 0) return;
    const path = pathOf(rest);
    const message = naming(path, problem);
    const key = JSON.stringify([path, message]);
    if (seen.has(key)) return;
    seen.add(key);
    if (path.length === 0) {
      whole.push(message);
      return;
    }
    sections.push({ path, code: 'custom', message, absent: false });
  };
  for (const problem of findDynamicValueProblems(stageAsProtocol, hits)) {
    report(problem.path, problem.message);
  }
  // A dynamic attribute that no text uses never gets here: the save drops it
  // first (`stageAsSaved`).
  for (const problem of findDynamicAttributeProblems(stageAsProtocol, hits)) {
    report(problem.path, problem.message);
  }
  return { sections, whole };
}

/**
 * What the stage's schema says is wrong with it.
 *
 * Each anchored issue is also asked the question the validator's own answer
 * cannot settle: is this a value that is wrong, or a value that is not there?
 * Zod finalises an issue without keeping what it was given, and the code is
 * the same either way — a missing key and a number where a string belongs
 * are both `invalid_type` — so the document it judged is what says which.
 * Read with the same predicate a required field is judged by, so "empty"
 * means one thing in this editor.
 */
function schemaProblems(
  document: SectionDoc,
  { fields, naming }: Readonly<{ fields: StageFormDraft; naming: Naming }>,
): StageProblems {
  const result = stageSchema.safeParse(document);
  if (result.success) return { sections: [], whole: [] };
  const sections: SectionValidationIssue[] = [];
  const whole: string[] = [];
  for (const issue of result.error.issues) {
    const path = pathOf(issue.path);
    if (path.length === 0) {
      // A key the schema does not name is the HOST's to refuse — it answers
      // `INVALID_SHAPE` for a document that is not shaped like its section,
      // and an editor with a second, stricter opinion would refuse a save
      // the protocol would have taken. Everything else anchored at nothing
      // is a rule about the stage's own keys, which the researcher can act
      // on.
      if (issue.code !== 'unrecognized_keys') whole.push(issue.message);
      continue;
    }
    // Said in the schema's words, named by the dynamic attribute and the
    // version: the generic sentence about a setting that the editor does
    // not show would not say which pill to fix.
    if (isInDynamicAttribute(path)) {
      sections.push({
        path,
        code: 'custom',
        message: naming(path, issue.message),
        absent: false,
      });
      continue;
    }
    sections.push({
      path,
      code: issue.code,
      message: issue.message,
      absent: isUnanswered(getValue(fields, path)),
    });
  }
  return { sections, whole };
}

/**
 * Each issue with the innermost protocol object inside the stage that holds
 * it. The stage itself is left out: every problem is inside it, so it says
 * nothing about where one belongs.
 */
function withEnclosingObjects(
  document: SectionDoc,
  issues: readonly SectionValidationIssue[],
): SectionValidationIssue[] {
  const objects = enclosingProtocolObjects(
    stageSchema,
    document,
    issues.map((issue) => issue.path),
  );
  return issues.map((issue, index) => {
    const object = objects[index];
    return object === undefined || object.path.length === 0
      ? issue
      : { ...issue, object };
  });
}

/**
 * What is wrong with the stage, split by whether a section can answer for it:
 * the protocol's rules about its text (`protocolRuleProblems`), then its
 * schema's (`schemaProblems`).
 *
 * A problem anchored at a path belongs to whichever section owns that path,
 * so it can be named by that section — above the form, and in a host's own
 * list of the sections. A problem anchored at NOTHING is about the stage as
 * a whole — a rule relating two of its keys — and no section can be pointed
 * at for it, so it is read out in the schema's own words. Dropping either was
 * the same as accepting it: the save would have gone ahead with nothing on
 * screen to say why it should not have.
 *
 * A problem with one of the stage's dynamic attributes names it, as its pill
 * shows it, and the version that it is about: nothing on the stage editor
 * answers for a dynamic attribute but the pills in its text.
 */
export function stageProblems(
  identity: StageIdentity,
  fields: StageFormDraft,
  {
    localization,
    locale,
    codebook,
    intl,
  }: Readonly<{
    localization: LocalizationDeclaration | undefined;
    /** The language being edited. */
    locale: LocaleTag | undefined;
    codebook: Readonly<Codebook>;
    intl: IntlShape;
  }>,
): StageProblems {
  const document = stageDocument(identity, fields);
  const owner: DynamicAttributeOwner = {
    kind: 'stage',
    place: document,
    codebook,
    localization,
    locale,
  };
  const naming: Naming = (path, message) =>
    isInDynamicAttribute(path)
      ? namedDynamicAttributeProblem(intl, owner, path.slice(1), message)
      : message;
  const rules = protocolRuleProblems(document, {
    codebook,
    localization,
    naming,
  });
  const schema = schemaProblems(document, { fields, naming });
  return {
    sections: withEnclosingObjects(document, [
      ...rules.sections,
      ...schema.sections,
    ]),
    whole: [...rules.whole, ...schema.whole],
  };
}
