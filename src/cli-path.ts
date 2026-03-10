import { join, dirname } from "path";
import { existsSync } from "fs";
import * as vscode from "vscode";

const BIN_NAME = process.platform === "win32" ? "playwright-cli.cmd" : "playwright-cli";

/**
 * Resolve the local playwright-cli binary by walking up from the workspace root.
 * Handles monorepos and nested workspaces (e.g. sample-workspace inside a project).
 * Falls back to global "playwright-cli" if not found.
 */
export function getLocalCliBin(): string {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) return "playwright-cli";

  let dir = root;
  while (true) {
    const candidate = join(dir, "node_modules", ".bin", BIN_NAME);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return "playwright-cli"; // fallback to global
}
