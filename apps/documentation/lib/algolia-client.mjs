import algoliasearch from 'algoliasearch';
import dotenv from 'dotenv';
import { env } from '../env.mjs';

dotenv.config();

export const algolia_client = algoliasearch(
  env.NEXT_PUBLIC_ALGOLIA_APPLICATION_ID,
  env.NEXT_PUBLIC_ALGOLIA_API_KEY,
);
