import * as vscode from "vscode";

interface LspInput {
  uri: string;
  line: number;
  column: number;
}

// ── resolve_definition ──────────────────────────────────────

export class ResolveDefinitionTool implements vscode.LanguageModelTool<LspInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LspInput>,
    _token: vscode.CancellationToken
  ) {
    return { invocationMessage: `Resolving definition at ${options.input.uri}:${options.input.line + 1}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LspInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { uri, line, column } = options.input;
    const docUri = vscode.Uri.parse(uri);
    const position = new vscode.Position(line, column);

    const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeDefinitionProvider",
      docUri,
      position
    );

    if (!definitions || definitions.length === 0) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ found: false })),
      ]);
    }

    const def = definitions[0];
    const defDoc = await vscode.workspace.openTextDocument(def.uri);
    const definitionSource = defDoc.getText();

    const result = {
      found: true,
      definitionUri: def.uri.toString(),
      definitionLine: def.range.start.line,
      definitionSource,
    };

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2)),
    ]);
  }
}

// ── find_references ─────────────────────────────────────────

export class FindReferencesTool implements vscode.LanguageModelTool<LspInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LspInput>,
    _token: vscode.CancellationToken
  ) {
    return { invocationMessage: `Finding references at ${options.input.uri}:${options.input.line + 1}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LspInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { uri, line, column } = options.input;
    const docUri = vscode.Uri.parse(uri);
    const position = new vscode.Position(line, column);

    const refs = await vscode.commands.executeCommand<vscode.Location[]>(
      "vscode.executeReferenceProvider",
      docUri,
      position
    ) ?? [];

    const references = await Promise.all(
      refs.map(async (ref) => {
        const doc = await vscode.workspace.openTextDocument(ref.uri);
        return {
          uri: ref.uri.toString(),
          line: ref.range.start.line,
          text: doc.lineAt(ref.range.start.line).text.trim(),
        };
      })
    );

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ count: references.length, references }, null, 2)),
    ]);
  }
}

// ── get_type_info ───────────────────────────────────────────

export class GetTypeInfoTool implements vscode.LanguageModelTool<LspInput> {
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<LspInput>,
    _token: vscode.CancellationToken
  ) {
    return { invocationMessage: `Getting type info at ${options.input.uri}:${options.input.line + 1}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LspInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { uri, line, column } = options.input;
    const docUri = vscode.Uri.parse(uri);
    const position = new vscode.Position(line, column);

    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      "vscode.executeHoverProvider",
      docUri,
      position
    );

    const typeInfo = hovers?.[0]?.contents
      .map((c) => (typeof c === "string" ? c : c.value))
      .join("\n") ?? "No type info available";

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify({ typeInfo }, null, 2)),
    ]);
  }
}
