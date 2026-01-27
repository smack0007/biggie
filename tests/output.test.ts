import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";

const dirname = import.meta.dirname ?? "";

const buildPath = path.resolve(path.join(dirname, "..", "build.sh"));
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
  const outputFile = path.resolve(dirname, "tmp", path.basename(file));

  const [stdout, stderr] = await exec(buildPath, [path.resolve(file), outputFile]);

  if (stderr != "") {
    throw new Error(stderr);
  }

  if (stdout != "") {
    console.info("BUILD OUTPUT:", stdout);
  }

  return outputFile;
}

for (const file of (await fs.readdir(path.join(dirname, "output"))).filter((file) => file.endsWith(".big"))) {
  Deno.test(file, async () => {
    const filePath = path.join(dirname, "output", file);

    const expectedOutput = await fs.readFile(filePath + ".out", "utf-8");

    const outputFile = await build(filePath);
    const [stdout] = await exec(outputFile);

    assert.equal(stdout.trim(), expectedOutput.trim());
  });
}
