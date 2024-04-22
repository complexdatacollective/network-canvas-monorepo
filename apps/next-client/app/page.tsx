import { type AppType } from '@codaco/api';
import { hc } from 'hono/client';
import baseUrl from '~/baseUrl';

const client = hc<AppType>(baseUrl);

export default async function Home() {
  const todosRes = await client.todos.$get();
  const { todos } = await todosRes.json();

  const usersRes = await client.users.$get();
  const { users } = await usersRes.json();

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <h1>Todos</h1>

      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>

      <ul>
        {users.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </main>
  );
}
