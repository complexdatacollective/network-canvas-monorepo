import { redirect } from 'next/navigation';

export default function RootPage() {
  // redirecting to the default locale,
  // see next-intl docs: https://next-intl-docs.vercel.app/docs/routing/middleware#usage-without-middleware-static-export
  redirect('/en');
}
