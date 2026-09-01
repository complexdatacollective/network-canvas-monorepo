import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BrowserVerifier,
  MAX_GITHUB_ERROR_ANNOTATIONS,
  PageSlotSemaphore,
  crawl,
  formatGitHubAnnotation,
  formatGitHubSummary,
  formatTextReport,
  parseArguments,
  retryDelayMilliseconds,
  run,
} from './dead-link-checker.mjs';

const checkerPath = fileURLToPath(
  new URL('./dead-link-checker.mjs', import.meta.url),
);

function runChecker(args, { env = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [checkerPath, ...args], {
      env: { ...process.env, ...env },
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

async function startServer(handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.notEqual(typeof address, 'string');
  assert.ok(address);
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async stop() {
      server.close();
      await once(server, 'close');
    },
  };
}

function html(response, body, status = 200) {
  response.statusCode = status;
  response.setHeader('content-type', 'text/html');
  response.end(body);
}

function jsonResult(result) {
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('the user-agent option applies to every link request', async () => {
  const userAgents = [];
  const server = await startServer((request, response) => {
    userAgents.push(request.headers['user-agent']);
    if (request.url === '/') {
      html(
        response,
        `
          <a href="/linked">linked page</a>
          <a href="data:text/plain,inline">inline data</a>
          <a href="vbscript:msgbox('unsafe')">VBScript</a>
          <a href="mailto:test@example.com">email</a>
          <a href="javascript:void(0)">JavaScript</a>
        `,
      );
      return;
    }
    response.end('ok');
  });

  try {
    const userAgent =
      'Mozilla/5.0 BrowserSignature/1.0 NetworkCanvasLinkChecker/1.0';
    const result = await runChecker([
      server.origin,
      '--yes',
      '--delay=0',
      `--user-agent=${userAgent}`,
    ]);

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(userAgents, [userAgent, userAgent]);
    assert.doesNotMatch(result.stdout, /data:|vbscript:|mailto:|javascript:/);
  } finally {
    await server.stop();
  }
});

test('mixed-case HTML media types are crawled recursively', async () => {
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      response.setHeader('content-type', 'Text/HTML; charset=utf-8');
      response.end('<a href="/missing">missing</a>');
      return;
    }
    response.statusCode = 404;
    response.end('missing');
  });

  try {
    const result = await runChecker([
      server.origin,
      '--format=json',
      '--delay=0',
      '--retries=0',
    ]);
    assert.equal(result.code, 1, result.stderr);
    const report = jsonResult(result);
    assert.equal(report.summary.checked, 2);
    assert.equal(report.failures[0].url, `${server.origin}/missing`);
  } finally {
    await server.stop();
  }
});

test('text output ends with one deterministic failure block and every referrer', async () => {
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      html(response, '<a href="/source-b">B</a><a href="/source-a">A</a>');
      return;
    }
    if (request.url === '/source-a' || request.url === '/source-b') {
      html(response, '<a href="/missing">missing</a>');
      return;
    }
    response.statusCode = 404;
    response.end('missing');
  });

  try {
    const result = await runChecker([
      server.origin,
      '--concurrent=3',
      '--delay=0',
    ]);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(
      result.stdout.includes('\u001B['),
      false,
      'pipes never receive ANSI',
    );
    assert.match(
      result.stdout,
      /Discovered: 4 \| Checked: 4 \| Passed: 3 \| Failed: 1/,
    );
    assert.equal(result.stdout.match(/❌ Failed URLs/g)?.length, 1);
    assert.ok(
      result.stdout.endsWith(
        `❌ Failed URLs (1):\n- ${server.origin}/missing\n  Status: HTTP 404\n  Found on:\n    - ${server.origin}/source-a\n    - ${server.origin}/source-b\n`,
      ),
      result.stdout,
    );
  } finally {
    await server.stop();
  }
});

test('JSON, report files, annotations, and job summaries share one report', async () => {
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      html(response, '<a href="/bad%25value">bad</a>');
      return;
    }
    response.statusCode = 503;
    response.setHeader('retry-after', '0');
    response.end('unavailable');
  });
  const directory = await mkdtemp(join(tmpdir(), 'dead-link-checker-'));
  const reportPath = join(directory, 'report.json');
  const summaryPath = join(directory, 'summary.md');

  try {
    const result = await runChecker(
      [
        server.origin,
        '--format=json',
        '--delay=0',
        '--retries=0',
        `--report=${reportPath}`,
        '--github-actions',
      ],
      { env: { GITHUB_STEP_SUMMARY: summaryPath } },
    );
    assert.equal(result.code, 1);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.target, `${server.origin}/`);
    assert.match(report.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Number.isInteger(report.durationMs) && report.durationMs >= 0);
    assert.deepEqual(report.summary, {
      checked: 2,
      discovered: 2,
      failed: 1,
      passed: 1,
    });
    assert.deepEqual(report.failures, [report.results[1]]);
    assert.equal(report.results[0].kind, null);
    assert.equal(report.failures[0].kind, 'http-error');
    assert.match(result.stderr, /^::error title=Dead link returned HTTP 503::/);
    assert.match(result.stderr, /bad%2525value/);
    assert.equal(result.stderr.trim().split('\n').length, 1);

    const summary = await readFile(summaryPath, 'utf8');
    assert.match(summary, /^### Dead-link check/m);
    assert.match(summary, /\*\*1 failed\*\*/);
    assert.match(summary, /bad%25value/);
  } finally {
    await server.stop();
    await rm(directory, { force: true, recursive: true });
  }
});

