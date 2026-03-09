import * as vscode from "vscode";

interface EditItem {
  uri: string;
  line: number;
  oldText: string;
  newText: string;
}

interface ApplyEditInput {
  edits: EditItem[];
}

export class ApplyEditTool implements vscode.LanguageModelTool<ApplyEditInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ApplyEditInput>,
    _token: vscode.CancellationToken
  ) {
    const { edits } = options.input;
    const summary = edits
      .map((e) => `\`${e.oldText}\` → \`${e.newText}\``)
      .join("\n\n");

    return {
      invocationMessage: `Applying ${edits.length} edit(s)`,
      confirmationMessages: {
        title: "Apply Selector Fix",
        message: new vscode.MarkdownString(
          `**${edits.length} edit(s):**\n\n${summary}`
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ApplyEditInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { edits } = options.input;
    const workspaceEdit = new vscode.WorkspaceEdit();
    let applied = 0;

    for (const edit of edits) {
      const docUri = vscode.Uri.parse(edit.uri);
      const doc = await vscode.workspace.openTextDocument(docUri);
      const lineText = doc.lineAt(edit.line).text;

      if (!lineText.includes(edit.oldText)) continue;

      const newLineText = lineText.replace(edit.oldText, edit.newText);
      const range = new vscode.Range(edit.line, 0, edit.line, lineText.length);
      workspaceEdit.replace(docUri, range, newLineText);
      applied++;
    }

    if (applied > 0) {
      await vscode.workspace.applyEdit(workspaceEdit);
    }

    const uniqueFiles = new Set(edits.map((e) => e.uri)).size;
    const result = { filesChanged: uniqueFiles, editsApplied: applied };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)),
    ]);
  }
}
