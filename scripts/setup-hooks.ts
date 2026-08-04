#!/usr/bin/env -S deno run --allow-run --allow-read

async function setupHooks(): Promise<void> {
  const command = new Deno.Command("git", {
    args: ["config", "core.hooksPath", ".githooks"],
  });

  const { code, stderr } = await command.output();

  if (code !== 0) {
    const errorMessage = new TextDecoder().decode(stderr);
    throw new Error(`Failed to set git hooks path: ${errorMessage}`);
  }

  console.log("Git hooks configured: .githooks/");
  console.log("  pre-commit: fmt, lint, test");
  console.log("  pre-push: full quality gate");
}

if (import.meta.main) {
  await setupHooks();
}