test('a body timeout after headers becomes a reportable request failure', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.flushHeaders();
    setTimeout(() => response.end('<p>late body</p>'), 100);
  });

  try {
    const result = await runChecker([
      server.origin,
      '--format=json',
      '--timeout=20',
      '--retries=0',
      '--delay=0',
    ]);
    assert.equal(result.code, 1, result.stderr);
    const report = jsonResult(result);
    assert.deepEqual(report.summary, {
      checked: 1,
      discovered: 1,
      failed: 1,
      passed: 0,
    });
    assert.equal(report.failures[0].kind, 'request-error');
    assert.equal(report.failures[0].status, null);
    assert.match(report.failures[0].error, /timed out/i);
  } finally {
    await server.stop();
  }
});

test('GitHub annotations are capped without truncating summaries or JSON reports', async () => {
  assert.equal(MAX_GITHUB_ERROR_ANNOTATIONS, 50);
  const failureCount = 53;
  const failurePaths = Array.from(
    { length: failureCount },
    (_, index) => `/failure-${String(index).padStart(3, '0')}`,
  );
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      html(
        response,
        failurePaths.map((path) => `<a href="${path}">bad</a>`).join(''),
      );
      return;
    }
    response.statusCode = 404;
    response.end('missing');
  });
  const directory = await mkdtemp(join(tmpdir(), 'dead-link-checker-cap-'));
  const reportPath = join(directory, 'report.json');
  const summaryPath = join(directory, 'summary.md');

  try {
    const result = await runChecker(
      [
        server.origin,
        '--format=json',
        '--delay=0',
        '--retries=0',
        `--report=${reportPath}`,
        '--github-actions',
      ],
      { env: { GITHUB_STEP_SUMMARY: summaryPath } },
    );
    assert.equal(result.code, 1);
    const annotations = result.stderr
      .trim()
      .split('\n')
      .filter((line) => line.startsWith('::error'));
    assert.equal(annotations.length, 50);
    assert.match(
      result.stderr,
      /::warning title=Additional dead links omitted from annotations::3 additional failures/,
    );

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    assert.equal(report.failures.length, failureCount);
    assert.equal(report.summary.failed, failureCount);
    const lastFailureURL = `${server.origin}${failurePaths.at(-1)}`;
    assert.equal(report.failures.at(-1).url, lastFailureURL);
    assert.match(
      await readFile(summaryPath, 'utf8'),
      new RegExp(lastFailureURL),
    );
  } finally {
    await server.stop();
    await rm(directory, { force: true, recursive: true });
  }
});

test('browser page slots transfer directly to the oldest queued verifier', async () => {
  const slots = new PageSlotSemaphore(1);
  await slots.acquire();

  let queuedAcquired = false;
  const queued = slots.acquire().then(() => (queuedAcquired = true));

  slots.release();

  let newcomerAcquired = false;
  const newcomer = slots.acquire().then(() => (newcomerAcquired = true));

  await queued;
  assert.equal(queuedAcquired, true);
  assert.equal(
    newcomerAcquired,
    false,
    'a newcomer cannot claim a slot already promised to the queued verifier',
  );

  slots.release();
  await newcomer;
  assert.equal(newcomerAcquired, true);
  slots.release();
});

test('timed-out browser page-slot waiters do not consume a later permit', async () => {
  const slots = new PageSlotSemaphore(1);
  await slots.acquire();

  await assert.rejects(slots.acquire(10), { name: 'TimeoutError' });
  slots.release();

  await slots.acquire();
  slots.release();
});

test('browser setup is bounded by the request timeout', async () => {
  const browser = {
    close: async () => {},
    newContext: async () => new Promise(() => {}),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });
  let guardTimer;

  try {
    await assert.rejects(
      Promise.race([
        verifier.verify('https://publisher.test/setup-timeout', 20),
        new Promise((_, reject) => {
          guardTimer = globalThis.setTimeout(
            () => reject(new Error('test guard expired before setup timeout')),
            200,
          );
        }),
      ]),
      /Browser verification timed out after 20ms/,
    );
  } finally {
    globalThis.clearTimeout(guardTimer);
    await verifier.close();
  }
});

test('browser verification keeps the configured identity and final redirect status', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status, url) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, 'https://publisher.test/challenge');
  const redirect = response(302, 'https://publisher.test/challenge');
  const final = response(404, 'https://publisher.test/missing');
  let responseListener;
  let contextOptions;
  const page = {
    close: async () => {},
    goto: async () => {
      assert.equal(typeof responseListener, 'function');
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/missing',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      assert.equal(typeof responseListener, 'function');
      responseListener(redirect);
      if (predicate(redirect)) return redirect;
      responseListener(final);
      assert.equal(predicate(final), true);
      return final;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async (options) => {
      contextOptions = options;
      return { newPage: async () => page };
    },
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
    userAgent: 'NetworkCanvasLinkChecker/test',
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
    );
    assert.deepEqual(contextOptions, {
      acceptDownloads: false,
      userAgent: 'NetworkCanvasLinkChecker/test',
    });
    assert.equal(outcome.finalUrl, 'https://publisher.test/missing');
    assert.deepEqual(outcome.redirects, [
      {
        from: 'https://publisher.test/challenge',
        status: 302,
        to: 'https://publisher.test/missing',
      },
    ]);
    assert.equal(outcome.status, 404);
  } finally {
    await verifier.close();
  }
});

