import { sleep } from '@/utils/time';
import { createLogger } from '@/utils/logger';

const log = createLogger('queue');

export interface QueueOptions {
  concurrency: number;
  delayMs: number;
}

export type QueueState = 'idle' | 'running' | 'paused' | 'stopping' | 'stopped';

export interface QueueTask<T> {
  id: string;
  run: (signal: AbortSignal) => Promise<T>;
}

export interface QueueEvents<T> {
  onTaskStart?(task: QueueTask<T>): void;
  onTaskDone?(task: QueueTask<T>, value: T): void;
  onTaskError?(task: QueueTask<T>, error: unknown): void;
  onDrained?(): void;
}

/**
 * Очередь задач с ограничением скорости. Параллельность жёстко ограничена тремя,
 * между стартами задач выдерживается пауза — чтобы анализ не забрасывал job-сайт
 * запросами.
 */
export class JobQueue<T> {
  private readonly tasks: QueueTask<T>[] = [];
  private readonly controller = new AbortController();
  private active = 0;
  private state: QueueState = 'idle';
  private resumeSignal: (() => void) | null = null;
  private lastStart = 0;

  constructor(
    private readonly options: QueueOptions,
    private readonly events: QueueEvents<T> = {},
  ) {
    this.options = {
      concurrency: Math.max(1, Math.min(3, options.concurrency)),
      delayMs: Math.max(0, options.delayMs),
    };
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get currentState(): QueueState {
    return this.state;
  }

  get pending(): number {
    return this.tasks.length;
  }

  get running(): number {
    return this.active;
  }

  add(task: QueueTask<T>): void {
    this.tasks.push(task);
  }

  addAll(tasks: QueueTask<T>[]): void {
    this.tasks.push(...tasks);
  }

  private setState(next: QueueState): void {
    this.state = next;
  }

  pause(): void {
    if (this.state === 'running') this.setState('paused');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.setState('running');
    this.resumeSignal?.();
    this.resumeSignal = null;
  }

  stop(): void {
    this.setState('stopping');
    this.tasks.length = 0;
    this.controller.abort();
    this.resumeSignal?.();
    this.resumeSignal = null;
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.state === 'paused') {
      await new Promise<void>((resolve) => {
        this.resumeSignal = resolve;
      });
    }
  }

  /** Работает, пока очередь не опустеет или её не остановят. */
  async run(): Promise<void> {
    if (this.state === 'running') return;
    this.setState('running');
    const workers = Array.from({ length: this.options.concurrency }, () => this.worker());
    await Promise.all(workers);
    if (this.state !== 'stopping') this.setState('stopped');
    this.events.onDrained?.();
  }

  private async worker(): Promise<void> {
    for (;;) {
      await this.waitWhilePaused();
      if (this.state === 'stopping' || this.controller.signal.aborted) return;
      const task = this.tasks.shift();
      if (!task) return;

      const since = Date.now() - this.lastStart;
      if (since < this.options.delayMs) {
        try {
          await sleep(this.options.delayMs - since, this.controller.signal);
        } catch {
          return; // отменили во время ожидания
        }
      }
      this.lastStart = Date.now();
      this.active += 1;
      this.events.onTaskStart?.(task);
      try {
        const value = await task.run(this.controller.signal);
        this.events.onTaskDone?.(task, value);
      } catch (error) {
        if (this.controller.signal.aborted) {
          this.active -= 1;
          return;
        }
        log.debug('задача очереди упала', { id: task.id });
        this.events.onTaskError?.(task, error);
      } finally {
        this.active = Math.max(0, this.active - 1);
      }
    }
  }
}
