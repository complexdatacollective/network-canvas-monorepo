type StudioEditorSessionCloser = () => Promise<void>;

const sessionClosers = new Set<StudioEditorSessionCloser>();

export function registerStudioEditorSession(
  close: StudioEditorSessionCloser,
): () => void {
  sessionClosers.add(close);
  return () => sessionClosers.delete(close);
}

export async function closeStudioEditorSessions(): Promise<void> {
  await Promise.allSettled([...sessionClosers].map((close) => close()));
}
