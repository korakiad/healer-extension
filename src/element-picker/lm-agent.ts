import * as vscode from "vscode";

export interface ElementInfo {
  tagName: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  classList?: string[];
  attributes?: Record<string, string>;
  textContent?: string;
  parentPath?: string;
  outerHTML?: string;
  frameChain?: FrameInfo[];
}

export interface FrameInfo {
  tagName: string;
  name?: string | null;
  id?: string | null;
  src?: string | null;
}

export interface SelectorSuggestion {
  selector: string;
  type: "Playwright" | "CSS";
  label: string;
  reason: string;
}

export async function analyzeSelectors(
  elementInfo: ElementInfo,
  ariaSnapshot: string
): Promise<SelectorSuggestion[]> {
  const models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
  const model = models[0] ?? (await vscode.lm.selectChatModels())[0];
  if (!model) throw new Error("No language model available");

  const systemPrompt = `You are a Playwright selector expert. Given element info and an aria snapshot of the page, suggest 2-5 optimal selectors.

Priority order:
1. data-testid attribute (most stable)
2. getByRole with accessible name
3. getByLabel
4. Unique ID (#id)
5. CSS selector (class + attribute)
6. getByText (last resort, fragile)

For elements inside iframes, include the frameLocator() chain.

Return JSON array: [{ "selector": "...", "type": "Playwright"|"CSS", "label": "short label", "reason": "why this selector" }]
Return ONLY the JSON array, no markdown fences.`;

  const userPrompt = `Element info:
- Tag: ${elementInfo.tagName}
- ID: ${elementInfo.id ?? "none"}
- Role: ${elementInfo.role ?? "none"}
- Aria Label: ${elementInfo.ariaLabel ?? "none"}
- Classes: ${elementInfo.classList?.join(", ") ?? "none"}
- Attributes: ${JSON.stringify(elementInfo.attributes ?? {})}
- Text: ${elementInfo.textContent ?? "none"}
- Parent path: ${elementInfo.parentPath ?? "none"}
- OuterHTML: ${elementInfo.outerHTML ?? "none"}
${elementInfo.frameChain?.length ? `- Frame chain: ${JSON.stringify(elementInfo.frameChain)}` : ""}

Aria snapshot of the frame:
${ariaSnapshot}`;

  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(userPrompt),
  ];

  const response = await model.sendRequest(messages);
  let text = "";
  for await (const chunk of response.text) {
    text += chunk;
  }

  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse selector suggestions: ${text.slice(0, 200)}`);
  }
}

export interface ReplacementRequest {
  selector: string;
  elementInfo: ElementInfo;
}

export interface EditorContext {
  fileName: string;
  selectedText: string;
  surroundingCode: string;
}

export async function generateReplacementCode(
  request: ReplacementRequest,
  editorContext: EditorContext
): Promise<string> {
  const models = await vscode.lm.selectChatModels({ family: "gpt-4o" });
  const model = models[0] ?? (await vscode.lm.selectChatModels())[0];
  if (!model) throw new Error("No language model available");

  const systemPrompt = `You are a test code generator. Given a chosen selector and the code context, generate replacement code that fits the existing style.

Rules:
- Detect the framework from imports (Playwright, Cypress, etc.)
- Match the coding pattern (Page Object Model, inline, utility functions)
- Return ONLY the replacement code, no explanation, no markdown fences
- Preserve indentation and style`;

  const userPrompt = `File: ${editorContext.fileName}
Selected text to replace: ${editorContext.selectedText}
Surrounding code:
${editorContext.surroundingCode}

Chosen selector: ${request.selector}
Element: ${request.elementInfo.tagName} (${request.elementInfo.role ?? "no role"})`;

  const messages = [
    vscode.LanguageModelChatMessage.User(systemPrompt),
    vscode.LanguageModelChatMessage.User(userPrompt),
  ];

  const response = await model.sendRequest(messages);
  let text = "";
  for await (const chunk of response.text) {
    text += chunk;
  }

  return text.trim();
}
