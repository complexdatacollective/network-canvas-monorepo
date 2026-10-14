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
  type DynamicValues,
  type DynamicValueSite,
  type DynamicValueSiteContext,
  dynamicValueContextFor,
} from '@codaco/protocol-validation';

import { EditedRowContext } from '../form/editedRow.ts';
import {
  StageEditorFormContext,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { dynamicValueNamesUsedIn } from './dynamicValueCatalog.ts';

/** Where a stage's bindings live in the stage document. */
const DYNAMIC_VALUES_PATH = 'dynamicValues';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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
 * True inside a form that describes an entity of its own rather than the
 * stage's subject (a Network Composer connection type's form). No stage
 * binding can name which entity that is, so its captions show what any stage
 * text can: the participant and today's date.
 */
export const FormOfItsOwnContext = createContext(false);

/**
 * Registers the stage's bindings with the stage form, so a binding a text
 * field creates is among what a save writes. Mounted once per stage editor.
 * Returns what marks the field's place in the page: the bindings have no
 * control of their own, since the text that uses them edits them.
 */
export function useDynamicValuesRegistration() {
  const { readOnly } = useStageEditorForm();
  const { containerProps } = useField({
    name: DYNAMIC_VALUES_PATH,
    disabled: readOnly,
  });
  return {
    'data-field-name': containerProps['data-field-name'],
    'data-field-path': containerProps['data-field-path'],
    'data-field-form': containerProps['data-field-form'],
  };
}

export type DynamicValueSiteState = Readonly<{
  context: DynamicValueSiteContext;
  bindings: DynamicValues;
  /** Writes the stage's bindings, on the stage form behind any dialog. */
  setBindings: (bindings: DynamicValues) => void;
  /**
   * The value names the stage's text uses right now, including the row a
   * dialog has open, which the stage does not hold until it is saved.
   */
  namesInUse: () => ReadonlySet<string>;
}>;

/**
 * What text at one place in the open stage can show: its context (the roles
 * on screen there and their attributes) and the stage's bindings.
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
  const ownSubject = useContext(FormOfItsOwnContext);
  const site: DynamicValueSite =
    requested === 'formField' && ownSubject ? 'stageText' : requested;
  const { identity, storeApi, liveDraft } = useStageEditorForm();
  const { codebook } = useProtocolContext();
  const row = useContext(EditedRowContext);
  const subject = useStageValue('subject');
  const rawBindings = useStageValue(DYNAMIC_VALUES_PATH);
  const listRoot =
    site === 'formField' && row !== null ? row.listPath[0] : undefined;
  const listRootValue = useStageValue(listRoot);

  const bindings = useMemo(
    (): DynamicValues =>
      isRecord(rawBindings) ? (rawBindings as DynamicValues) : {},
    [rawBindings],
  );

  // Worked out on every render rather than memoized: the dialog's row is
  // read live (`row.read`), and which field it asks about can change without
  // anything a dependency list could see.
  const context = (() => {
    let stage: Record<string, unknown> = { type: identity.type, subject };
    let sitePath: (string | number)[] = [];
    if (site === 'formField' && row !== null && listRoot !== undefined) {
      const listPath = row.listPath.map(segment);
      let list: unknown = listRootValue;
      for (const key of listPath.slice(1)) {
        list =
          isRecord(list) || Array.isArray(list)
            ? (list as Record<string | number, unknown>)[key]
            : undefined;
      }
      const fields = Array.isArray(list) ? [...list] : [];
      const edited = row.read();
      const at = fields.findIndex(
        (field) =>
          isRecord(field) && edited.id !== undefined && field.id === edited.id,
      );
      const index = at === -1 ? fields.length : at;
      fields[index] = edited;
      stage = {
        ...stage,
        [listRoot]: withValueAt(listRootValue, listPath.slice(1), fields),
      };
      sitePath = [...listPath, index, ...fieldPath];
    }
    return dynamicValueContextFor({ codebook, stage, sitePath, site });
  })();

  const setBindings = useCallback(
    (next: DynamicValues) => {
      storeApi
        .getState()
        .setFieldValue(
          DYNAMIC_VALUES_PATH,
          Object.keys(next).length === 0 ? undefined : next,
        );
    },
    [storeApi],
  );

  const namesInUse = useCallback((): ReadonlySet<string> => {
    const { [DYNAMIC_VALUES_PATH]: _bindings, ...text } = liveDraft();
    const names = dynamicValueNamesUsedIn(text);
    return row === null ? names : dynamicValueNamesUsedIn(row.read(), names);
  }, [liveDraft, row]);

  return { context, bindings, setBindings, namesInUse };
}

/**
 * Called by a row dialog with whether it is open. A value inserted there binds
 * at once, on the stage behind the dialog, but the row reaches the stage only
 * if the dialog saves. So when the dialog closes, saved or cancelled, the
 * stage keeps only the bindings its text uses: those of the stage itself, and
 * of the row an enclosing dialog has open.
 */
export function useReleaseRowBindings(open: boolean) {
  const stageForm = useContext(StageEditorFormContext);
  const enclosingRow = useContext(EditedRowContext);
  const wasOpen = useRef(open);

  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed || stageForm === null || stageForm.readOnly) return;
    const { [DYNAMIC_VALUES_PATH]: bindings, ...text } = stageForm.liveDraft();
    if (!isRecord(bindings)) return;
    const inUse = dynamicValueNamesUsedIn(text);
    if (enclosingRow !== null) {
      dynamicValueNamesUsedIn(enclosingRow.read(), inUse);
    }
    const kept = Object.entries(bindings).filter(([name]) => inUse.has(name));
    if (kept.length === Object.keys(bindings).length) return;
    stageForm.storeApi
      .getState()
      .setFieldValue(
        DYNAMIC_VALUES_PATH,
        kept.length === 0 ? undefined : Object.fromEntries(kept),
      );
  }, [open, stageForm, enclosingRow]);
}
