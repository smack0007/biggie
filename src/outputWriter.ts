import { EOL } from "node:os";

export class OutputWriter {
  _data: string[] = [""];
  _indentLevel = 0;
  _skipIndentForLine = false;

  private get currentLine(): string {
    return this._data[this._data.length - 1] as string;
  }

  private set currentLine(value: string) {
    this._data[this._data.length - 1] = value;
  }

  public get hasContents(): boolean {
    return this._data.length > 1 || this._data[0].length >= 1;
  }

  public get lineIsBeingWritten(): boolean {
    return this.currentLine.length > 0;
  }

  public get indentLevel(): number {
    return this._indentLevel;
  }

  public indent(): void {
    this._indentLevel += 1;
  }

  public unindent(): void {
    this._indentLevel -= 1;
  }

  public setIndentLevel(level: number): void {
    this._indentLevel = level;
  }

  public clear(): void {
    this._data = [""];
  }

  public append(value: string): void {
    if (!value) {
      return;
    }

    if (!this.lineIsBeingWritten) {
      this.currentLine += "\t".repeat(this._indentLevel);
    }
    this.currentLine += value;
  }

  public appendLine(value: string = ""): void {
    if (value) {
      this.append(value);
    }
    this._data.push("");
  }

  public toString(): string {
    return this._data.join(EOL);
  }
}
