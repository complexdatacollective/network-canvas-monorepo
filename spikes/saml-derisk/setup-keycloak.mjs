// Configures the local Keycloak as a university-style SAML IdP via its admin
// REST API: realm, SAML client (the Studio SP), attribute protocol mappers,
// an IdP-initiated SSO URL, and a test user.
const KC = 'http://localhost:8080';
const REALM = 'university';
const SP_ENTITY_ID = 'http://localhost:3005/api/auth/sso/saml2/sp/metadata';
const ACS = 'http://localhost:3005/api/auth/sso/saml2/sp/acs/university';

async function adminToken() {
  const res = await fetch(
    `${KC}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'admin',
        password: 'admin',
      }),
    },
  );
  if (!res.ok) throw new Error(`admin token: ${res.status}`);
  return (await res.json()).access_token;
}

const { readFileSync, writeFileSync } = await import('node:fs');
// The SP signs AuthnRequests (Keycloak's descriptor advertises
// WantAuthnRequestsSigned, as university IdPs commonly do): the client
// carries the SP's signing certificate.
const spCert = readFileSync('sp-cert.pem', 'utf8')
  .replace(/-----(BEGIN|END) CERTIFICATE-----|\n/g, '');

const token = await adminToken();
const api = async (method, path, body) => {
  const res = await fetch(`${KC}/admin${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  }
  return res;
};

// Realm (recreated from scratch so reruns are deterministic)
await fetch(`${KC}/admin/realms/${REALM}`, {
  method: 'DELETE',
  headers: { authorization: `Bearer ${token}` },
});
await api('POST', '/realms', { realm: REALM, enabled: true });

// SAML client = the Studio SP
await api('POST', `/realms/${REALM}/clients`, {
  clientId: SP_ENTITY_ID,
  protocol: 'saml',
  enabled: true,
  redirectUris: [ACS],
  baseUrl: 'http://localhost:3005',
  frontchannelLogout: true,
  attributes: {
    'saml.assertion.signature': 'true',
    'saml.server.signature': 'true',
    'saml.client.signature': 'true',
    'saml.signing.certificate': spCert,
    'saml.force.post.binding': 'true',
    'saml_name_id_format': 'email',
    'saml.authnstatement': 'true',
    // Enables IdP-initiated SSO at
    // /realms/university/protocol/saml/clients/studio
    'saml_idp_initiated_sso_url_name': 'studio',
    'saml_assertion_consumer_url_post': ACS,
  },
});

// Attribute mappers: email + given/surname as SAML attributes
const clients = await (
  await api('GET', `/realms/${REALM}/clients?clientId=${encodeURIComponent(SP_ENTITY_ID)}`)
).json();
const clientUuid = clients[0].id;
const mappers = [
  ['email', 'email'],
  ['firstName', 'givenName'],
  ['lastName', 'surname'],
];
for (const [userAttr, samlName] of mappers) {
  await api(
    'POST',
    `/realms/${REALM}/clients/${clientUuid}/protocol-mappers/models`,
    {
      name: `map-${samlName}`,
      protocol: 'saml',
      protocolMapper: 'saml-user-property-mapper',
      config: {
        'user.attribute': userAttr,
        'attribute.name': samlName,
        'attribute.nameformat': 'Basic',
      },
    },
  );
}

// Test user
await api('POST', `/realms/${REALM}/users`, {
  username: 'alice',
  email: 'alice@university.example',
  emailVerified: true,
  enabled: true,
  firstName: 'Alice',
  lastName: 'Reilly',
  credentials: [{ type: 'password', value: 'correct-horse', temporary: false }],
});

// Emit the IdP's SAML metadata for the registration step.
const metadata = await (
  await fetch(`${KC}/realms/${REALM}/protocol/saml/descriptor`)
).text();
writeFileSync('idp-metadata.xml', metadata);
console.log('keycloak configured; IdP metadata written to idp-metadata.xml');
