// Imported from script, not from tailwind.css, so Vite resolves the font
// files against @codaco/tailwind-config's own dependencies.
import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Sketch could not find its root element.');

// No StrictMode: its doubled effects would start every generation job twice
// in development, and each job spends real model budget.
createRoot(root).render(<App />);
