import * as vscode from "vscode";

interface TestBlock {
  name: string;
  line: number;
}

/**
 * Parse test file source to find test() block positions.
 * Pure function — no VS Code dependency, easy to unit test.
 */
export function findTestBlocks(source: string): TestBlock[] {
  const blocks: TestBlock[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*test\s*\(\s*["'`](.+?)["'`]/);
    if (match) {
      blocks.push({ name: match[1], line: i });
    }
  }
  return blocks;
}

export class HealCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!document.fileName.match(/\.test\.(ts|js)$/)) return [];

    const blocks = findTestBlocks(document.getText());
    return blocks.map((block) => {
      const range = new vscode.Range(block.line, 0, block.line, 0);
      return new vscode.CodeLens(range, {
        title: "$(play) Investigate",
        command: "playwright-healer.runFile",
        arguments: [document.uri, block.name],
        tooltip: `Investigate "${block.name}" — run, observe, and report errors`,
      });
    });
  }
}
