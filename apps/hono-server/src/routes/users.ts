import { db } from 'db/index';
import { type UserType, users } from 'db/schema';
import { Hono } from 'hono';

type User = {
  id: string;
  name: string;
  age: string;
};

const app = new Hono().get('/', async (c) => {
  const result = await db.select().from(users);

  return c.json({
    users: result as User[],
  });
});

export default app;
