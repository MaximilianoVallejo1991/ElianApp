/**
 * Deterministic N-party barrier for concurrency tests. Timer-free.
 *
 * Every caller parks on the SAME promise; the Nth arrival resolves it, so all
 * parties resume on one microtask tick with no wall-clock dependency.
 * `setTimeout`-based race tests are PROHIBITED in this repo — they produced
 * ~40% intermittent failures on the sibling project.
 *
 * Usage: install `await wait()` inside the mockImplementation of the read that
 * carries the state being guarded, so no caller can reach its guard-write
 * until every caller has passed its read-check. That IS the TOCTOU window.
 *
 * Not a `.test.js` file on purpose — Vitest's test-file glob only picks up
 * `*.test.js`, so this helper is importable by multiple suites
 * (`closure-concurrency.test.js`, `payment-concurrency.test.js`) without
 * being collected as its own test suite.
 */
export function createBarrier(parties) {
  let arrived = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });

  return function wait() {
    arrived += 1;
    if (arrived >= parties) release();
    return gate;
  };
}
