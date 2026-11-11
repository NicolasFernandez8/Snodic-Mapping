/**
 * Candados compartidos entre trabajos que corren en paralelo dentro del worker:
 * - gpu: la IA local usa la placa de video de a un pedido por vez (dos a la vez serían más lentos).
 * - nominatim: OpenStreetMap pide como máximo 1 pedido por segundo (política de uso justo).
 */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Cola que respeta un intervalo mínimo entre pedidos (aunque los pidan varios trabajos a la vez). */
export class RateLimiter {
  private last = 0;
  private mutex = new Mutex();
  constructor(private minIntervalMs: number) {}
  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.mutex.run(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        this.last = Date.now();
      }
    });
  }
}

export const gpu = new Mutex();
export const nominatim = new RateLimiter(1100);
