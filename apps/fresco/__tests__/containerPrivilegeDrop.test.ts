import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Nothing in this repository builds Fresco's container image — the Dockerfile
 * runs in the mirror repository after a release — so a mistake in it is not
 * caught by any CI job here. It surfaces when the image is published, which is
 * the worst moment to find it. These assertions stand in for that missing build.
 *
 * What they protect is the arrangement that lets a self-hosted deployment write
 * Next's incremental cache. The image creates `.next/cache` at build time, and
 * the entrypoint starts as root purely to repair its ownership when a *bind*
 * mount has replaced it with a host-owned directory (a *named* volume inherits
 * the image's ownership, so that case needs nothing at runtime). It then drops
 * to `nextjs` before running anything else.
 *
 * Two silent failure modes make this worth asserting rather than trusting:
 * re-adding a `USER` directive would leave the entrypoint unable to repair
 * anything while looking perfectly correct, and dropping the `su-exec` install
 * would leave a container that refuses to boot. Neither is visible without
 * building the image. See #2090.
 */
describe('Fresco container privilege drop', () => {
  const dockerfile = readFileSync(
    path.join(process.cwd(), 'Dockerfile'),
    'utf8',
  );
  const entrypoint = readFileSync(
    path.join(process.cwd(), 'scripts/migrate-and-start.sh'),
    'utf8',
  );

  it('installs the helper the entrypoint drops privileges with', () => {
    // Without this the entrypoint refuses to start rather than serving as
    // root, so losing it takes the deployment down instead of weakening it.
    expect(dockerfile).toContain('apk add --no-cache su-exec');
  });

  it('declares no USER, because the entrypoint drops privileges instead', () => {
    // A `USER nextjs` here would mean the entrypoint never holds the privilege
    // it needs to chown a bind-mounted cache directory — the whole point of
    // this arrangement — while still appearing to work.
    expect(dockerfile).not.toMatch(/^USER\s/m);
  });

  it('creates the cache directory so a named volume inherits its ownership', () => {
    // The Docker daemon initialises a named volume from the image's directory,
    // ownership included, and can only do that for a path that already exists.
    expect(dockerfile).toMatch(/mkdir -p \.next\/cache/);
    expect(dockerfile).toMatch(/chown[^\n]*nextjs:nodejs[^\n]*\.next/);
  });

  it('makes the cache directory writable by group 0', () => {
    // Platforms that impose an arbitrary UID (OpenShift, or any `runAsUser`
    // that is neither 0 nor 1001) always place it in group 0, so group-0 write
    // permission is the only way such a deployment can use the cache at all.
    expect(dockerfile).toMatch(/chgrp 0 \.next \.next\/cache/);
    expect(dockerfile).toMatch(/chmod g\+rwX \.next \.next\/cache/);
  });

  describe('the entrypoint', () => {
    // The root-only block, isolated so the assertions below are about what can
    // and cannot happen while the process still has privilege.
    const rootBranch =
      /if \[ "\$\(id -u\)" = '0' \]; then\n([\s\S]*?)\nfi\n/.exec(entrypoint);

    it('has a root-only block at all', () => {
      expect(rootBranch).not.toBeNull();
    });

    it('repairs cache ownership and then execs away its privilege', () => {
      const body = rootBranch?.[1] ?? '';

      expect(body).toMatch(/chown[^\n]*nextjs:nodejs[^\n]*\.next\/cache/);
      // `exec` rather than a subshell: the server must replace this process so
      // it stays PID 1 and keeps receiving signals directly.
      expect(body).toContain('exec su-exec nextjs:nodejs');
    });

    it('never reaches the server while still root', () => {
      const body = rootBranch?.[1] ?? '';

      // The only two ways out of the root block are dropping privileges or
      // exiting. If `node` could be reached from inside it, a deployment would
      // silently serve as root.
      expect(body).not.toMatch(/exec node/);
      expect(body).toContain('exit 1');
    });

    it('refuses to start rather than serve as root it cannot drop', () => {
      const body = rootBranch?.[1] ?? '';

      // Fail closed. Serving as root because a package went missing is worse
      // than not serving: it is invisible, and it persists.
      expect(body).toMatch(/command -v su-exec/);
      expect(body).toMatch(/refusing to start as root/);
    });

    it('drops privileges before running the migrations', () => {
      // `prisma generate` and the setup scripts write to disk. Running them as
      // root would leave root-owned files behind for the server to trip over,
      // and would widen what a compromised migration could reach.
      const dropIndex = entrypoint.indexOf('exec su-exec nextjs:nodejs');
      const firstMigration = entrypoint.indexOf('"$PRISMA" generate');

      expect(dropIndex).toBeGreaterThan(-1);
      expect(firstMigration).toBeGreaterThan(-1);
      expect(dropIndex).toBeLessThan(firstMigration);
    });

    it('still serves when the deployment pinned a non-root user', () => {
      // A deployment with `runAsNonRoot: true` never enters the root block. It
      // must warn about an unwritable cache and carry on, not exit: running
      // uncached is a degraded deployment, not a broken one.
      const afterRootBranch = entrypoint.slice(
        (rootBranch?.index ?? 0) + (rootBranch?.[0]?.length ?? 0),
      );

      expect(afterRootBranch).toMatch(/is not writable/);
      expect(afterRootBranch).toContain('exec node server.js');
      // The warning path must not be able to abort the boot.
      expect(afterRootBranch).not.toMatch(/exit 1/);
    });
  });
});
