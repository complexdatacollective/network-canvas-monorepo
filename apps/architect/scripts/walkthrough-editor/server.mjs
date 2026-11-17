// A local editor for the stage walkthrough content.
//
//   pnpm --filter @codaco/architect walkthrough-editor
//
// then open http://localhost:4319. It reads and writes the markdown files in
// src/components/StageEditor/walkthrough/content directly, so with
// `pnpm --filter @codaco/architect dev` running alongside, every save updates
// the walkthrough panel in Architect live. Commit the files as usual.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Node strips the types from this file as it loads it.
import { SECTION_KEYS } from '../../../../packages/protocol-builder/src/sections/sectionKeys.ts';
import { CONTROLS, parse } from './format.mjs';
import { sceneNamesIn } from './sceneNames.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const walkthrough = join(here, '../../src/components/StageEditor/walkthrough');
const content = join(walkthrough, 'content');
const portArgument = process.argv.indexOf('--port');
const port =
  portArgument === -1 ? 4319 : Number(process.argv[portArgument + 1]);

const markdownIn = (folder) =>
  readdirSync(join(content, folder))
    .filter((name) => name.endsWith('.md'))
    .toSorted((a, b) => a.localeCompare(b));

const listFiles = () => [
  ...markdownIn('.').map((name) => name),
  ...markdownIn('shared').map((name) => `shared/${name}`),
];

// Only the walkthrough files themselves can be read or written.
const resolveFile = (path) => {
  if (typeof path !== 'string' || !listFiles().includes(path)) return undefined;
  return join(content, path);
};

// The page's modules, served at their paths under apps/architect so that
// format.mjs's relative import of walkthroughFormat.ts resolves in the browser
// as it does in Node. The browser cannot read TypeScript, so that file goes
// out with its types stripped (it uses only erasable syntax for this reason).
const architect = join(here, '../..');
const MODULES = {
  '/scripts/walkthrough-editor/format.mjs': (source) => source,
  '/src/components/StageEditor/walkthrough/walkthroughFormat.ts': (source) =>
    stripTypeScriptTypes(source),
};

const sceneNames = () => {
  const registry = join(walkthrough, 'scenes/sceneRegistry.ts');
  return existsSync(registry)
    ? sceneNamesIn(readFileSync(registry, 'utf8'))
    : [];
};

const meta = () => {
  const values = {
    // Every section key a stage editor has, not only those already used.
    section: new Set(SECTION_KEYS),
    field: new Set(),
    // The controls outside the sections that carry data-walkthrough-control.
    control: new Set(CONTROLS),
  };
  const shared = {};
  const files = [];
  for (const path of listFiles()) {
    let doc;
    try {
      doc = parse(readFileSync(join(content, path), 'utf8'));
    } catch (error) {
      // Listed, so the page can say what to fix, but not editable here.
      files.push({ path, title: null, steps: 0, error: String(error.message) });
      continue;
    }
    const steps = doc.items.filter((item) => item.type === 'step');
    for (const step of steps) {
      for (const { name, value } of step.directives) values[name]?.add(value);
    }
    if (path.startsWith('shared/')) {
      shared[path.slice('shared/'.length, -'.md'.length)] = steps.map(
        (step) => step.title,
      );
    }
    files.push({ path, title: doc.title, steps: steps.length });
  }
  return {
    files,
    scenes: sceneNames(),
    sections: SECTION_KEYS,
    shared,
    values: Object.fromEntries(
      Object.entries(values).map(([name, set]) => [
        name,
        [...set].toSorted((a, b) => a.localeCompare(b)),
      ]),
    ),
  };
};

const send = (response, status, body, type = 'application/json') => {
  response.writeHead(status, {
    'content-type': `${type}; charset=utf-8`,
    'cache-control': 'no-store',
  });
  response.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
    });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });

const server = createServer(async (request, response) => {
  // Answer only pages on this machine's own address, so another website
  // cannot reach the files through a DNS name pointed at 127.0.0.1.
  const host = request.headers.host ?? '';
  if (host !== `localhost:${port}` && host !== `127.0.0.1:${port}`) {
    return send(response, 403, { error: 'Open the editor at localhost' });
  }
  const url = new URL(request.url ?? '/', `http://${host}`);
  try {
    if (request.method === 'GET' && url.pathname === '/') {
      return send(
        response,
        200,
        readFileSync(join(here, 'index.html'), 'utf8'),
        'text/html',
      );
    }
    if (request.method === 'GET' && Object.hasOwn(MODULES, url.pathname)) {
      const source = readFileSync(join(architect, url.pathname), 'utf8');
      return send(
        response,
        200,
        MODULES[url.pathname](source),
        'text/javascript',
      );
    }
    if (request.method === 'GET' && url.pathname === '/api/meta') {
      return send(response, 200, meta());
    }
    if (url.pathname === '/api/file') {
      const path = url.searchParams.get('path');
      const file = resolveFile(path);
      if (file === undefined)
        return send(response, 404, { error: `No walkthrough file ${path}` });
      const onDisk = readFileSync(file, 'utf8');
      if (request.method === 'GET')
        return send(response, 200, { path, source: onDisk });
      if (request.method === 'PUT') {
        const { base, source } = JSON.parse(await readBody(request));
        if (typeof source !== 'string')
          return send(response, 400, { error: 'No source sent' });
        // Refuse to overwrite a file that changed on disk since the page loaded
        // it (a git pull, or an edit in another editor), unless told to.
        if (base !== onDisk && url.searchParams.get('force') !== '1') {
          return send(response, 409, {
            error: 'Changed on disk',
            source: onDisk,
          });
        }
        writeFileSync(file, source);
        return send(response, 200, { path, source });
      }
    }
    return send(response, 404, { error: 'Not found' });
  } catch (error) {
    return send(response, 500, { error: String(error?.message ?? error) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Walkthrough editor: http://localhost:${port}`);
  console.log(`Editing ${content}`);
});
