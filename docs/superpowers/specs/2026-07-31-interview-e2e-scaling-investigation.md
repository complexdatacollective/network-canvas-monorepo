# Interview E2E runner scaling investigation

**Date:** 2026-07-31
**Status:** Benchmark instrumentation implemented; production remains at six
workers pending the controlled sweep

## Summary

The 12-core self-hosted runner is faster than GitHub-hosted execution, but the
historical data does not justify raising the production worker count blindly.
At six workers, Playwright keeps its scheduler 94.9% utilised. The constraint is
not poor test distribution; it is contention and pixel-snapshot stability.

The likely global optimum on the current machine is eight to ten workers. A
safer longer-term layout is ten to twelve workers for functional/ARIA matrix
projects while retaining six for pixel-visual projects. If hardware is upgraded,
24 strong physical cores with approximately 16–18 workers is the expected
latency knee; 32 cores offers diminishing returns for this suite.

## Observed workload

The representative successful self-hosted report contained 441 tests and
3,029.5 aggregate test-seconds. The current checkout lists 444 tests.
Playwright took 531.8 seconds with six workers:

```text
3029.5 / (531.8 × 6) = 94.9% scheduler utilisation
```

Across 67 recent successful self-hosted runs, the browser phase had an
8.6-minute median and 9.2-minute p90. Twenty-two runs required at least one
retry. Every parsable retry was in a pixel-visual project, with Firefox visual
captures the largest source.

| Project         | Tests | Aggregate work | Share |
| --------------- | ----: | -------------: | ----: |
| Chromium matrix |   237 |      22.10 min | 43.8% |
| Firefox visual  |    54 |       9.53 min | 18.9% |
| WebKit visual   |    54 |       8.00 min | 15.8% |
| Chromium visual |    54 |       4.71 min |  9.3% |
| WebKit matrix   |    21 |       3.37 min |  6.7% |
| Firefox matrix  |    21 |       2.79 min |  5.5% |

## Worker and core model

The contention-free projection below uses the observed per-test durations,
current project ordering, and approximately 80 seconds of fixed
install/build/project/report overhead.

| Workers |     Projected job time |
| ------: | ---------------------: |
|       6 | 10.0 min; 9.7 observed |
|       8 |                8.0 min |
|      10 |                6.8 min |
|      12 |                6.0 min |
|      16 |                5.1 min |
|      20 |                4.6 min |
|      24 |                4.2 min |
|      32 |                3.9 min |

These are optimistic lower bounds, not expected production results. Each worker
is an OS process with its own browser and may consume more than one logical CPU.
The actual sweep must record whether the runner's advertised 12 cores are
physical cores or SMT threads, aggregate test-duration inflation, memory, swap,
load, retries, and snapshot diffs.

| Hardware | Initial sweep  | Likely production range |
| -------: | -------------- | ----------------------: |
| 12 cores | 6, 8, 10, 12   |            8–10 workers |
| 16 cores | 8, 10, 12, 14  |           10–12 workers |
| 24 cores | 12, 16, 18, 20 |           16–18 workers |
| 32 cores | 16, 20, 24, 28 |           20–24 workers |

For this suite alone, benchmark the existing machine before buying hardware.
Twenty-four physical cores is the likely upgrade knee: the model gains less than
one additional minute by moving from the 24-core recommendation to 32 cores.

## Benchmark support

`CI and Release` workflow dispatches now accept:

- `interview_e2e_benchmark=true`
- `interview_e2e_runner=github-hosted|self-hosted`
- `interview_e2e_workers=<positive integer>`
- `interview_e2e_shard=<optional N/M>`

A benchmark dispatch skips normal quality and reporting jobs, records CPU
topology and memory, samples host load and Docker CPU/memory/PIDs every five
seconds, and retains the telemetry artifact for seven days.

Run all configurations on one unchanged SHA, interleaving worker counts so
cache warmth and thermal drift do not favour later runs:

1. Five self-hosted repetitions each at 6, 8, 10, and 12 workers.
2. Ten additional repetitions for the best two candidates.
3. Five hosted/four-worker controls.
4. Treat the first cold run separately.

Adopt a higher production count only if it improves p90 by at least 15%, does
not increase same-SHA retries or snapshot differences, does not swap or
thermally throttle, and inflates aggregate test duration by less than 10%.

## Split-worker option

Visual and nonvisual projects need not share one worker cap. Two Playwright
invocations with merged blob reports would allow functional/ARIA matrix work to
run at 10–12 workers while visual projects stay at the current six.

| Matrix workers | Visual workers | Projected job |
| -------------: | -------------: | ------------: |
|              8 |              6 |       9.0 min |
|             10 |              6 |       8.4 min |
|             12 |              6 |       8.0 min |
|             10 |              8 |       7.5 min |
|             12 |              8 |       7.1 min |

If crypto-heavy matrix scenarios become the next contention limit, tag and run
that small subset at two workers rather than lowering the whole matrix.

## Sharding

Playwright balances fully parallel shards by test count, not historical
duration. The current two-way split is therefore uneven:

| Shard | Current tests |  Historical work |
| ----- | ------------: | ---------------: |
| 1/2   |           222 | 20.89 worker-min |
| 2/2   |           222 | 29.53 worker-min |

The best two-runner assignment is shard 1 on GitHub-hosted/four workers and
shard 2 on private/six workers. Its estimated critical path is approximately
7.1 minutes, compared with 9.7 minutes for one private six-worker job, but it
duplicates install and build work. A single-slot private runner receives no
benefit from serial shards.

Production sharding requires separate shard jobs and an aggregate required
check:

1. Run with `fail-fast: false`, `PW_BLOB=1`, and unique shard artifacts.
2. Upload blob reports even for test failures.
3. Download and merge reports in an aggregate `interview-e2e` job.
4. Generate merged HTML and JSON before snapshot-only and flaky
   classification.
5. Fail the aggregate after reporting if either shard failed.

Use two shards only if the measured stable single-run configuration remains
above roughly seven minutes or hosted-fallback latency justifies the duplicated
setup. Three or four shards reduce wall time further but are not efficient for
the current suite.
