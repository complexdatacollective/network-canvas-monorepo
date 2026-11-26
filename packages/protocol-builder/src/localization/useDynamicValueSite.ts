import { isEqual } from 'es-toolkit';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { useField } from '@codaco/fresco-ui/form/hooks/useField';
import {
  type Codebook,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  dynamicValueContextFor,
  dynamicValueRolesAt,
  resolveSubjectValue,
  stageDynamicValueContext,
} from '@codaco/protocol-validation';

import { EditedRowContext } from '../form/editedRow.ts';
import {
  StageEditorFormContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { stageFieldsOf } from '../stageDocument.ts';
import {
  useProtocolContext,
  useProtocolReading,
} from '../state/protocolContext.ts';
import { conditionIdsNamedBy } from './conditionText.ts';
import { dynamicValueNamesUsedIn } from './dynamicValueCatalog.ts';

/** Where a stage's conditions live in the stage document. */
const CONDITIONS_PATH = 'conditions';

/**
 * The conditions text chooses its wording by, where the text can declare
 * them: those declared so far, how to write them, and what their rules may
 * be about. A condition is kept only as stored here; one being written is
 * the business of the dialog that writes it.
 */
export type DynamicValueConditions = Readonly<{
  values: Readonly<Record<string, unknown>>;
  set: (conditions: Readonly<Record<string, unknown>>) => void;
  codebook: Readonly<Codebook> | undefined;
  /**
   * The node or edge type every entity the text is shown with is of, or
   * undefined where it is shown with none (rules are then about the
   * participant alone).
   */
  subject: Readonly<{ entity: 'node' | 'edge'; type: string }> | undefined;
  /** Whether a rule may compare one of the participant's attributes. */
  allowEgoRules: boolean;
}>;

const subjectOf = (
  value: unknown,
): DynamicValueConditions['subject'] | undefined => {
  const subject = resolveSubjectValue(value);
  return subject !== undefined &&
    subject.entity !== 'ego' &&
    subject.type !== ''
    ? subject
    : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The ids of the conditions the text in `value` names. */
const conditionIdsUsedIn = (value: unknown): Set<string> =>
  conditionIdsNamedBy(dynamicValueNamesUsedIn(value));

const segment = (key: string): string | number =>
  /^\d+$/.test(key) ? Number(key) : key;

/** `container` with `value` written at `path`, copying what it passes through. */
const withValueAt = (
  container: unknown,
  path: readonly (string | number)[],
  value: unknown,
): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === 'number') {
    const list = Array.isArray(container) ? [...container] : [];
    list[head] = withValueAt(list[head], rest, value);
    return list;
  }
  const record = isRecord(container) ? { ...container } : {};
  record[head] = withValueAt(record[head], rest, value);
  return record;
};

/**
 * Inside a form that describes an entity of its own rather than the stage's
 * subject (a Network Composer connection type's form), that entity. No stage
 * text can name its type's attributes unambiguously, so its captions show what needs none: the
 * participant, today's date and, for an edge, the labels of the two nodes it
 * joins.
 */
export const FormOfItsOwnContext = createContext<'node' | 'edge' | null>(null);

/**
 * Registers the stage's conditions with the stage form, so a condition a
 * text field declares is among what a save writes. Mounted once per stage
 * editor. Returns what marks the field's place in the page: the conditions
 * have no control of their own, since the "If" a text holds edits them.
 */
export function useConditionsRegistration() {
  return useStageValueRegistration(CONDITIONS_PATH);
}

function useStageValueRegistration(name: string) {
  const { readOnly } = useStageEditorForm();
  const { containerProps } = useField({ name, disabled: readOnly });
  return {
    'data-field-name': containerProps['data-field-name'],
    'data-field-path': containerProps['data-field-path'],
    'data-field-form': containerProps['data-field-form'],
  };
}

