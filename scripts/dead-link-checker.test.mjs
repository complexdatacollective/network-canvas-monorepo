import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

const checkerPath = new URL('./dead-link-checker.mjs', import.meta.url);

function runChecker(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [checkerPath.pathname, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stderr, stdout }));
  });
}

test('the user-agent option applies to every link request', async () => {
  const userAgents = [];
  const server = createServer((request, response) => {
    userAgents.push(request.headers['user-agent']);
    if (request.url === '/') {
      response.setHeader('content-type', 'text/html');
      response.end('<a href="/linked">linked page</a>');
      return;
    }

    response.end('ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.notEqual(typeof address, 'string');
  assert.ok(address);

  try {
    const userAgent =
      'Mozilla/5.0 BrowserSignature/1.0 NetworkCanvasLinkChecker/1.0';
    const result = await runChecker(
      `http://127.0.0.1:${address.port}`,
      '--yes',
      `--user-agent=${userAgent}`,
    );

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(userAgents, [userAgent, userAgent]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
