// Drives both SAML flows end to end without a browser: a cookie-jar fetch
// plays the user agent; Keycloak's login form is parsed and submitted like a
// real user would.
import { readFileSync } from 'node:fs';

const SP = 'http://localhost:3005';
const KC = 'http://localhost:8080';
const PROVIDER_ID = 'university';

class Jar {
  cookies = new Map();
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';');
      const [name, ...v] = pair.split('=');
      this.cookies.set(name.trim(), v.join('='));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function jarFetch(jar, url, init = {}) {
  // better-auth's CSRF protection requires an Origin on unsafe methods; a
  // browser would send it, so the scripted agent does too (same-origin for SP
  // calls, the SP's origin for the cross-site ACS post, like a real IdP flow).
  const origin = url.startsWith(KC) ? KC : SP;
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: { origin, ...init.headers, cookie: jar.header() },
  });
  jar.absorb(res);
  return res;
}

/** Follow redirects manually so every set-cookie lands in the jar. */
async function follow(jar, res, limit = 10) {
  while (res.status >= 300 && res.status < 400 && limit-- > 0) {
    const location = new URL(res.headers.get('location'), res.url).href;
    res = await jarFetch(jar, location);
  }
  return res;
}

function formInputs(html) {
  const action = html.match(/<form[^>]*action="([^"]+)"/)?.[1];
  const inputs = {};
  for (const m of html.matchAll(/<input[^>]*name="([^"]+)"[^>]*value="([^"]*)"/g)) {
    inputs[m[1]] = m[2].replaceAll('&#x2b;', '+').replaceAll('&#x2f;', '/')
      .replaceAll('&#x3d;', '=').replaceAll('&amp;', '&');
  }
  return { action: action?.replaceAll('&amp;', '&'), inputs };
}

// --- 1. Register the SAML provider (metadata exchange) -------------------

// Create/sign in the registering user, keep its session cookie.
const adminJar = new Jar();
let res = await jarFetch(adminJar, `${SP}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'owner@studio.example',
    password: 'spike-password-1',
    name: 'Workspace Owner',
  }),
});
if (res.status === 422) {
  res = await jarFetch(adminJar, `${SP}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@studio.example',
      password: 'spike-password-1',
    }),
  });
}
if (!res.ok) throw new Error(`sign-up/in failed: ${res.status} ${await res.text()}`);

const idpMetadata = readFileSync('idp-metadata.xml', 'utf8');
const entryPoint = idpMetadata.match(
  /SingleSignOnService[^>]*HTTP-Redirect[^>]*Location="([^"]+)"/,
)?.[1] ?? `${KC}/realms/university/protocol/saml`;
const cert = idpMetadata.match(/<ds:X509Certificate>([^<]+)</)?.[1] ?? '';

// Keycloak's descriptor advertises WantAuthnRequestsSigned="true" (typical of
// university IdPs), and samlify refuses an unsigned-SP/signing-IdP pairing —
// so the SP declares AuthnRequestsSigned in its own metadata XML and carries
// a signing keypair. NOTE (finding): the plugin's field-based spMetadata path
// never sets authnRequestsSigned on the samlify SP; full SP metadata XML is
// the only way to express it.
const SP_ENTITY = `${SP}/api/auth/sso/saml2/sp/metadata`;
const ACS = `${SP}/api/auth/sso/saml2/sp/acs/${PROVIDER_ID}`;
const spKey = readFileSync('sp-key.pem', 'utf8');
const spCertB64 = readFileSync('sp-cert.pem', 'utf8').replace(
  /-----(BEGIN|END) CERTIFICATE-----|\n/g,
  '',
);
const spMetadataXml = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${SP_ENTITY}">
  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
        <ds:X509Data><ds:X509Certificate>${spCertB64}</ds:X509Certificate></ds:X509Data>
      </ds:KeyInfo>
    </KeyDescriptor>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${ACS}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

