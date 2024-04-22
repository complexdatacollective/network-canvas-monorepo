import 'dotenv/config';

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';

// Todo: figure out why dotenv is not loading the .env file

const turso = createClient({
  url: 'libsql://mirfayz-mvp-deadshot.turso.io',
  authToken:
    'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3MTM3Nzg2MTcsImlkIjoiMWQyYmJkOTMtODc4Yi00ODAxLWE5ZjAtZWRiNDA5MzA3MTg1In0.pzmfZeRx0eKr7ft7hVf-9FwXBSiII_7eZeigSYYL5WIdnH6F1INc2JoqyxG5EGrABIGjAC3RrfNHlriVVs37Cw',
});

export const db = drizzle(turso);
