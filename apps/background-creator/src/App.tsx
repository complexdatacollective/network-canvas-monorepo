import { useEffect, useState } from 'react';

import { EditorCanvas } from '~/canvas/EditorCanvas';
import { resolveEditorKeyAction } from '~/keyboard/editorShortcuts';
import { registerBeforeUnloadGuard } from '~/state/beforeUnloadGuard';
import { useEditorStore } from '~/state/editorStore';
import { hasSeenWelcome } from '~/state/welcomePreference';

import { FileDropzone } from './toolbar/FileDropzone';
import { Toolbar } from './toolbar/Toolbar';
import { WelcomeDialog } from './WelcomeDialog';

function App() {
  // First-run onboarding: shown until the user dismisses it with "Don't show
  // this again" checked (persisted in localStorage). The Information toolbar
  // button re-opens it on demand.
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = resolveEditorKeyAction(e);
      if (!action) return;
      const store = useEditorStore.getState();
      // Pointer-up owns the completion of an active move/resize. Let it finish
      // before accepting history or deletion shortcuts so captured gesture
      // state cannot overwrite a concurrent command.
      if (store.gestureSnapshot) return;
      if (action === 'delete') {
        // `deleteSelected` no-ops without a selection, but skip the
        // preventDefault too so the key stays available to the browser then.
        if (!store.selection) return;
        e.preventDefault();
        store.deleteSelected();
        return;
      }
      e.preventDefault();
      if (action === 'undo') store.undo();
      else store.redo();
    };
    const removeBeforeUnloadGuard = registerBeforeUnloadGuard(() =>
      useEditorStore.getState().isDirty(),
    );
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      removeBeforeUnloadGuard();
    };
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
