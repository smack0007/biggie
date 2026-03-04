import { EOL } from "node:os";
import { bool } from "./shims.ts";

export class OutputWriter {
  _data: (string | OutputWriter)[] = [""];
  _indentLevel = 0;
  _skipIndentForLine = false;

  private get currentLine(): string {
    return this._data[this._data.length - 1] as string;
  }

  private set currentLine(value: string) {
    this._data[this._data.length - 1] = value;
  }

  public get hasContents(): boolean {
    return this._data.length > 1 || (
      typeof this._data[0] == "string" ? this._data[0].length >= 1 : this._data[0].hasContents
    );
  }

  public get lineIsBeingWritten(): boolean {
    return this.currentLine.length > 0;
  }

  public get indentLevel(): number {
    return this._indentLevel;
  }

  public createPlaceholder(): OutputWriter {
    if (this.lineIsBeingWritten) {
      throw new Error("createPlaceholder can only be called when a line is not currently being written.");
    }

    const placeholder = new OutputWriter();
    this._data[this._data.length - 1] = placeholder;
    this._data.push("");

    return placeholder;
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

  public includes(searchString: string): bool {
    for (const line of this._data) {
      if (line.includes(searchString)) {
        return true;
      }
    }

    return false;
  }

  public toString(): string {
    return this._data
      .map((line) => {
        if (typeof line == "string") {
          return line;
        }

        // line is placeholder
        line = line.toString();

        // if the placeholder ends with newline, remove it as when join everything
        // back together we add a newline.
        if (line.endsWith("\n")) {
          line = line.substring(0, line.length - 1);
        }

        return line;
      })
      .join(EOL);
  }
}
