// better-auth instance for the SAML spike: pg-backed, email/password enabled
// (to create the registering admin user), SSO plugin with SAML enabled.
import { sso } from '@better-auth/sso';
import { betterAuth } from 'better-auth';
import pg from 'pg';

export const BASE_URL = 'http://localhost:3005';

export const auth = betterAuth({
  baseURL: BASE_URL,
  secret: 'spike-secret-not-for-production',
  database: new pg.Pool({
    host: '127.0.0.1',
    port: 54318,
    user: 'postgres',
    password: 'spike',
    database: 'studio_saml',
  }),
  emailAndPassword: { enabled: true },
  plugins: [sso()],
});
