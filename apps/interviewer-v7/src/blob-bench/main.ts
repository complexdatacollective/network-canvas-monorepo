import { runBench } from './bench';

const statusEl = document.getElementById('status');
const outputEl = document.getElementById('output');

const formatResults = (results: ReturnType<typeof runBench>) => {
  const lines: string[] = [];
  lines.push(`config: ${JSON.stringify(results.config)}`);
  lines.push('');
  for (const [label, trials] of Object.entries(results.trials)) {
    lines.push(`== ${label} ==`);
    const widths = [10, 10, 10, 10, 10, 10];
    const cols = ['mean_ms', 'med_ms', 'p95_ms', 'p99_ms', 'min_ms', 'max_ms'];
    lines.push(cols.map((c, i) => c.padStart(widths[i] ?? 0)).join(' '));
    for (const t of trials) {
      lines.push(
        [t.mean, t.median, t.p95, t.p99, t.min, t.max]
          .map((v, i) => v.toFixed(3).padStart(widths[i] ?? 0))
          .join(' '),
      );
    }
    const meanOfMeans =
      trials.reduce((s, t) => s + t.mean, 0) / Math.max(trials.length, 1);
    const meanOfMedians =
      trials.reduce((s, t) => s + t.median, 0) / Math.max(trials.length, 1);
    lines.push(
      `aggregate: mean-of-means=${meanOfMeans.toFixed(3)}ms  mean-of-medians=${meanOfMedians.toFixed(3)}ms`,
    );
    lines.push('');
  }
  return lines.join('\n');
};

const main = () => {
  if (statusEl) statusEl.textContent = 'running… (this takes a few seconds)';

  Object.assign(window, { runBench });

  // Defer one frame so the DOM paints "running…" before we block on the bench.
  requestAnimationFrame(() => {
    const results = runBench();
    if (statusEl) statusEl.textContent = 'done';
    if (outputEl) outputEl.textContent = formatResults(results);
    Object.assign(window, { __benchResults: results });
    document.title = 'bench-done';
    // eslint-disable-next-line no-console
    console.log('[bench] results', results);
  });
};

main();