test('browser verification isolates storage between checked links', async () => {
  let browserLaunches = 0;
  let closedContexts = 0;
  let createdContexts = 0;
  const browser = {
    close: async () => {},
    newContext: async () => {
      createdContexts++;
      const frame = {};
      const navigationRequest = {
        frame: () => frame,
        isNavigationRequest: () => true,
      };
      const response = {
        frame: () => frame,
        headers: () => ({ 'content-type': 'text/html' }),
        request: () => navigationRequest,
        status: () => 200,
      };
      let responseListener;
      const page = {
        close: async () => {},
        goto: async () => {
          responseListener(response);
          return response;
        },
        mainFrame: () => frame,
        on: (event, listener) => {
          if (event === 'response') responseListener = listener;
        },
        url: () => 'https://publisher.test/ok',
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
      };
      return {
        close: async () => {
          closedContexts++;
        },
        newPage: async () => page,
      };
    },
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({
      launch: async () => {
        browserLaunches++;
        return browser;
      },
    }),
  });

  try {
    await verifier.verify('https://publisher.test/first', 50);
    await verifier.verify('https://publisher.test/second', 50);
    assert.equal(browserLaunches, 1, 'the Chrome process remains shared');
    assert.equal(createdContexts, 2, 'each link gets a fresh browser context');
    assert.equal(closedContexts, 2, 'each isolated context is closed');
  } finally {
    await verifier.close();
  }
});

