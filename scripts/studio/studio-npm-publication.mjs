import { createHash } from 'node:crypto';

import { verify } from 'sigstore';

const REPOSITORY =
  'https://github.com/complexdatacollective/network-canvas-monorepo';
const WORKFLOW = '.github/workflows/ci-and-release.yml';
const PREDICATE = 'https://slsa.dev/provenance/v1';
const IDENTITY = `${REPOSITORY}/${WORKFLOW}@refs/heads/main`;
const VERIFICATION = Object.freeze({
  certificateIssuer: 'https://token.actions.githubusercontent.com',
  // Sigstore treats URI identities as regular expressions, not literal strings.
  certificateIdentityURI: `^${IDENTITY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  ctLogThreshold: 1,
  tlogThreshold: 1,
  timeout: 10_000,
  retry: 1,
});

async function registryBytes(url, fetcher, limit) {
  const target = new URL(url);
  if (
    target.origin !== 'https://registry.npmjs.org' ||
    target.username ||
    target.password
  )
    throw new Error(
      'Publication evidence must come from the official npm registry.',
    );
  const response = await fetcher(target.href, {
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok || !response.body)
    throw new Error('Dependency publication is unavailable.');
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > limit)
      throw new Error('Dependency publication exceeds the verification limit.');
    chunks.push(chunk);
  }
  if (!length) throw new Error('Dependency publication is empty.');
  return Buffer.concat(chunks);
}

/**
 * Authenticate npm's SLSA bundle, then bind its subject to available tarball
 * bytes and its source to our normal-lane publisher. pnpm publications do not
 * supply npm's optional gitHead metadata. A decoded, unverified DSSE payload
 * is never source evidence. Sigstore verifies the certificate and log proofs.
 */
export async function npmPublication(
  name,
  version,
  fetcher = fetch,
  verifyBundle = verify,
) {
  const metadata = JSON.parse(
    await registryBytes(
      `https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
      fetcher,
      4 * 1024 ** 2,
    ),
  );
  if (
    metadata.name !== name ||
    metadata.version !== version ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(metadata.dist?.integrity ?? '')
  )
    throw new Error(
      'Dependency publication lacks identity or integrity evidence.',
    );
  const attestations = JSON.parse(
    await registryBytes(
      metadata.dist?.attestations?.url,
      fetcher,
      4 * 1024 ** 2,
    ),
  );
  const provenance = attestations.attestations?.filter(
    (item) => item.predicateType === PREDICATE,
  );
  if (provenance?.length !== 1)
    throw new Error(
      'Dependency publication requires one SLSA provenance bundle.',
    );
  const bundle = provenance[0].bundle;
  // For DSSE, options are the SECOND argument; passing undefined as payload
  // causes sigstore.verify to replace the third argument with undefined.
  await verifyBundle(bundle, VERIFICATION);
  if (bundle.dsseEnvelope?.payloadType !== 'application/vnd.in-toto+json')
    throw new Error('Dependency provenance has an unexpected envelope.');
  const statement = JSON.parse(
    Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'),
  );
  const definition = statement.predicate?.buildDefinition;
  const workflow = definition?.externalParameters?.workflow;
  const sources = definition?.resolvedDependencies;
  const source = sources?.find(
    (item) => item.uri === `git+${REPOSITORY}@refs/heads/main`,
  );
  const sha512 = Buffer.from(
    metadata.dist.integrity.slice('sha512-'.length),
    'base64',
  ).toString('hex');
  const subject = statement.subject;
  const packageUrl = `pkg:npm/${name.replace('@', '%40')}@${version}`;
  if (
    statement._type !== 'https://in-toto.io/Statement/v1' ||
    statement.predicateType !== PREDICATE ||
    definition?.buildType !==
      'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1' ||
    workflow?.repository !== REPOSITORY ||
    workflow.path !== WORKFLOW ||
    workflow.ref !== 'refs/heads/main' ||
    subject?.length !== 1 ||
    subject[0].name !== packageUrl ||
    subject[0].digest?.sha512 !== sha512 ||
    sources?.length !== 1 ||
    !/^[a-f0-9]{40}$/.test(source?.digest?.gitCommit ?? '')
  )
    throw new Error(
      'Dependency provenance does not bind this package to the reviewed release source.',
    );
  const tarball = await registryBytes(
    metadata.dist.tarball,
    fetcher,
    128 * 1024 ** 2,
  );
  if (createHash('sha512').update(tarball).digest('hex') !== sha512)
    throw new Error(
      'Available dependency bytes do not match the authenticated publication.',
    );
  return {
    source: source.digest.gitCommit,
    integrity: metadata.dist.integrity,
    provenance: createHash('sha256')
      .update(JSON.stringify(bundle))
      .digest('hex'),
  };
}
