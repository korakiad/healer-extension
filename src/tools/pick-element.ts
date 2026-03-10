import * as vscode from "vscode";
import { PickerService } from "../element-picker/picker-service.js";

interface PickElementInput {
  hint?: string;
}

export class PickElementTool implements vscode.LanguageModelTool<PickElementInput> {
  private output: vscode.OutputChannel;

  constructor(output: vscode.OutputChannel) {
    this.output = output;
  }

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<PickElementInput>,
    _token: vscode.CancellationToken
  ) {
    const hint = options.input.hint ?? "Pick an element";
    return { invocationMessage: `Element Picker: ${hint}` };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<PickElementInput>,
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelToolResult> {
    const { hint } = options.input;

    try {
      const cdpPort = Number(process.env.CDP_PORT ?? 20565);
      const picker = PickerService.getInstance(this.output);

      await picker.ensureInjected(cdpPort);

      const cancelHandler = token.onCancellationRequested(() => {
        picker.cancelPick();
      });

      try {
        const result = await picker.pickElement(hint);

        const output = {
          selector: result.selector,
          type: result.type,
          elementInfo: {
            tagName: result.elementInfo.tagName,
            id: result.elementInfo.id,
            role: result.elementInfo.role,
            ariaLabel: result.elementInfo.ariaLabel,
            frameChain: result.elementInfo.frameChain,
          },
          alternatives: result.alternatives.map((a) => ({
            selector: a.selector,
            type: a.type,
            reason: a.reason,
          })),
        };

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify(output, null, 2)),
        ]);
      } finally {
        cancelHandler.dispose();
      }
    } catch (err: any) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          JSON.stringify({ error: err.message }, null, 2)
        ),
      ]);
    }
  }
}