test('browser verification rejects a challenge redirect without a terminal response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const redirect = response(302);
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/hanging',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      responseListener(redirect);
      assert.equal(predicate(redirect), false);
      throw Object.assign(new Error('terminal response timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /terminal response timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification propagates terminal document load timeouts', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const final = response(200);
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/incomplete-document',
    waitForLoadState: async () => {
      throw Object.assign(new Error('document load timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForResponse: async (predicate) => {
      responseListener(final);
      assert.equal(predicate(final), true);
      return final;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /document load timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification binds document loading to the selected fragment navigation', async () => {
  const frame = {
    url: () => 'https://publisher.test/stalled-document#section',
  };
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status, url) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, 'https://publisher.test/challenge');
  const final = response(200, 'https://publisher.test/stalled-document');
  let committedFinalDocument = false;
  let frameNavigatedListener;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/stalled-document#section',
    waitForEvent: async () => {},
    waitForLoadState: async () => {
      if (!committedFinalDocument) return;
      throw Object.assign(new Error('selected document load timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForResponse: async (predicate) => {
      responseListener(final);
      assert.equal(predicate(final), true);
      globalThis.setTimeout(() => {
        committedFinalDocument = true;
        frameNavigatedListener(frame);
      }, 0);
      return final;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /selected document load timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification rechecks a terminal response observed during document load', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  const final = response(404);
  let loadCount = 0;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/stalled-final-document',
    waitForLoadState: async () => {
      if (loadCount++ === 0) {
        responseListener(final);
        return;
      }
      throw Object.assign(new Error('final document load timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForResponse: async (predicate) => {
      responseListener(interstitial);
      assert.equal(predicate(interstitial), true);
      return interstitial;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /final document load timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a successful download response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const downloadResponse = {
    frame: () => frame,
    headers: () => ({
      'content-disposition': 'attachment; filename="report.pdf"',
      'content-type': 'application/pdf',
    }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => 'https://publisher.test/report.pdf',
  };
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(downloadResponse);
      throw new Error('page.goto: Download is starting');
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'about:blank',
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/report.pdf',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'application/pdf',
      finalUrl: 'https://publisher.test/report.pdf',
      html: null,
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a successful no-content response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const noContentResponse = {
    frame: () => frame,
    headers: () => ({}),
    request: () => navigationRequest,
    status: () => 204,
    url: () => 'https://publisher.test/no-content',
  };
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(noContentResponse);
      throw new Error(
        'page.goto: net::ERR_ABORTED at https://publisher.test/no-content',
      );
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'about:blank',
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/no-content',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: '',
      finalUrl: 'https://publisher.test/no-content',
      html: null,
      redirects: [],
      status: 204,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a successful reset-content response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const resetContentResponse = {
    frame: () => frame,
    headers: () => ({}),
    request: () => navigationRequest,
    status: () => 205,
    url: () => 'https://publisher.test/reset-content',
  };
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(resetContentResponse);
      throw new Error(
        'page.goto: net::ERR_ABORTED at https://publisher.test/reset-content',
      );
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'about:blank',
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/reset-content',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: '',
      finalUrl: 'https://publisher.test/reset-content',
      html: null,
      redirects: [],
      status: 205,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a follow-up download response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 403,
    url: () => 'https://publisher.test/challenge',
  };
  const downloadResponse = {
    frame: () => frame,
    headers: () => ({
      'content-disposition': 'attachment; filename="report.pdf"',
      'content-type': 'application/pdf',
    }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => 'https://publisher.test/report.pdf',
  };
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/challenge',
    waitForLoadState: async () => {
      throw new Error('a download has no document to load');
    },
    waitForResponse: async (predicate) => {
      responseListener(downloadResponse);
      assert.equal(predicate(downloadResponse), true);
      return downloadResponse;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'application/pdf',
      finalUrl: 'https://publisher.test/report.pdf',
      html: null,
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a follow-up reset-content response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 403,
    url: () => 'https://publisher.test/challenge',
  };
  const resetContentResponse = {
    frame: () => frame,
    headers: () => ({}),
    request: () => navigationRequest,
    status: () => 205,
    url: () => 'https://publisher.test/reset-content',
  };
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/challenge',
    waitForLoadState: async () => {
      throw new Error('a 205 has no document to load');
    },
    waitForResponse: async (predicate) => {
      responseListener(resetContentResponse);
      assert.equal(predicate(resetContentResponse), true);
      return resetContentResponse;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: '',
      finalUrl: 'https://publisher.test/reset-content',
      html: null,
      redirects: [],
      status: 205,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification settles a follow-up no-content response before accepting it', async () => {
  let pageUrl = 'https://publisher.test/challenge';
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status, url, headers = {}) => ({
    frame: () => frame,
    headers: () => headers,
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, pageUrl, { 'content-type': 'text/html' });
  const noContent = response(204, 'https://publisher.test/no-content');
  const missing = response(404, 'https://publisher.test/missing', {
    'content-type': 'text/html',
  });
  let laterNavigationObserved = false;
  let responseListener;
  let waitForResponseCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => pageUrl,
    waitForLoadState: async () => {
      assert.equal(laterNavigationObserved, true);
    },
    waitForResponse: async (predicate) => {
      assert.equal(waitForResponseCount++, 0);
      responseListener(noContent);
      assert.equal(predicate(noContent), true);
      return noContent;
    },
    waitForTimeout: async () => {
      if (laterNavigationObserved) return;
      laterNavigationObserved = true;
      pageUrl = missing.url();
      responseListener(missing);
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
    );
    assert.deepEqual(outcome, {
      contentType: 'text/html',
      finalUrl: 'https://publisher.test/missing',
      html: null,
      redirects: [],
      status: 404,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification preserves the cached error status behind a 304 revalidation', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (
    status,
    url,
    headers = { 'content-type': 'Text/HTML; charset=utf-8' },
  ) => ({
    frame: () => frame,
    headers: () => headers,
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, 'https://publisher.test/challenge');
  const recovered = response(404, 'https://publisher.test/revalidated');
  const revalidated = response(304, 'https://publisher.test/revalidated', {});
  let responseListener;
  let settleCount = 0;
  let waitForResponseCount = 0;
  const page = {
    close: async () => {},
    content: async () =>
      '<html><body><a href="/cached-link">cached</a></body></html>',
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/revalidated',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      if (waitForResponseCount++ === 0) {
        responseListener(recovered);
        assert.equal(predicate(recovered), true);
        return recovered;
      }
      throw new Error('cached 304 was not treated as terminal');
    },
    waitForTimeout: async () => {
      if (settleCount++ === 0) responseListener(revalidated);
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'Text/HTML; charset=utf-8',
      finalUrl: 'https://publisher.test/revalidated',
      html: '<html><body><a href="/cached-link">cached</a></body></html>',
      redirects: [],
      status: 404,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification rejects a response superseded before commit by a response-free navigation', async () => {
  let pageUrl = 'https://publisher.test/challenge';
  const frame = { url: () => pageUrl };
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status, url) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, 'https://publisher.test/challenge');
  const abandoned = response(200, 'https://publisher.test/recovered');
  let frameNavigatedListener;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => pageUrl,
    waitForEvent: async () => {
      throw new Error('the abandoned response must not appear committed');
    },
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      responseListener(abandoned);
      assert.equal(predicate(abandoned), true);
      pageUrl = 'about:blank';
      frameNavigatedListener(frame);
      return abandoned;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /without an HTTP response|did not commit|superseded/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification accepts a follow-up headerless download response', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 403,
    url: () => 'https://publisher.test/challenge',
  };
  const downloadResponse = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'application/octet-stream' }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => 'https://publisher.test/archive.bin',
  };
  let downloadListener;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'download') downloadListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/challenge',
    waitForLoadState: async () => {
      throw new Error('a headerless download has no document to load');
    },
    waitForResponse: async (predicate) => {
      responseListener(downloadResponse);
      assert.equal(predicate(downloadResponse), true);
      downloadListener?.({ url: () => downloadResponse.url() });
      return downloadResponse;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'application/octet-stream',
      finalUrl: 'https://publisher.test/archive.bin',
      html: null,
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification does not confuse an independent same-URL download with the document', async () => {
  const finalUrl = 'https://publisher.test/recovered';
  const frame = { url: () => finalUrl };
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => finalUrl,
  };
  let downloadListener;
  let frameNavigatedListener;
  let responseListener;
  const page = {
    close: async () => {},
    content: async () =>
      '<html><body><a href="/linked">linked</a></body></html>',
    goto: async () => {
      responseListener(initial);
      frameNavigatedListener(frame);
      downloadListener({ cancel: async () => {}, url: () => finalUrl });
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'download') downloadListener = listener;
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForEvent: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(finalUrl, 50, {
      captureHTML: true,
    });
    assert.deepEqual(outcome, {
      contentType: 'text/html',
      finalUrl,
      html: '<html><body><a href="/linked">linked</a></body></html>',
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification rejects a response-free non-HTTP commit', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 200,
  };
  let finalUrl = 'https://publisher.test/interstitial';
  let frameNavigatedListener;
  let responseListener;
  let settleCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForLoadState: async () => {},
    waitForTimeout: async () => {
      if (settleCount++ === 0) {
        finalUrl = 'about:blank';
        frameNavigatedListener(frame);
      }
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/tls-recovery', 50),
      /without an HTTP response.*about:blank/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification correlates the initial response before accepting it', async () => {
  let finalUrl = 'https://publisher.test/recovered';
  const frame = { url: () => finalUrl };
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => 'https://publisher.test/recovered',
  };
  let frameNavigatedListener;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      frameNavigatedListener(frame);
      finalUrl = 'about:blank';
      frameNavigatedListener(frame);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForEvent: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/recovered', 50),
      /superseded before commit.*about:blank/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification preserves a response across same-document history changes', async () => {
  let finalUrl = 'https://publisher.test/recovered';
  const frame = { url: () => finalUrl };
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 200,
    url: () => 'https://publisher.test/recovered',
  };
  let frameNavigatedListener;
  let responseListener;
  const page = {
    close: async () => {},
    content: async () =>
      '<html><body><a href="/linked">linked</a></body></html>',
    goto: async () => {
      responseListener(initial);
      frameNavigatedListener(frame);
      finalUrl = 'https://publisher.test/canonical';
      frameNavigatedListener(frame);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForEvent: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/recovered',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'text/html',
      finalUrl: 'https://publisher.test/canonical',
      html: '<html><body><a href="/linked">linked</a></body></html>',
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification rejects a BFCache document restore without a new response', async () => {
  let finalUrl = 'https://publisher.test/challenge';
  const frame = { url: () => finalUrl };
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status, url) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(403, 'https://publisher.test/challenge');
  const recovered = response(200, 'https://publisher.test/recovered');
  const cdpListeners = new Map();
  const cdpSession = {
    on: (event, listener) => cdpListeners.set(event, listener),
    send: async (method) =>
      method === 'Page.getFrameTree'
        ? { frameTree: { frame: { id: 'main' } } }
        : {},
  };
  let frameNavigatedListener;
  let responseListener;
  const emitDocumentCommit = (url, type = 'Navigation') => {
    finalUrl = url;
    frameNavigatedListener(frame);
    cdpListeners.get('Page.frameNavigated')?.({
      frame: { id: 'main', url },
      type,
    });
  };
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      emitDocumentCommit(initial.url());
      responseListener(recovered);
      emitDocumentCommit(recovered.url());
      emitDocumentCommit(initial.url(), 'BackForwardCacheRestore');
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForEvent: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const context = {
    newCDPSession: async () => cdpSession,
    newPage: async () => page,
  };
  const browser = {
    close: async () => {},
    newContext: async () => context,
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /superseded before commit.*challenge/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification follows a client redirect that interrupts the initial goto', async () => {
  let finalUrl = 'https://publisher.test/challenge';
  const frame = { url: () => finalUrl };
  const request = (url) => ({
    frame: () => frame,
    isNavigationRequest: () => true,
    url: () => url,
  });
  const initialRequest = request('https://publisher.test/challenge');
  const recoveredRequest = request('https://publisher.test/recovered');
  const response = (status, url, navigationRequest) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
    url: () => url,
  });
  const initial = response(
    403,
    'https://publisher.test/challenge',
    initialRequest,
  );
  const recovered = response(
    200,
    'https://publisher.test/recovered',
    recoveredRequest,
  );
  let frameNavigatedListener;
  let requestListener;
  let responseListener;
  const page = {
    close: async () => {},
    content: async () =>
      '<html><body><a href="/linked">linked</a></body></html>',
    goto: async () => {
      requestListener(initialRequest);
      responseListener(initial);
      requestListener(recoveredRequest);
      responseListener(recovered);
      finalUrl = recovered.url();
      frameNavigatedListener(frame);
      throw new Error(
        'Navigation to challenge was interrupted by another navigation',
      );
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'framenavigated') frameNavigatedListener = listener;
      if (event === 'request') requestListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => finalUrl,
    waitForEvent: async () => {},
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
      { captureHTML: true },
    );
    assert.deepEqual(outcome, {
      contentType: 'text/html',
      finalUrl: 'https://publisher.test/recovered',
      html: '<html><body><a href="/linked">linked</a></body></html>',
      redirects: [],
      status: 200,
    });
  } finally {
    await verifier.close();
  }
});

test('browser verification reports the response for the document that finishes loading', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  const final = response(404);
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/missing',
    waitForLoadState: async () => responseListener(final),
    waitForResponse: async (predicate) => {
      responseListener(interstitial);
      assert.equal(predicate(interstitial), true);
      return interstitial;
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
    );
    assert.equal(outcome.finalUrl, 'https://publisher.test/missing');
    assert.equal(outcome.status, 404);
  } finally {
    await verifier.close();
  }
});

test('browser verification closes popups spawned by the checked page', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => 200,
  };
  let popupListener;
  let popupClosed = false;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      await popupListener?.({
        close: async () => {
          popupClosed = true;
        },
      });
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'popup') popupListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/ok',
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await verifier.verify('https://publisher.test/ok', 50);
    assert.equal(popupClosed, true);
  } finally {
    await verifier.close();
  }
});

