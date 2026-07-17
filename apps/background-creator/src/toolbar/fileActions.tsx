import type { ReactElement, ReactNode } from 'react';

import type { DialogContextType } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import TextAreaField from '@codaco/fresco-ui/form/fields/TextArea';
import { isSvgFile, readSvgFile, SvgFileTooLargeError } from '~/files/open';
import {
  PYTHON_FILETYPE,
  R_FILETYPE,
  saveBlob,
  SVG_FILETYPE,
} from '~/files/save';
import { generatePythonScript } from '~/scripts/python';
import { generateRScript } from '~/scripts/r';
import { useEditorStore } from '~/state/editorStore';
import { DocumentParseError, parseDocument } from '~/svg/parse';
import { serializeDocument } from '~/svg/serialize';

import { evaluateScriptExport } from './exportGate';
import { documentFilename } from './filename';

// Only the two dialog helpers the flows use; passed in from the component that
// owns the DialogProvider context.
type Dialogs = Pick<DialogContextType, 'openDialog' | 'confirm'>;

type NewTemplateChoice = 'blank' | 'quadrants' | 'concentric';
type ScriptLanguage = 'python' | 'r';

const REPLACE_TITLE = 'Replace the current design?';
const REPLACE_DESCRIPTION =
  'The current background and its undo history will be cleared. Download it first if you want to keep it.';

async function confirmReplace(dialogs: Dialogs): Promise<boolean> {
  const result = await dialogs.confirm({
    title: REPLACE_TITLE,
    description: REPLACE_DESCRIPTION,
    confirmLabel: 'Replace',
    cancelLabel: 'Keep editing',
    intent: 'warning',
    onConfirm: () => {},
  });
  return result === true;
}

async function acknowledge(
  dialogs: Dialogs,
  title: string,
  description: string,
  children?: ReactNode,
): Promise<void> {
  await dialogs.openDialog({
    type: 'acknowledge',
    title,
    description,
    intent: 'warning',
    children,
    actions: { primary: { label: 'OK', value: true } },
  });
}

export async function newDocumentFlow(
  dialogs: Dialogs,
  template: NewTemplateChoice,
): Promise<void> {
  if (!(await confirmReplace(dialogs))) return;
  useEditorStore.getState().newDocument(template);
}

// Parses a chosen/dropped file and loads it, surfacing a readable dialog for
// each failure. Shared by the File menu's "Open SVG…" and the drag-drop overlay.
async function loadSvgFile(dialogs: Dialogs, file: File): Promise<void> {
  const store = useEditorStore.getState();

  if (!isSvgFile(file)) {
    await acknowledge(
      dialogs,
      'Not a Background Creator file',
      'That file is not an SVG. Choose a background SVG created with this tool.',
    );
    return;
  }

  let svgText: string;
  try {
    svgText = await readSvgFile(file);
  } catch (error) {
    const description =
      error instanceof SvgFileTooLargeError
        ? 'That file is too large to be a background SVG.'
        : 'The file could not be read.';
    await acknowledge(dialogs, 'Could not read file', description);
    return;
  }

  try {
    const doc = parseDocument(svgText);
    store.loadDocument(doc);
  } catch (error) {
    if (error instanceof DocumentParseError) {
      const title =
        error.reason === 'not-background-creator'
          ? 'Not a Background Creator file'
          : 'Could not read file';
      await acknowledge(dialogs, title, error.message);
      return;
    }
    await acknowledge(
      dialogs,
      'Could not read file',
      'The file could not be opened.',
    );
  }
}

function pickSvgFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.style.display = 'none';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

export async function openSvgFlow(dialogs: Dialogs): Promise<void> {
  if (!(await confirmReplace(dialogs))) return;
  const file = await pickSvgFile();
  if (!file) return;
  await loadSvgFile(dialogs, file);
}

export async function openDroppedFileFlow(
  dialogs: Dialogs,
  file: File,
): Promise<void> {
  if (!(await confirmReplace(dialogs))) return;
  await loadSvgFile(dialogs, file);
}

