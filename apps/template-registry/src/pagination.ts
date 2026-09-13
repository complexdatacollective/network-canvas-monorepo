import { z } from 'zod';

/** Every emitted pagination token is safe to pass back through a query string. */
export const PaginationCursorSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[A-Za-z0-9_-]+$/);
