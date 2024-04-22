import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

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

const app = new Hono()
  .post('/', zValidator('form', schema), (c) => {
    const todo = c.req.valid('form');
    todos.push(todo);
    return c.json({
      message: 'created!',
    });
  })
  .get((c) => {
    return c.json({
      todos,
    });
  });

export default app;