res = await jarFetch(adminJar, `${SP}/api/auth/sso/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    providerId: PROVIDER_ID,
    issuer: `${KC}/realms/university`,
    domain: 'university.example',
    samlConfig: {
      issuer: `${SP}/api/auth/sso/saml2/sp/metadata`,
      entryPoint,
      cert,
      callbackUrl: `${SP}/dashboard`,
      idpMetadata: { metadata: idpMetadata },
      spMetadata: {
        metadata: spMetadataXml,
        entityID: SP_ENTITY,
        binding: 'post',
        privateKey: spKey,
      },
      wantAssertionsSigned: true,
      authnRequestsSigned: true,
      identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      // NOTE: the published SAMLMapping type marks every field optional, but
      // the /sso/register endpoint's runtime schema REQUIRES id/email/name —
      // recorded as a findings item.
      mapping: {
        id: 'nameID',
        email: 'email',
        name: 'givenName',
        firstName: 'givenName',
        lastName: 'surname',
        extraFields: {},
      },
    },
  }),
});
if (!res.ok) throw new Error(`sso/register failed: ${res.status} ${await res.text()}`);
console.log('1. provider registered (IdP metadata exchanged) ✓');

// SP metadata endpoint (the other half of metadata exchange)
res = await fetch(
  `${SP}/api/auth/sso/saml2/sp/metadata?providerId=${PROVIDER_ID}`,
);
const spMeta = await res.text();
if (!spMeta.includes('AssertionConsumerService')) {
  throw new Error('SP metadata endpoint did not return SAML metadata');
}
console.log('2. SP metadata endpoint serves metadata for the IdP side ✓');

// --- 2. SP-initiated flow -------------------------------------------------

const userJar = new Jar();
res = await jarFetch(userJar, `${SP}/api/auth/sign-in/sso`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    providerId: PROVIDER_ID,
    callbackURL: `${SP}/dashboard`,
  }),
});
if (!res.ok) throw new Error(`sign-in/sso failed: ${res.status} ${await res.text()}`);
const { url: idpUrl } = await res.json();
if (!idpUrl?.includes('SAMLRequest')) {
  throw new Error(`expected an IdP redirect URL with SAMLRequest, got: ${idpUrl}`);
}

// User agent goes to Keycloak, gets the login form, submits credentials.
res = await follow(userJar, await jarFetch(userJar, idpUrl));
let { action, inputs } = formInputs(await res.text());
res = await jarFetch(userJar, action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ ...inputs, username: 'alice', password: 'correct-horse' }),
});
res = await follow(userJar, res);

// Keycloak responds with an auto-submitting form carrying SAMLResponse → ACS.
({ action, inputs } = formInputs(await res.text()));
if (!inputs.SAMLResponse) throw new Error('no SAMLResponse in IdP response');
res = await jarFetch(userJar, action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(inputs),
});
res = await follow(userJar, res);

let session = await (
  await jarFetch(userJar, `${SP}/api/auth/get-session`)
).json();
if (session?.user?.email !== 'alice@university.example') {
  throw new Error(`SP-initiated: no session for alice: ${JSON.stringify(session)}`);
}
console.log('3. SP-initiated flow: session established for', session.user.email, '✓');
console.log('   mapped user record:', JSON.stringify({
  name: session.user.name,
  email: session.user.email,
  emailVerified: session.user.emailVerified,
}));

// --- 3. IdP-initiated flow ------------------------------------------------

const idpJar = new Jar();
res = await follow(
  idpJar,
  await jarFetch(idpJar, `${KC}/realms/university/protocol/saml/clients/studio`),
);
({ action, inputs } = formInputs(await res.text()));
if (inputs.username !== undefined || !inputs.SAMLResponse) {
  // Fresh Keycloak session: login first, then expect the SAMLResponse form.
  res = await jarFetch(idpJar, action, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...inputs, username: 'alice', password: 'correct-horse' }),
  });
  res = await follow(idpJar, res);
  ({ action, inputs } = formInputs(await res.text()));
}
if (!inputs.SAMLResponse) throw new Error('IdP-initiated: no SAMLResponse form');
res = await jarFetch(idpJar, action, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(inputs),
});
res = await follow(idpJar, res);

session = await (await jarFetch(idpJar, `${SP}/api/auth/get-session`)).json();
if (session?.user?.email !== 'alice@university.example') {
  throw new Error(`IdP-initiated: no session: ${JSON.stringify(session)}`);
}
console.log('4. IdP-initiated flow: session established for', session.user.email, '✓');
console.log('\nall flows passed');
