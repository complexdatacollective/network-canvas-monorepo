import '@codaco/tailwind-config/fonts/inclusive-sans.css';
import '@codaco/tailwind-config/fonts/nunito.css';
import '@codaco/tailwind-config/fonts/readex-pro.css';
import NotFoundContent from '~/components/NotFound/NotFoundContent';
import { ThemeProvider } from '~/components/Providers/theme-provider';

export default function NotFound() {
  return (
    <html lang="en">
      <ThemeProvider
        attribute="data-theme"
        enableSystem
        enableColorScheme
        storageKey="nc-docs-site"
      >
        <body className="flex h-screen items-center justify-center">
          <NotFoundContent />
        </body>
      </ThemeProvider>
    </html>
  );
}
