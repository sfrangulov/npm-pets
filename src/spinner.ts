const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private timer: NodeJS.Timeout | undefined;
  private idx = 0;
  private text = "";
  private active = false;

  constructor(private readonly stream: NodeJS.WriteStream) {}

  start(text: string): void {
    if (!this.stream.isTTY) return;
    this.text = text;
    this.active = true;
    this.stream.write("\x1B[?25l");
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % FRAMES.length;
      this.render();
    }, 80);
  }

  update(text: string): void {
    this.text = text;
    if (this.active) this.render();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.stream.cursorTo(0);
    this.stream.clearLine(1);
    this.stream.write("\x1B[?25h");
  }

  private render(): void {
    this.stream.cursorTo(0);
    this.stream.write(`${FRAMES[this.idx]} ${this.text}`);
    this.stream.clearLine(1);
  }
}