export async function downloadSvgFlow(): Promise<void> {
  const store = useEditorStore.getState();
  const { doc } = store;
  const blob = new Blob([serializeDocument(doc)], {
    type: SVG_FILETYPE.mimeType,
  });
  const name = documentFilename(
    doc.title,
    SVG_FILETYPE.extension,
    'background',
  );
  const result = await saveBlob(blob, name, SVG_FILETYPE);
  if (result.saved) store.announce(`Downloaded ${name}`);
}

function ScriptOptionsFields(): ReactElement {
  return (
    <>
      <Field
        name="layoutVariable"
        label="Layout variable"
        hint="The variable holding each node’s position, as named in your protocol."
        component={InputField}
        initialValue="location"
        required
        autoFocus
      />
      <Field
        name="outputVariable"
        label="Output variable"
        hint="A new column with this name receives each node’s zone label."
        component={InputField}
        initialValue="zone"
        required
      />
    </>
  );
}

function trimmedOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : fallback;
}

async function collectScriptOptions(
  dialogs: Dialogs,
): Promise<{ layoutVariable: string; outputVariable: string } | null> {
  const result = await dialogs.openDialog({
    type: 'form',
    title: 'Export zone-assignment script',
    description:
      'Name the layout variable to read positions from and the variable to write zone labels to.',
    submitLabel: 'Export',
    children: <ScriptOptionsFields />,
  });
  if (!result) return null;
  return {
    layoutVariable: trimmedOr(result.layoutVariable, 'location'),
    outputVariable: trimmedOr(result.outputVariable, 'zone'),
  };
}

export async function exportScriptFlow(
  dialogs: Dialogs,
  language: ScriptLanguage,
): Promise<void> {
  const store = useEditorStore.getState();
  const { doc } = store;

  const gate = evaluateScriptExport(doc);
  if (!gate.ok) {
    if (gate.reason === 'no-zones') {
      await acknowledge(
        dialogs,
        'Add a zone first',
        'Zone-assignment scripts need at least one zone. Draw a zone with a zone tool, give it a label, then export again.',
      );
      return;
    }
    await acknowledge(
      dialogs,
      'Fix zone labels first',
      'Every zone label becomes a value of the assigned variable, so labels must all be present and unique:',
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {gate.problems.map((problem) => (
          <li key={problem}>{problem}</li>
        ))}
      </ul>,
    );
    return;
  }

  const options = await collectScriptOptions(dialogs);
  if (!options) return;

  const source =
    language === 'python'
      ? generatePythonScript(doc, options)
      : generateRScript(doc, options);
  const filetype = language === 'python' ? PYTHON_FILETYPE : R_FILETYPE;
  const name = language === 'python' ? 'assign_zones.py' : 'assign_zones.R';
  const blob = new Blob([source], { type: filetype.mimeType });
  const result = await saveBlob(blob, name, filetype);
  if (result.saved) store.announce(`Exported ${name}`);
}

function DetailsFields({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactElement {
  return (
    <>
      <Field
        name="title"
        label="Title"
        hint="Names the background for screen readers and in the saved SVG."
        component={InputField}
        initialValue={title}
        required
        autoFocus
      />
      <Field
        name="description"
        label="Description"
        hint="A short description of what the background shows."
        component={TextAreaField}
        initialValue={description}
      />
    </>
  );
}

export async function documentDetailsFlow(dialogs: Dialogs): Promise<void> {
  const store = useEditorStore.getState();
  const { doc } = store;
  const result = await dialogs.openDialog({
    type: 'form',
    title: 'Document details',
    description: 'These describe the background for accessibility.',
    submitLabel: 'Save',
    children: <DetailsFields title={doc.title} description={doc.description} />,
  });
  if (!result) return;

  const current = useEditorStore.getState().doc;
  const title = typeof result.title === 'string' ? result.title : current.title;
  const description =
    typeof result.description === 'string'
      ? result.description
      : current.description;
  store.commitDoc({ ...current, title, description });
  store.announce('Document details updated');
}
