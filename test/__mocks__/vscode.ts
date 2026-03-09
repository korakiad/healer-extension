/**
 * Minimal mock of the vscode module for unit testing.
 * Only stubs the types/classes used by our tools.
 */

export class LanguageModelToolResult {
  constructor(public parts: LanguageModelTextPart[]) {}
}

export class LanguageModelTextPart {
  constructor(public value: string) {}
}
