import { useEffect, useState } from 'react';

import { EditorCanvas } from '~/canvas/EditorCanvas';
import { useEditorStore } from '~/state/editorStore';
import { hasSeenWelcome } from '~/state/welcomePreference';

import { FileDropzone } from './toolbar/FileDropzone';
import { Toolbar } from './toolbar/Toolbar';
import { WelcomeDialog } from './WelcomeDialog';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

// True when focus is on the canvas surface (the stage or its focusable item
// controls, all under role="application") or on the body — i.e. not on the
// toolbar, the properties popover, a dialog, or a menu. The bare
// Delete/Backspace shortcut only removes the selected item in this context;
// anywhere else the key belongs to whatever control has focus.
function isCanvasFocusContext(target: EventTarget | null): boolean {
  if (target === document.body) return true;
  return (
    target instanceof HTMLElement &&
    target.closest('[role="application"]') !== null
  );
}

function App() {
  // First-run onboarding: shown until the user dismisses it with "Don't show
  // this again" checked (persisted in localStorage). The Information toolbar
  // button re-opens it on demand.
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack shortcuts while the user is typing in a field.
      if (isEditableTarget(e.target)) return;

      // Delete/Backspace (no modifiers) removes the current selection. The item
      // controls already handle this when a shape's own control is focused; this
      // global handler covers the common case where a click-selected shape left
      // focus on the canvas or body. Restricted to canvas focus so the key does
      // not delete the selection while the user is on a toolbar control or in
      // the properties popover. `deleteSelected` no-ops without a selection.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!isCanvasFocusContext(e.target)) return;
        if (!useEditorStore.getState().selection) return;
        e.preventDefault();
        useEditorStore.getState().deleteSelected();
        return;
      }

      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
      } else if (key === 'y') {
        e.preventDefault();
        useEditorStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="bg-background text-text relative flex h-full w-full flex-col">
      <main className="relative min-h-0 flex-1">
        <FileDropzone>
          <EditorCanvas />
          <Toolbar onShowWelcome={() => setWelcomeOpen(true)} />
        </FileDropzone>
      </main>
      <WelcomeDialog open={welcomeOpen} onClose={() => setWelcomeOpen(false)} />
    </div>
  );
}

export default App;
