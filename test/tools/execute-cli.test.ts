import { describe, it, expect } from "vitest";
import { parseCliOutput } from "../../src/tools/execute-cli.js";

describe("parseCliOutput", () => {
  it("parses snapshot output", () => {
    const stdout = "### Page\n- Page URL: https://example.com\n### Snapshot\n- [Snapshot](page.yaml)";
    const result = parseCliOutput(stdout);
    expect(result.pageUrl).toBe("https://example.com");
    expect(result.snapshotFile).toBe("page.yaml");
  });

  it("parses screenshot output", () => {
    const stdout = "### Screenshot\n- [Screenshot](shot.png)";
    const result = parseCliOutput(stdout);
    expect(result.screenshotFile).toBe("shot.png");
  });

  it("parses generated code from click output", () => {
    const stdout = `### Ran Playwright code\n\`\`\`js\nawait page.locator('iframe[name="AppFrame"]').contentFrame().getByTitle('Quick search').click();\n\`\`\``;
    const result = parseCliOutput(stdout);
    expect(result.generatedCode).toContain('iframe[name="AppFrame"]');
  });

  it("returns empty fields for unrecognized output", () => {
    const result = parseCliOutput("some random output");
    expect(result.pageUrl).toBeUndefined();
    expect(result.snapshotFile).toBeUndefined();
  });
});
