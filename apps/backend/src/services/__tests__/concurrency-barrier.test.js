import { describe, it, expect } from 'vitest';
import { createBarrier } from './concurrency-barrier.js';

describe('createBarrier', () => {
  it('does not release any party before the Nth arrival', async () => {
    const wait = createBarrier(2);
    let released = false;

    const first = wait().then(() => {
      released = true;
    });

    // Give the microtask queue a tick — if the barrier released early,
    // `released` would already be true by now.
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);

    const second = wait();
    await Promise.all([first, second]);

    expect(released).toBe(true);
  });

  it('resolves the SAME shared promise for every caller', () => {
    const wait = createBarrier(3);

    const p1 = wait();
    const p2 = wait();
    const p3 = wait();

    expect(p1).toBe(p2);
    expect(p2).toBe(p3);
  });

  it('releases all parties on a single microtask tick once the Nth caller arrives', async () => {
    const wait = createBarrier(2);
    const order = [];

    const first = wait().then(() => order.push('first'));
    const second = wait().then(() => order.push('second'));

    await Promise.all([first, second]);

    expect(order).toHaveLength(2);
    expect(order).toContain('first');
    expect(order).toContain('second');
  });
});
