import { type AppType } from '@codaco/api';
import { hc } from 'hono/client';
import baseUrl from '~/baseUrl';

const client = hc<AppType>(baseUrl);

export default async function Home() {
  const res = await client.todo.$get();
  const data = await res.json();

  const homeRes = await fetch(baseUrl);
  const postsRes = await fetch(`${baseUrl}/posts/12?page=1`);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1>Todos</h1>

      <ul>
        {data.todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>

      {homeRes.ok ? (
        <h1 className="text-center text-4xl font-bold">
          {await homeRes.text()}
        </h1>
      ) : (
        <h1 className="text-center text-4xl font-bold">Loading...</h1>
      )}
      {postsRes.ok ? (
        <h1 className="text-center text-4xl font-bold">
          {await postsRes.text()}
        </h1>
      ) : (
        <h1 className="text-center text-4xl font-bold">Loading...</h1>
      )}
    </main>
  );
}
