import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

test('dead-link fetches identify as a browser without replacing explicit headers', async () => {
  const userAgents = [];
  const server = createServer((request, response) => {
    userAgents.push(request.headers['user-agent']);
    response.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.notEqual(typeof address, 'string');
  assert.ok(address);

  const nativeFetch = globalThis.fetch;
  try {
    await import(`./dead-link-check-fetch-user-agent.mjs?test=${Date.now()}`);

    const url = `http://127.0.0.1:${address.port}`;
    await fetch(url);
    await fetch(
      new Request(url, { headers: { 'user-agent': 'RequestAgent/1.0' } }),
    );
    await fetch(url, { headers: { 'user-agent': 'InitAgent/1.0' } });

    assert.match(
      userAgents[0],
      /^Mozilla\/5\.0 .* NetworkCanvasLinkChecker\/1\.0$/,
    );
    assert.equal(userAgents[1], 'RequestAgent/1.0');
    assert.equal(userAgents[2], 'InitAgent/1.0');
  } finally {
    globalThis.fetch = nativeFetch;
    server.close();
    await once(server, 'close');
  }
});
