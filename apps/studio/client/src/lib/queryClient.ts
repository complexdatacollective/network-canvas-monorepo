import { QueryClient } from '@tanstack/react-query';

// The application's one cache. The router carries this exact object in its
// context (§6.1) and `QueryClientProvider` hands the same object to
// components, because they act on each other's entries: a guard's
// `fetchQuery` reads what a component's `queryClient.clear()` removed. Two
// clients would leave the session cached behind a sign-out.
//
// Tests build their own router and provider around one client of their own;
// `createAppRouter` takes it as an argument for exactly that reason.
export const queryClient = new QueryClient();
