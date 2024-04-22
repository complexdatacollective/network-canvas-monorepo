import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { db } from 'db/index';
import { users } from 'db/schema';

const app = new Hono();

app.get('/', async (c) => {
  const result = await db.select().from(users);
  return c.json({
    users: result,
  });
});

app.get('/posts/:id', (c) => {
  const page = c.req.query('page');
  const id = c.req.param('id');
  c.header('X-Message', 'Hi!');
  return c.text(`You want see ${page} of ${id}`);
});

const schema = z.object({
  id: z.string(),
  title: z.string(),
});

type Todo = z.infer<typeof schema>;

const todos: Todo[] = [
  {
    id: '1',
    title: 'Buy milk',
  },
  {
    id: '2',
    title: 'Buy bread',
  },
];

const route = app
  .post('/todo', zValidator('form', schema), (c) => {
    const todo = c.req.valid('form');
    todos.push(todo);
    return c.json({
      message: 'created!',
    });
  })
  .get(async (c) => {
    const result = await db.select().from(users);
    return c.json({
      todos,
      users: result,
    });
  });

export type AppType = typeof route;

export default app;
