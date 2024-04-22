import { Hono } from 'hono';
import todosRoute from './routes/todos';
import usersRoute from './routes/users';

const app = new Hono();

app.get('/', (c) => c.text('Hello Hono API'));
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

// app.get('/posts/:id', (c) => {
//   const page = c.req.query('page');
//   const id = c.req.param('id');
//   c.header('X-Message', 'Hi!');
//   return c.text(`You want see ${page} of ${id}`);
// });

const routes = app.route('/users', usersRoute).route('/todos', todosRoute);

export default app;
export type AppType = typeof routes;
