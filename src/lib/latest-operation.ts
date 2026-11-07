export class LatestOperation {
  private generation = 0;

  start(): number { return ++this.generation; }
  invalidate(): void { this.generation++; }
  isCurrent(generation: number): boolean { return generation === this.generation; }
}
