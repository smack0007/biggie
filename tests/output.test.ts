import assert from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { describe, it } from "node:test";

const dirname = import.meta.dirname ?? "";

const buildPath = resolve(join(dirname, "..", "build.sh"));
const textDecoder = new TextDecoder();

async function exec(command: string, args: string[] = []): Promise<[string, string]> {
  const denoCommand = new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, stderr } = await denoCommand.output();

  return [textDecoder.decode(stdout), textDecoder.decode(stderr)];
}

async function build(file: string): Promise<string> {
  const outputFile = resolve(dirname, "tmp", basename(file));

  const [stdout, stderr] = await exec(buildPath, [resolve(file), outputFile]);

  if (stderr != "") {
    throw new Error(stderr);
  }

  if (stdout != "") {
    console.info("BUILD OUTPUT:", stdout);
  }

  return outputFile;
}

const sourceFiles = (await readdir(join(dirname, "output"))).filter((file) => file.endsWith(".big")).sort();

describe("Biggie Output Tests", () => {
  for (const file of sourceFiles) {
    it(`${file}`, async () => {
      const filePath = join(dirname, "output", file);

      const expectedOutput = await readFile(filePath + ".out", "utf-8");

      const outputFile = await build(filePath);
      const [stdout] = await exec(outputFile);

      assert.equal(stdout.trim(), expectedOutput.trim());
    });
  }
});
