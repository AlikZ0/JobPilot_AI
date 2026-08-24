import { describe, expect, it } from 'vitest';
import { JobQueue } from '@/background/jobQueue';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('JobQueue', () => {
  it('runs every task and drains', async () => {
    const done: string[] = [];
    const queue = new JobQueue<string>({ concurrency: 1, delayMs: 0 });
    for (const id of ['a', 'b', 'c']) {
      queue.add({
        id,
        run: async () => {
          done.push(id);
          return id;
        },
      });
    }
    await queue.run();
    expect(done).toEqual(['a', 'b', 'c']);
    expect(queue.pending).toBe(0);
  });

  it('caps concurrency at three even when asked for more', async () => {
    let active = 0;
    let peak = 0;
    const queue = new JobQueue<void>({ concurrency: 10, delayMs: 0 });
    for (let i = 0; i < 12; i++) {
      queue.add({
        id: String(i),
        run: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await tick(5);
          active -= 1;
        },
      });
    }
    await queue.run();
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('applies the delay between task starts', async () => {
    const starts: number[] = [];
    const queue = new JobQueue<void>({ concurrency: 1, delayMs: 40 });
    for (let i = 0; i < 3; i++) {
      queue.add({
        id: String(i),
        run: async () => {
          starts.push(Date.now());
        },
      });
    }
    await queue.run();
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(30);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(30);
  });

  it('keeps going after a task throws and reports the error', async () => {
    const errors: string[] = [];
    const completed: string[] = [];
    const queue = new JobQueue<void>(
      { concurrency: 1, delayMs: 0 },
      {
        onTaskError: (task) => errors.push(task.id),
        onTaskDone: (task) => completed.push(task.id),
      },
    );
    queue.add({
      id: 'boom',
      run: async () => {
        throw new Error('nope');
      },
    });
    queue.add({ id: 'fine', run: async () => undefined });
    await queue.run();
    expect(errors).toEqual(['boom']);
    expect(completed).toEqual(['fine']);
  });

  it('stops immediately and abandons pending tasks', async () => {
    const done: string[] = [];
    const queue = new JobQueue<void>({ concurrency: 1, delayMs: 0 });
    for (let i = 0; i < 6; i++) {
      queue.add({
        id: String(i),
        run: async () => {
          done.push(String(i));
          if (i === 1) queue.stop();
          await tick(1);
        },
      });
    }
    await queue.run();
    expect(done.length).toBeLessThanOrEqual(2);
    expect(queue.signal.aborted).toBe(true);
  });

  it('pauses and resumes', async () => {
    const done: string[] = [];
    const queue = new JobQueue<void>({ concurrency: 1, delayMs: 0 });
    for (const id of ['a', 'b', 'c']) {
      queue.add({
        id,
        run: async () => {
          done.push(id);
          if (id === 'a') queue.pause();
        },
      });
    }
    const running = queue.run();
    await tick(20);
    expect(done).toEqual(['a']);
    queue.resume();
    await running;
    expect(done).toEqual(['a', 'b', 'c']);
  });

  it('reports the drained event once', async () => {
    let drained = 0;
    const queue = new JobQueue<void>(
      { concurrency: 2, delayMs: 0 },
      { onDrained: () => (drained += 1) },
    );
    queue.add({ id: '1', run: async () => undefined });
    await queue.run();
    expect(drained).toBe(1);
  });
});