export type DynamicValueSiteState = Readonly<{
  context: DynamicValueSiteContext;
  /** The stage's conditions, which any of its text can test. */
  conditions: DynamicValueConditions;
  /**
   * Whether the whole protocol has been read. Until it has, the codebook may
   * lack attributes that the text shows, and they would read as attributes
   * that no longer exist.
   */
  codebookRead: boolean;
}>;

/**
 * What text at one place in the open stage can show: its context (the roles
 * on screen there and their attributes) and the stage's conditions.
 *
 * A form field's caption sits in a row dialog, whose row may not be in the
 * stage yet: the row is placed where it is (found by its id) or at the end,
 * so the fields before it are the ones the participant has answered.
 * `fieldPath` is where the caption sits in that row.
 */
export function useDynamicValueSite(
  requested: DynamicValueSite,
  fieldPath: readonly string[] = [],
): DynamicValueSiteState {
  const ownEntity = useContext(FormOfItsOwnContext);
  const ownForm = requested === 'formField' && ownEntity !== null;
  // A form of its own is not among the stage's rows, so its captions are
  // placed as text about the stage, with the roles its form adds.
  const site: DynamicValueSite = ownForm ? 'stageText' : requested;
  const { identity, storeApi } = useStageEditorForm();
  const { codebook } = useProtocolContext();
  const codebookRead = useProtocolReading().status === 'read';
  const row = useContext(EditedRowContext);
  const subject = useStageValue('subject');
  // A bin stage's prompt shows the node it is placing only in select mode.
  const behaviours = useStageValue('behaviours');
  const rawConditions = useStageValue(CONDITIONS_PATH);
  const listRoot =
    site === 'formField' && row !== null ? row.listPath[0] : undefined;
  const listRootValue = useStageValue(listRoot);

  // Worked out on every render rather than memoized: the dialog's row is
  // read live (`row.read`), and which field it asks about can change without
  // anything a dependency list could see.
  const context = (() => {
    let stage: Record<string, unknown> = {
      type: identity.type,
      subject,
      behaviours,
      conditions: rawConditions,
    };
    let sitePath: (string | number)[] = [];
    if (site === 'formField' && row !== null && listRoot !== undefined) {
      const listPath = row.listPath.map(segment);
      let list: unknown = listRootValue;
      for (const key of listPath.slice(1)) {
        list =
          isRecord(list) || Array.isArray(list)
            ? Reflect.get(list, key)
            : undefined;
      }
      const fields = Array.isArray(list) ? [...list] : [];
      const edited = row.read();
      const at = fields.findIndex(
        (field) => isRecord(field) && field.id === edited.id,
      );
      const index = at === -1 ? fields.length : at;
      fields[index] = edited;
      stage = {
        ...stage,
        [listRoot]: withValueAt(listRootValue, listPath.slice(1), fields),
      };
      sitePath = [...listPath, index, ...fieldPath];
    }
    const atSite = dynamicValueContextFor({ codebook, stage, sitePath, site });
    if (!ownForm || ownEntity === null) return atSite;
    return {
      ...atSite,
      roles: dynamicValueRolesAt({ type: identity.type }, 'formField', {
        entity: ownEntity,
        isStageSubject: false,
      }),
    };
  })();

  const setConditions = useCallback(
    (next: Readonly<Record<string, unknown>>) => {
      storeApi
        .getState()
        .setFieldValue(
          CONDITIONS_PATH,
          Object.keys(next).length === 0 ? undefined : next,
        );
    },
    [storeApi],
  );
  const conditions = useMemo(
    (): DynamicValueConditions => ({
      values: isRecord(rawConditions) ? rawConditions : {},
      set: setConditions,
      codebook,
      // A form of its own describes its own entity, not the stage's.
      subject: ownForm ? undefined : subjectOf(subject),
      allowEgoRules: true,
    }),
    [rawConditions, setConditions, codebook, ownForm, subject],
  );

  return { context, conditions, codebookRead };
}

