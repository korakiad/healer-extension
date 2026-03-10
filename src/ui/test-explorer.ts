import * as vscode from "vscode";
import { findTestBlocks } from "./codelens.js";

// ── Tree Items ─────────────────────────────────

export class TestFileItem extends vscode.TreeItem {
  constructor(
    public readonly resourceUri: vscode.Uri,
    public readonly children: TestCaseItem[],
  ) {
    const fileName = resourceUri.path.split("/").pop() ?? resourceUri.fsPath;
    super(fileName, vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon("file-code");
    this.contextValue = "testFile";
    this.tooltip = resourceUri.fsPath;
    this.description = vscode.workspace.asRelativePath(resourceUri, false);
  }
}

export class TestCaseItem extends vscode.TreeItem {
  constructor(
    public readonly testName: string,
    public readonly fileUri: vscode.Uri,
    public readonly line: number,
  ) {
    super(testName, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("beaker");
    this.contextValue = "testCase";
    this.tooltip = `Line ${line + 1}: ${testName}`;
    this.command = {
      title: "Go to test",
      command: "vscode.open",
      arguments: [fileUri, { selection: new vscode.Range(line, 0, line, 0) }],
    };
  }
}

// ── Tree Data Provider ─────────────────────────

type TreeNode = TestFileItem | TestCaseItem;

export class TestExplorerProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private fileItems: TestFileItem[] = [];

  async refresh(): Promise<void> {
    const files = await vscode.workspace.findFiles(
      "**/*.test.ts",
      "**/node_modules/**",
    );
    files.sort((a, b) => a.fsPath.localeCompare(b.fsPath));

    this.fileItems = [];
    for (const uri of files) {
      const doc = await vscode.workspace.openTextDocument(uri);
      const blocks = findTestBlocks(doc.getText());
      if (blocks.length === 0) continue;

      const children = blocks.map(
        (b) => new TestCaseItem(b.name, uri, b.line),
      );
      this.fileItems.push(new TestFileItem(uri, children));
    }

    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (!element) return this.fileItems;
    if (element instanceof TestFileItem) return element.children;
    return [];
  }
}
