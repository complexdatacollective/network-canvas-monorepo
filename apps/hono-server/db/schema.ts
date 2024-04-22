import { text, sqliteTable } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default('Botir!'),
  age: text('age').notNull().default('20'),
});

export type UserType = typeof users.$inferSelect;
