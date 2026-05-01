export class LineBuffer {
  private buffer = "";

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: Buffer | string): void {
    this.buffer += chunk.toString();

    let nextNewline = this.buffer.indexOf("\n");
    while (nextNewline !== -1) {
      const line = this.buffer.slice(0, nextNewline).replace(/\r$/, "");
      this.buffer = this.buffer.slice(nextNewline + 1);
      this.onLine(line);
      nextNewline = this.buffer.indexOf("\n");
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      this.onLine(this.buffer.replace(/\r$/, ""));
      this.buffer = "";
    }
  }
}
