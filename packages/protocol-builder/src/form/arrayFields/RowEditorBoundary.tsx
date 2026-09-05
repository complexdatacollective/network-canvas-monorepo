import { Component, type ReactNode } from 'react';

import FormErrors from '@codaco/fresco-ui/form/FormErrors';

/**
 * Said when the fields a family renders inside a row dialog cannot be shown.
 *
 * Whole, and about what the researcher can do: the editor is the interface's
 * own code, so nothing in their protocol caused this and nothing they type
 * will fix it. Naming that is what stops them hunting for a mistake they did
 * not make.
 */
const EDITOR_FAILED =
  'This editor could not be shown, so there is nothing to fill in here. Close it and try again. If it keeps happening, the problem is in this interface’s editor rather than in your protocol.';

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
