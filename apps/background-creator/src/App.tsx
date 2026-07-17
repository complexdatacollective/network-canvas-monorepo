import { useEffect } from 'react';

import { EditorCanvas } from '~/canvas/EditorCanvas';
import { useEditorStore } from '~/state/editorStore';

import { FileDropzone } from './toolbar/FileDropzone';
import { Toolbar } from './toolbar/Toolbar';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function App() {
  const announcement = useEditorStore((s) => s.announcement);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack shortcuts while the user is typing in a field.
      if (isEditableTarget(e.target)) return;
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
          <Toolbar />
        </FileDropzone>
      </main>
      {/* Single polite live region for editor announcements. The trailing space
          toggles with the sequence so identical consecutive messages (e.g. two
          "Undo"s) still register as a DOM change and are re-announced. */}
      <output aria-live="polite" className="sr-only">
        {announcement.message + (announcement.seq % 2 === 1 ? ' ' : '')}
      </output>
    </div>
  );
}

export default App;
