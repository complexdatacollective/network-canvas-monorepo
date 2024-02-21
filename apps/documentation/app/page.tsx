import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/en/desktop'); // temporarily redirecting to desktop docs
}
