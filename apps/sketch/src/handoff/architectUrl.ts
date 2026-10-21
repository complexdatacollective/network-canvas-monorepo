// Where "Open in Architect" goes. Override with VITE_ARCHITECT_URL (for
// example http://localhost:5173 when running Architect locally).
export const ARCHITECT_URL: string =
  import.meta.env.VITE_ARCHITECT_URL ?? 'https://architect.networkcanvas.dev';

export const IMPORT_PATH = '/import-from-sketch';