test('browser verification waits for a redirect scheduled after DOMContentLoaded', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  const final = response(404);
  let responseListener;
  let settleCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/missing',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      responseListener(interstitial);
      assert.equal(predicate(interstitial), true);
      return interstitial;
    },
    waitForTimeout: async () => {
      if (settleCount++ === 0) responseListener(final);
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
    );
    assert.equal(settleCount, 2);
    assert.equal(outcome.finalUrl, 'https://publisher.test/missing');
    assert.equal(outcome.status, 404);
  } finally {
    await verifier.close();
  }
});

test('browser verification settles post-load navigation after TLS recovery', async () => {
  const frame = {};
  const navigationRequest = {
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(200);
  const final = response(404);
  let requestListener;
  let responseListener;
  let settleCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'request') requestListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/missing',
    waitForLoadState: async () => {},
    waitForResponse: async () => {
      throw new Error('the terminal response was already observed');
    },
    waitForTimeout: async () => {
      if (settleCount++ === 0) {
        requestListener(navigationRequest);
        responseListener(final);
      }
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/tls-recovery',
      50,
    );
    assert.equal(settleCount, 2);
    assert.equal(outcome.status, 404);
  } finally {
    await verifier.close();
  }
});

test('browser verification bounds repeated challenge navigations by one deadline', async () => {
  const frame = {};
  const navigationRequest = { isNavigationRequest: () => true };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  let responseListener;
  let settleCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/reloading',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      responseListener(interstitial);
      assert.equal(predicate(interstitial), true);
      return interstitial;
    },
    waitForTimeout: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (settleCount++ < 3) responseListener(response(200));
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 15),
      { name: 'TimeoutError' },
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification waits when navigation starts without a response', async () => {
  const frame = {};
  const navigationRequest = {
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  let requestListener;
  let responseListener;
  let waitForResponseCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'request') requestListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/slow-navigation',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      if (waitForResponseCount++ === 0) {
        responseListener(interstitial);
        assert.equal(predicate(interstitial), true);
        return interstitial;
      }
      throw Object.assign(new Error('slow navigation timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForTimeout: async () => requestListener?.(navigationRequest),
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /slow navigation timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification waits when navigation is pending before settling', async () => {
  const frame = {};
  const navigationRequest = {
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  const response = (status) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403);
  const interstitial = response(200);
  let requestListener;
  let responseListener;
  let loadCount = 0;
  let waitForResponseCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'request') requestListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/slow-navigation',
    waitForLoadState: async () => {
      if (loadCount++ === 0) requestListener(navigationRequest);
    },
    waitForResponse: async (predicate) => {
      if (waitForResponseCount++ === 0) {
        responseListener(interstitial);
        assert.equal(predicate(interstitial), true);
        return interstitial;
      }
      throw Object.assign(new Error('pending navigation timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForTimeout: async () => {},
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/challenge', 50),
      /pending navigation timed out/,
    );
  } finally {
    await verifier.close();
  }
});

