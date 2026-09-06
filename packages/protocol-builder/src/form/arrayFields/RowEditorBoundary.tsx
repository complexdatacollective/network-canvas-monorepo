import { Component, type ReactNode } from 'react';

import { createMessageError, defineMessage } from '@codaco/app-i18n/messages';
import FormErrors from '@codaco/fresco-ui/form/FormErrors';

/**
 * Said when the fields a family renders inside a row dialog cannot be shown.
 *
 * Whole, and about what the researcher can do: the editor is the interface's
 * own code, so nothing in their protocol caused this and nothing they type
 * will fix it. Naming that is what stops them hunting for a mistake they did
 * not make.
 *
 * Encoded rather than formatted, because a class component has no hook to read
 * a formatter with — and it does not need one: `FormErrors` decodes what it is
 * handed, so the sentence is resolved in the reader's language where it is
 * rendered.
 */
const editorFailedMessage = defineMessage({
  id: 'protocolBuilder.arrayField.rowEditorFailed',
  defaultMessage:
    'This editor could not be shown, so there is nothing to fill in here. Close it and try again. If it keeps happening, the problem is in this interface’s editor rather than in your protocol.',
  description:
    'Shown in place of the fields of a row-editing dialog when the interface’s own editor code threw while rendering. Says the fault is in the software rather than in anything the researcher wrote, so they do not go looking for a mistake in their protocol.',
});

const EDITOR_FAILED = createMessageError(editorFailedMessage);

type RowEditorBoundaryProps = Readonly<{ children: ReactNode }>;

type RowEditorBoundaryState = Readonly<{ failed: boolean }>;

/**
 * Keeps a family's row editor from taking the stage editor with it.
 *
 * Every list in every interface mounts fields this package did not write —
 * a prompt's variable picker, a content block's resource picker — inside the
 * row dialog. Without a boundary, one of them throwing unmounts the whole
 * React tree: the researcher loses the dialog, the stage editor around it, and
 * every unsaved change in both, and is left on a blank page with no account of
 * why. Caught here, the shell and the rest of the stage are still there, the
 * other sections still hold what was typed in them, and the dialog says what
 * happened where a form-level problem is already reported.
 *
 * Deliberately not a retry: the same fields would be mounted again with the
 * same values and throw again. Closing the dialog is the recovery, and the
 * dialog's own close is still there to do it — which is the point of catching
 * INSIDE the dialog rather than around it.
 *
 * A class because that is the only thing React lets catch a render error; it
 * is remounted whenever the dialog opens on a different row, so a row whose
 * editor failed does not poison the next one.
 */
export default class RowEditorBoundary extends Component<
  RowEditorBoundaryProps,
  RowEditorBoundaryState
> {
  state: RowEditorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RowEditorBoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return <FormErrors errors={[EDITOR_FAILED]} />;
    return this.props.children;
  }
}
