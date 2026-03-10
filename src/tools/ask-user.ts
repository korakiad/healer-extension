import * as vscode from "vscode";

interface Choice {
  label: string;
  description?: string;
}

interface AskUserInput {
  title: string;
  choices: Choice[];
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
}

export class AskUserTool implements vscode.LanguageModelTool<AskUserInput> {
  /**
   * Renders an inline card in Copilot Chat showing the choices as markdown.
   * User clicks "Continue" to open the Quick Pick, or "Cancel" to dismiss.
   */
  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<AskUserInput>,
    _token: vscode.CancellationToken
  ) {
    const { title, choices } = options.input;

    const lines = choices.map(
      (c, i) => `${i + 1}. **${c.label}**${c.description ? ` — ${c.description}` : ""}`
    );
    lines.push("", "*Click **Continue** to pick, or **Cancel** to skip.*");

    return {
      invocationMessage: title,
      confirmationMessages: {
        title,
        message: new vscode.MarkdownString(lines.join("\n")),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<AskUserInput>,
    _token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const {
      title,
      choices,
      allowFreeText = true,
      freeTextPlaceholder,
    } = options.input;

    const items: vscode.QuickPickItem[] = choices.map((c, i) => ({
      label: `${i + 1}. ${c.label}`,
      description: c.description,
    }));

    if (allowFreeText) {
      items.push({
        label: "$(edit) Type your own...",
        description: "Enter a custom response",
      });
    }

    const selected = await vscode.window.showQuickPick(items, {
      title,
      placeHolder: "Pick an option or type to filter",
      ignoreFocusOut: true,
    });

    if (!selected) {
      return this.result({ cancelled: true });
    }

    // Free-text option selected → open InputBox
    if (allowFreeText && selected === items[items.length - 1]) {
      const freeText = await vscode.window.showInputBox({
        title,
        prompt: freeTextPlaceholder ?? "Type your response",
        ignoreFocusOut: true,
      });

      return freeText
        ? this.result({ freeText })
        : this.result({ cancelled: true });
    }

    // Numbered choice selected
    const choiceIndex = items.indexOf(selected);
    return this.result({
      choiceIndex,
      label: choices[choiceIndex].label,
      description: choices[choiceIndex].description,
    });
  }

  private result(data: Record<string, unknown>): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(data)),
    ]);
  }
}