test('browser verification retires an aborted navigation replaced by a terminal response', async () => {
  const frame = {};
  const request = (errorText) => ({
    failure: () => (errorText ? { errorText } : null),
    frame: () => frame,
    isNavigationRequest: () => true,
  });
  const initialRequest = request();
  const abortedRequest = request('net::ERR_ABORTED');
  const replacementRequest = request();
  const response = (status, navigationRequest) => ({
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => navigationRequest,
    status: () => status,
  });
  const initial = response(403, initialRequest);
  const interstitial = response(200, initialRequest);
  const final = response(200, replacementRequest);
  let requestFailedListener;
  let requestListener;
  let responseListener;
  let settleCount = 0;
  let waitForResponseCount = 0;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'request') requestListener = listener;
      if (event === 'requestfailed') requestFailedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/recovered',
    waitForLoadState: async () => {},
    waitForResponse: async (predicate) => {
      if (waitForResponseCount++ === 0) {
        responseListener(interstitial);
        assert.equal(predicate(interstitial), true);
        return interstitial;
      }
      throw Object.assign(new Error('stale aborted request timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForTimeout: async () => {
      if (settleCount++ === 0) {
        requestListener(abortedRequest);
        requestFailedListener?.(abortedRequest);
        requestListener(replacementRequest);
        responseListener(final);
      }
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    const outcome = await verifier.verify(
      'https://publisher.test/challenge',
      50,
    );
    assert.equal(settleCount, 2);
    assert.equal(outcome.status, 200);
  } finally {
    await verifier.close();
  }
});

test('browser verification rejects an unrecovered navigation failure', async () => {
  const frame = {};
  const initialRequest = {
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  const failedRequest = {
    failure: () => ({ errorText: 'net::ERR_NAME_NOT_RESOLVED' }),
    frame: () => frame,
    isNavigationRequest: () => true,
  };
  const initial = {
    frame: () => frame,
    headers: () => ({ 'content-type': 'text/html' }),
    request: () => initialRequest,
    status: () => 200,
  };
  let requestFailedListener;
  let requestListener;
  let responseListener;
  const page = {
    close: async () => {},
    goto: async () => {
      responseListener(initial);
      return initial;
    },
    mainFrame: () => frame,
    on: (event, listener) => {
      if (event === 'request') requestListener = listener;
      if (event === 'requestfailed') requestFailedListener = listener;
      if (event === 'response') responseListener = listener;
    },
    url: () => 'https://publisher.test/navigation-failed',
    waitForLoadState: async () => {},
    waitForResponse: async () => {
      throw Object.assign(new Error('navigation timed out'), {
        name: 'TimeoutError',
      });
    },
    waitForTimeout: async () => {
      requestListener(failedRequest);
      requestFailedListener?.(failedRequest);
    },
  };
  const browser = {
    close: async () => {},
    newContext: async () => ({ newPage: async () => page }),
  };
  const verifier = new BrowserVerifier({
    loadChromium: async () => ({ launch: async () => browser }),
  });

  try {
    await assert.rejects(
      verifier.verify('https://publisher.test/tls-recovery', 50),
      /net::ERR_NAME_NOT_RESOLVED/,
    );
  } finally {
    await verifier.close();
  }
});

test('renderers escape workflow commands and obey explicit color selection', () => {
  const failure = {
    error: 'bad%value\nsecond line',
    finalUrl: 'https://example.test/failure',
    foundOn: ['https://example.test/a,b:c|d'],
    kind: 'request-error',
    ok: false,
    redirects: [],
    status: null,
    url: 'https://example.test/failure',
  };
  const report = {
    durationMs: 1,
    failures: [failure],
    results: [failure],
    schemaVersion: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    summary: { checked: 1, discovered: 1, failed: 1, passed: 0 },
    target: 'https://example.test/',
  };

  assert.equal(
    formatGitHubAnnotation(failure),
    '::error title=Dead link request failed::https://example.test/failure%0Abad%25value%0Asecond line%0AFound on:%0A- https://example.test/a,b:c|d',
  );
  assert.match(formatGitHubSummary(report), /a,b:c\\\|d/);
  assert.equal(
    formatTextReport(report, { color: true }).includes('\u001B[31m'),
    true,
  );
  assert.equal(
    formatTextReport(report, { color: false }).includes('\u001B['),
    false,
  );
});

test('strict argument validation rejects values that previously produced false success', async () => {
  for (const args of [
    ['https://example.test', '--concurrent=0'],
    ['https://example.test', '--concurrent=2x'],
    ['https://example.test', '--delay=-1'],
    ['https://example.test', '--timeout=0'],
    ['https://example.test', '--format=yaml'],
    ['https://example.test', '--unknown=value'],
    ['https://example.test', 'https://extra.test'],
  ]) {
    assert.throws(
      () => parseArguments(args),
      { name: 'Error' },
      args.join(' '),
    );
  }

  let stderr = '';
  const code = await run(['https://example.test', '--concurrent=NaN'], {
    stderr: { write: (value) => (stderr += value) },
    stdout: { isTTY: false, write() {} },
  });
  assert.equal(code, 2);
  assert.match(stderr, /--concurrent must be an integer/);
  assert.match(stderr, /Usage:/);
});

test('--concurrent keeps workers alive for links discovered after startup', async () => {
  let active = 0;
  let maxActive = 0;
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      html(
        response,
        Array.from(
          { length: 6 },
          (_, index) => `<a href="/work-${index}">work</a>`,
        ).join(''),
      );
      return;
    }
    active++;
    maxActive = Math.max(maxActive, active);
    setTimeout(() => {
      active--;
      response.end('ok');
    }, 80);
  });

  try {
    const result = await runChecker([
      server.origin,
      '--concurrent=3',
      '--delay=0',
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(maxActive, 3);
  } finally {
    await server.stop();
  }
});

test('redirects use their final URL, recurse internally, and detect loops', async () => {
  const server = await startServer((request, response) => {
    if (request.url === '/') {
      html(
        response,
        '<a href="/go">go</a><a href="/loop">loop</a><a href="/too-many">too many</a>',
      );
      return;
    }
    if (request.url === '/go') {
      response.writeHead(302, { location: '/page' });
      response.end();
      return;
    }
    if (request.url === '/page') {
      html(response, '<a href="/missing">missing</a>');
      return;
    }
    if (request.url === '/loop') {
      response.writeHead(302, { location: '/loop' });
      response.end();
      return;
    }
    if (request.url === '/too-many') {
      response.writeHead(302, { location: '/hop' });
      response.end();
      return;
    }
    if (request.url === '/hop') {
      response.writeHead(302, { location: '/page' });
      response.end();
      return;
    }
    response.statusCode = 404;
    response.end('missing');
  });

  try {
    const result = await runChecker([
      server.origin,
      '--format=json',
      '--delay=0',
      '--max-redirects=1',
    ]);
    assert.equal(result.code, 1, result.stderr);
    const report = jsonResult(result);
    const redirected = report.results.find(({ url }) => url.endsWith('/go'));
    assert.equal(redirected.finalUrl, `${server.origin}/page`);
    assert.equal(redirected.redirects.length, 1);
    const missing = report.failures.find(({ url }) => url.endsWith('/missing'));
    assert.deepEqual(missing.foundOn, [`${server.origin}/page`]);
    const loop = report.failures.find(({ url }) => url.endsWith('/loop'));
    assert.match(loop.error, /Redirect loop/);
    assert.equal(loop.kind, 'redirect-error');
    const tooMany = report.failures.find(({ url }) =>
      url.endsWith('/too-many'),
    );
    assert.match(tooMany.error, /Exceeded 1 redirect hops/);
  } finally {
    await server.stop();
  }
});

test('external redirects and transient responses are followed and retried', async () => {
  let transientRequests = 0;
  const external = await startServer((request, response) => {
    if (request.url === '/redirect') {
      response.writeHead(301, { location: '/transient' });
      response.end();
      return;
    }
    transientRequests++;
    if (transientRequests === 1) {
      response.writeHead(503, { 'retry-after': '0' });
      response.end('retry');
      return;
    }
    response.statusCode = 404;
    response.end('missing');
  });
  const root = await startServer((_request, response) => {
    html(response, `<a href="${external.origin}/redirect">external</a>`);
  });

  try {
    const result = await runChecker([
      root.origin,
      '--format=json',
      '--delay=0',
    ]);
    assert.equal(result.code, 1, result.stderr);
    const report = jsonResult(result);
    const failure = report.failures[0];
    assert.equal(failure.url, `${external.origin}/redirect`);
    assert.equal(failure.finalUrl, `${external.origin}/transient`);
    assert.equal(failure.status, 404);
    assert.equal(failure.kind, 'http-error');
    assert.equal(failure.redirects.length, 1);
    assert.equal(transientRequests, 2);
  } finally {
    await root.stop();
    await external.stop();
  }
});

test('browser verification distinguishes challenged links from real 403 responses', async () => {
  const browserChecks = /** @type {string[]} */ ([]);
  let browserClosed = false;
  const nativeFetch = globalThis.fetch;
  const external = await startServer((_request, response) => {
    response.statusCode = 403;
    response.end('forbidden to non-browser clients');
  });
  const root = await startServer((_request, response) => {
    html(
      response,
      `<a href="${external.origin}/browser-ok">browser ok</a>
       <a href="${external.origin}/still-forbidden">still forbidden</a>
       <a href="https://tls-error.test/browser-tls-ok">TLS recovery</a>`,
    );
  });
  const browserVerifier = {
    async close() {
      browserClosed = true;
    },
    async verify(url) {
      browserChecks.push(url);
      return {
        finalUrl: url,
        redirects: [],
        status:
          url.endsWith('/browser-ok') || url.endsWith('/browser-tls-ok')
            ? 200
            : 403,
      };
    },
  };
  const { options } = parseArguments([root.origin, '--delay=0', '--retries=0']);

  try {
    globalThis.fetch = (url, init) => {
      const requestURL =
        url instanceof Request ? url.url : url instanceof URL ? url.href : url;
      if (requestURL === 'https://tls-error.test/browser-tls-ok') {
        return Promise.reject(
          Object.assign(new TypeError('fetch failed'), {
            cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' },
          }),
        );
      }
      return nativeFetch(url, init);
    };
    const report = await crawl(root.origin, options, () => {}, browserVerifier);

    assert.deepEqual(
      browserChecks.toSorted((left, right) => left.localeCompare(right)),
      [
        `${external.origin}/browser-ok`,
        `${external.origin}/still-forbidden`,
        'https://tls-error.test/browser-tls-ok',
      ],
    );
    assert.equal(browserClosed, true);
    assert.deepEqual(
      report.failures.map(({ status, url }) => ({ status, url })),
      [{ status: 403, url: `${external.origin}/still-forbidden` }],
    );
    const recovered = report.results.find(({ url }) =>
      url.endsWith('/browser-ok'),
    );
    assert.ok(recovered);
    assert.equal(recovered.ok, true);
    assert.equal(recovered.status, 200);
  } finally {
    globalThis.fetch = nativeFetch;
    await root.stop();
    await external.stop();
  }
});

test('browser-confirmed 304 revalidation is not a redirect error', async () => {
  const external = await startServer((_request, response) => {
    response.statusCode = 403;
    response.end('forbidden to non-browser clients');
  });
  const root = await startServer((_request, response) => {
    html(response, `<a href="${external.origin}/cached">cached</a>`);
  });
  const browserVerifier = {
    async close() {},
    async verify(url) {
      return {
        finalUrl: url,
        redirects: [],
        status: 304,
      };
    },
  };
  const { options } = parseArguments([root.origin, '--delay=0', '--retries=0']);

  try {
    const report = await crawl(root.origin, options, () => {}, browserVerifier);
    assert.equal(report.failures.length, 0);
    const cached = report.results.find(({ url }) => url.endsWith('/cached'));
    assert.ok(cached);
    assert.equal(cached.ok, true);
    assert.equal(cached.status, 304);
  } finally {
    await root.stop();
    await external.stop();
  }
});

test('browser-only redirects obey the configured maximum', async () => {
  const external = await startServer((_request, response) => {
    response.statusCode = 403;
    response.end('forbidden to non-browser clients');
  });
  const root = await startServer((_request, response) => {
    html(response, `<a href="${external.origin}/challenge">challenge</a>`);
  });
  const browserVerifier = {
    async close() {},
    async verify(url) {
      return {
        finalUrl: `${external.origin}/final`,
        redirects: [
          {
            from: url,
            status: 302,
            to: `${external.origin}/final`,
          },
        ],
        status: 200,
      };
    },
  };
  const { options } = parseArguments([
    root.origin,
    '--delay=0',
    '--max-redirects=0',
    '--retries=0',
  ]);

  try {
    const report = await crawl(root.origin, options, () => {}, browserVerifier);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].kind, 'redirect-error');
    assert.equal(report.failures[0].error, 'Exceeded 0 redirect hops');
    assert.equal(report.failures[0].finalUrl, `${external.origin}/final`);
    assert.deepEqual(report.failures[0].redirects, [
      {
        from: `${external.origin}/challenge`,
        status: 302,
        to: `${external.origin}/final`,
      },
    ]);
  } finally {
    await root.stop();
    await external.stop();
  }
});

