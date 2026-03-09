import * as vscode from "vscode";
import { spawn } from "child_process";

interface ExecuteCliInput {
  command: string;
}

interface ParsedOutput {
  pageUrl?: string;
  pageTitle?: string;
  snapshotFile?: string;
  screenshotFile?: string;
  generatedCode?: string;
}

/**
 * Parse structured output from playwright-cli commands.
 * Exported separately for unit testing without vscode dependency.
 */
export function parseCliOutput(stdout: string): ParsedOutput {
  const result: ParsedOutput = {};

  const urlMatch = stdout.match(/- Page URL:\s*(.+)/);
  if (urlMatch) result.pageUrl = urlMatch[1].trim();

  const titleMatch = stdout.match(/- Page Title:\s*(.+)/);
  if (titleMatch) result.pageTitle = titleMatch[1].trim();

  const snapMatch = stdout.match(/\[Snapshot\]\((.+?)\)/);
  if (snapMatch) result.snapshotFile = snapMatch[1];

  const screenshotMatch = stdout.match(/\[Screenshot[^\]]*\]\((.+?)\)/);
  if (screenshotMatch) result.screenshotFile = screenshotMatch[1];

  const codeMatch = stdout.match(/```js\n([\s\S]*?)```/);
  if (codeMatch) result.generatedCode = codeMatch[1].trim();

  return result;
}

export class ExecuteCliTool implements vscode.LanguageModelTool<ExecuteCliInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ExecuteCliInput>,
    _token: vscode.CancellationToken
  ) {
    return {
      invocationMessage: `Running: playwright-cli ${options.input.command}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ExecuteCliInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { command } = options.input;
    const { stdout, stderr } = await this.exec(command, token);
    const parsed = parseCliOutput(stdout);

    const result = JSON.stringify({ stdout, stderr, ...parsed }, null, 2);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(result),
    ]);
  }

  private exec(
    command: string,
    token: vscode.CancellationToken
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const args = command.split(/\s+/);
      const proc = spawn("playwright-cli", args, {
        shell: true,
        timeout: 30_000,
      });

      let stdout = "";
      let stderr = "";

      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));

      token.onCancellationRequested(() => proc.kill());

      proc.on("close", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`playwright-cli failed (code ${code}): ${stderr}`));
          return;
        }
        resolve({ stdout, stderr });
      });

      proc.on("error", reject);
    });
  }
}
