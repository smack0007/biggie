export async function formatFile(path: string): Promise<void> {
  await new Deno.Command(Deno.execPath(), { args: ["fmt", path] }).output();
}
