import { z } from 'zod';

/** Every emitted pagination token is safe to pass back through a query string. */
export const PaginationCursorSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$(?![\s\S])/);

/** A continuation flag and cursor are one state, never independent fields. */
export function paginatedPageSchema<Item extends z.ZodType>(
  item: Item,
  cursor: z.ZodString,
) {
  return z
    .strictObject({
      data: z
        .array(item)
        .max(100)
        .describe('At most the requested limit, never more than 100 items.'),
      next_cursor: cursor.nullable(),
      has_more: z.boolean(),
    })
    .superRefine((page, context) => {
      if (page.has_more === (page.next_cursor !== null)) return;
      context.addIssue({
        code: 'custom',
        path: ['next_cursor'],
        message: 'next_cursor must be present exactly when has_more is true',
      });
    });
}
