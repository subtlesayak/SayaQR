export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
}

export class ModelJob {
  private cancelActive?: () => void;
  constructor(private readonly createWorker: () => WorkerLike) {}

  cancel(): void { this.cancelActive?.(); }

  run<T>(request: unknown, progress: (stage: string) => void = () => {}): Promise<T> {
    this.cancel();
    return new Promise<T>((resolve, reject) => {
      const worker = this.createWorker();
      let finished = false;
      const finish = (error?: Error, result?: T): void => {
        if (finished) return;
        finished = true;
        worker.terminate();
        this.cancelActive = undefined;
        if (error) reject(error); else resolve(result!);
      };
      this.cancelActive = () => finish(new DOMException("Cancelled", "AbortError"));
      worker.onmessage = ({ data }) => {
        if (finished) return;
        if (data.stage) progress(data.stage);
        else if (data.error) finish(new Error(data.error));
        else finish(undefined, data.result);
      };
      worker.onerror = () => finish(new Error("Local 3D worker failed"));
      worker.postMessage(request);
    });
  }
}
