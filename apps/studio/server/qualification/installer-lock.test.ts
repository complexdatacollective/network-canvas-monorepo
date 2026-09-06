import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { localDeployment } from './compose.ts';

it('the host entrypoint keeps a real Linux flock across the full child operation and releases it only afterward', async () => {
  const fixture = await localDeployment('installer-lock');
  const output = join(fixture.root, 'installer-root');
  await mkdir(output, { mode: 0o700 });
  const source = fileURLToPath(
    new URL('../../deployment/installer', import.meta.url),
  );
  try {
    const result = await fixture.execute('docker', [
      'run',
      '--rm',
      '--network=none',
      '--read-only',
      '--entrypoint',
      'node',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--mount',
      `type=bind,source=${source},target=/installer,readonly`,
      '--mount',
      `type=bind,source=${output},target=/qualification`,
      fixture.images.studio,
      '--input-type=module',
      '-e',
      `import assert from 'node:assert/strict';
      import { spawnSync } from 'node:child_process';
      import { install } from '/installer/install.mjs';
      const lock = '/qualification/installation/control/operation.lock';
      let commands = 0;
      install(['--directory', '/qualification/installation', '--expected-manifest-sha256', '1'.repeat(64)],
        (program, args, options) => {
          commands++;
          if (program === 'flock') return spawnSync(program, args, options);
          const child = spawnSync(process.execPath, ['-e',
            "const {spawnSync}=require('node:child_process'); const result=spawnSync('flock',['--exclusive','--nonblock',process.argv[1],'true']); process.exit(result.status===1?0:2);", lock],
            {stdio:['ignore','pipe','pipe',options.stdio[3]]});
          assert.equal(child.status, 0, 'another file open must be refused while the real operation child holds its inherited lock');
          assert.equal(spawnSync('flock',['--exclusive','--nonblock',lock,'true']).status,1,
            'the parent must retain the same lock after its child exits');
          return child;
        });
      assert.equal(commands,2);
      assert.equal(spawnSync('flock',['--exclusive','--nonblock',lock,'true']).status,0,
        'the completed operation must release its lock');
      process.stdout.write(JSON.stringify({kernelLock:true,competingOperation:'refused',released:true})+'\\n');`,
    ]);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      kernelLock: true,
      competingOperation: 'refused',
      released: true,
    });
  } finally {
    await fixture.dispose();
  }
});
