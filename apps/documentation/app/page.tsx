import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to en for now. This is a limitation of static site generation
  // that we need to work around by creating a client component to read the
  // navigator.language and redirect to the appropriate locale.
  redirect('/en');

  return null;
}
