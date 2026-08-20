import { afterEach, describe, expect, it } from 'vitest';

import { resolveEditorKeyAction } from '../editorShortcuts';

type GestureInit = {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target: EventTarget | null;
};

function gesture(init: GestureInit) {
  return {
    key: init.key,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    shiftKey: init.shiftKey ?? false,
    target: init.target,
  };
}

// A focusable control living inside the canvas stage (role="application").
function canvasTarget(): HTMLElement {
  const stage = document.createElement('div');
  stage.setAttribute('role', 'application');
  const control = document.createElement('button');
  stage.appendChild(control);
  document.body.appendChild(stage);
  return control;
}

// A focusable control inside an overlay portal (dialog, menu, popover) that is
// NOT under the canvas stage — the case the finding is about.
function overlayTarget(): HTMLElement {
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  const button = document.createElement('button');
  dialog.appendChild(button);
  document.body.appendChild(dialog);
  return button;
}

function editableTarget(): HTMLElement {
  const input = document.createElement('textarea');
  document.body.appendChild(input);
  return input;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('resolveEditorKeyAction — history shortcuts', () => {
  it('undoes on Ctrl+Z when focus is on the canvas', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'z', ctrlKey: true, target: canvasTarget() }),
      ),
    ).toBe('undo');
  });

  it('undoes on Cmd+Z when focus is on the canvas', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'z', metaKey: true, target: canvasTarget() }),
      ),
    ).toBe('undo');
  });

  it('redoes on Ctrl+Shift+Z and on Ctrl+Y', () => {
    expect(
      resolveEditorKeyAction(
        gesture({
          key: 'z',
          ctrlKey: true,
          shiftKey: true,
          target: canvasTarget(),
        }),
      ),
    ).toBe('redo');
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'y', ctrlKey: true, target: canvasTarget() }),
      ),
    ).toBe('redo');
  });

  it('still undoes when focus is on the document body', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'z', ctrlKey: true, target: document.body }),
      ),
    ).toBe('undo');
  });

  it('ignores Ctrl+Z while a dialog or menu holds focus', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'z', ctrlKey: true, target: overlayTarget() }),
      ),
    ).toBeNull();
  });

  it('ignores Ctrl+Y while a dialog or menu holds focus', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'y', ctrlKey: true, target: overlayTarget() }),
      ),
    ).toBeNull();
  });

  it('ignores Ctrl+Z while typing in a text field', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'z', ctrlKey: true, target: editableTarget() }),
      ),
    ).toBeNull();
  });

  it('ignores a bare Z with no modifier', () => {
    expect(
      resolveEditorKeyAction(gesture({ key: 'z', target: canvasTarget() })),
    ).toBeNull();
  });
});

describe('resolveEditorKeyAction — delete shortcut', () => {
  it('deletes on Delete/Backspace when focus is on the canvas', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'Delete', target: canvasTarget() }),
      ),
    ).toBe('delete');
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'Backspace', target: canvasTarget() }),
      ),
    ).toBe('delete');
  });

  it('ignores Delete while a dialog or menu holds focus', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'Delete', target: overlayTarget() }),
      ),
    ).toBeNull();
  });

  it('ignores Delete when combined with a modifier', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'Delete', metaKey: true, target: canvasTarget() }),
      ),
    ).toBeNull();
  });

  it('ignores Backspace while typing in a text field', () => {
    expect(
      resolveEditorKeyAction(
        gesture({ key: 'Backspace', target: editableTarget() }),
      ),
    ).toBeNull();
  });
});