test('browser verification rejects a final unfollowed redirect response', async () => {
  const external = await startServer((_request, response) => {
    response.statusCode = 403;
    response.end('forbidden to non-browser clients');
  });
  const root = await startServer((_request, response) => {
    html(response, `<a href="${external.origin}/challenge">challenge</a>`);
  });
  const browserVerifier = {
    async close() {},
    async verify(url) {
      return {
        finalUrl: url,
        redirects: [],
        status: 302,
      };
    },
  };
  const { options } = parseArguments([root.origin, '--delay=0', '--retries=0']);

  try {
    const report = await crawl(root.origin, options, () => {}, browserVerifier);
    assert.equal(report.failures.length, 1);
    assert.equal(report.failures[0].kind, 'redirect-error');
    assert.equal(
      report.failures[0].error,
      'Browser navigation stopped at HTTP 302',
    );
    assert.equal(report.failures[0].status, 302);
  } finally {
    await root.stop();
    await external.stop();
  }
});

test('timeouts are reported as link failures and retry delays are capped and deterministic', async () => {
  const server = await startServer((_request, response) => {
    setTimeout(() => response.end('late'), 100);
  });

  try {
    const result = await runChecker([
      server.origin,
      '--format=json',
      '--timeout=20',
      '--retries=0',
      '--delay=0',
    ]);
    assert.equal(result.code, 1, result.stderr);
    const report = jsonResult(result);
    assert.equal(report.failures[0].status, null);
    assert.equal(report.failures[0].kind, 'request-error');
    assert.equal(report.failures[0].error, 'Request timed out after 20ms');
  } finally {
    await server.stop();
  }

  assert.equal(
    retryDelayMilliseconds({
      attempt: 1,
      retryAfter: '120',
      url: 'https://example.test',
    }),
    30_000,
  );
  const delay = retryDelayMilliseconds({
    attempt: 2,
    retryAfter: null,
    url: 'https://example.test',
  });
  assert.equal(
    delay,
    retryDelayMilliseconds({
      attempt: 2,
      retryAfter: null,
      url: 'https://example.test',
    }),
  );
  assert.ok(delay >= 1_000 && delay <= 1_200, delay);
});
