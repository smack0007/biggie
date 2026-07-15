import { bool, EOL, uint } from "./shims.ts";

export interface OutputWriter {
  hasContents(): bool;
  lineIsBeingWritten(): bool;
  indentLevel(): uint;
  createPlaceholder(): OutputWriter;
  indent(): void;
  unindent(): void;
  append(value: string): void;
  appendLine(value?: string): void;
  toString(): string;
}

class OutputWriterInternal implements OutputWriter {
  _data: (string | OutputWriterInternal)[] = [""];
  _indentLevel: uint = 0;
  _newLine: string;

  constructor(
    indentLevel: uint,
    newLine: string,
  ) {
    this._indentLevel = indentLevel;
    this._newLine = newLine;
  }

  private getCurrentLine(): string {
    return this._data[this._data.length - 1] as string;
  }

  private setCurrentLine(value: string) {
    this._data[this._data.length - 1] = value;
  }

  public hasContents(): bool {
    return this._data.length > 1 || (
      typeof this._data[0] == "string" ? this._data[0].length >= 1 : this._data[0].hasContents()
    );
  }

  public lineIsBeingWritten(): boolean {
    return this.getCurrentLine().length > 0;
  }

  public indentLevel(): uint {
    return this._indentLevel;
  }

  public createPlaceholder(): OutputWriter {
    if (this.lineIsBeingWritten()) {
      throw new Error("createPlaceholder can only be called when a line is not currently being written.");
    }

    const placeholder = new OutputWriterInternal(
      this._indentLevel,
      this._newLine,
    );
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

  public append(value: string): void {
    if (!value) {
      return;
    }

    if (!this.lineIsBeingWritten) {
      this.setCurrentLine(this.getCurrentLine() + "\t".repeat(this._indentLevel));
    }
    this.setCurrentLine(this.getCurrentLine() + value);
  }

  public appendLine(value: string = ""): void {
    if (value) {
      this.append(value);
    }
    this._data.push("");
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
      .join(this._newLine);
  }
}

export interface OutputWriterOptions {
  indentLevel?: uint;
  newLine?: string;
}

export function makeOutputWriter(options: OutputWriterOptions = {}): OutputWriter {
  return new OutputWriterInternal(
    options.indentLevel ?? 0,
    options.newLine ?? EOL,
  );
}