/**
 * What any text on the open stage can show, for a place that shows text
 * rather than editing it (a row's collapsed preview): every value its
 * prompts or its form's fields could show, so each value in its text reads
 * as the value it stands for, and the stage's conditions and the codebook,
 * so a value it cannot show is still called what it was.
 */
export function useStageDynamicValues(): Readonly<{
  context: DynamicValueSiteContext;
  conditions: Omit<DynamicValueConditions, 'set'>;
}> {
  const { identity } = useStageEditorForm();
  const { codebook } = useProtocolContext();
  const subject = useStageValue('subject');
  const behaviours = useStageValue('behaviours');
  const rawConditions = useStageValue(CONDITIONS_PATH);
  return useMemo(
    () => ({
      context: stageDynamicValueContext({
        codebook,
        stage: {
          type: identity.type,
          subject,
          behaviours,
          conditions: rawConditions,
        },
      }),
      conditions: {
        values: isRecord(rawConditions) ? rawConditions : {},
        codebook,
        subject: subjectOf(subject),
        allowEgoRules: true,
      },
    }),
    [identity.type, subject, behaviours, codebook, rawConditions],
  );
}

/**
 * Called by a row dialog with whether it is open. The rules an "If" tests are
 * kept on the stage, and editing them in the dialog changes them there at
 * once. A dialog that closes without saving puts the stage's conditions back
 * exactly as they were when it opened: rules it edited go back to what they
 * were, and a condition an "If" in it declared goes. The dialog calls the
 * function this answers with when it saves.
 *
 * A condition left unnamed by a saved row (an "If" removed from it) stays
 * with the stage until the stage is saved (`withoutUnusedConditions`).
 */
export function useReleaseRowConditions(open: boolean): () => void {
  const stageForm = useContext(StageEditorFormContext);
  const wasOpen = useRef(false);
  const saved = useRef(false);
  const conditionsAtOpen = useRef<
    Readonly<Record<string, unknown>> | undefined
  >(undefined);

  useEffect(() => {
    const opened = !wasOpen.current && open;
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (stageForm === null || stageForm.readOnly) return;
    if (opened) {
      saved.current = false;
      const held = stageFieldsOf(stageForm.liveDraft())[CONDITIONS_PATH];
      conditionsAtOpen.current = isRecord(held) ? held : undefined;
      return;
    }
    if (!closed || saved.current) return;
    const now = stageFieldsOf(stageForm.liveDraft())[CONDITIONS_PATH];
    if (isEqual(conditionsAtOpen.current, now)) return;
    stageForm.storeApi
      .getState()
      .setFieldValue(CONDITIONS_PATH, conditionsAtOpen.current);
  }, [open, stageForm]);

  return useCallback(() => {
    saved.current = true;
  }, []);
}

/**
 * `stage` as a save writes it: without the conditions no text in it names.
 * A condition goes once its last use has: a row or section deleted, an "If"
 * removed, an "If" written into a row that never reached the stage. Only a
 * condition the stage already held unnamed when last saved is left alone, as
 * the editor was given it.
 */
export function withoutUnusedConditions<
  T extends Readonly<Record<string, unknown>>,
>(stage: T, lastSaved: Readonly<Record<string, unknown>>): T {
  const { [CONDITIONS_PATH]: conditions, ...text } = stage;
  if (!isRecord(conditions)) return stage;
  const { [CONDITIONS_PATH]: savedConditions, ...savedText } = lastSaved;
  const named = conditionIdsUsedIn(text);
  const namedWhenSaved = conditionIdsUsedIn(savedText);
  const kept = Object.entries(conditions).filter(
    ([id]) =>
      named.has(id) ||
      (isRecord(savedConditions) &&
        Object.hasOwn(savedConditions, id) &&
        !namedWhenSaved.has(id)),
  );
  if (kept.length === Object.keys(conditions).length) return stage;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `text` is `stage` minus its conditions, so with them rebuilt it keeps T's shape
  return {
    ...text,
    ...(kept.length > 0 && { [CONDITIONS_PATH]: Object.fromEntries(kept) }),
  } as T;
}
