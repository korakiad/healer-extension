import { describe, it, expect } from "vitest";
import { findTestBlocks } from "../../src/ui/codelens.js";

describe("findTestBlocks", () => {
  it("finds test() blocks with line numbers", () => {
    const source = `
import { test } from "@playwright/test";

test("login flow", async ({ page }) => {
  await page.goto("/login");
});

test("dashboard check", async ({ page, ai }) => {
  await page.goto("/dashboard");
});
`.trim();

    const blocks = findTestBlocks(source);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ name: "login flow", line: 2 });
    expect(blocks[1]).toEqual({ name: "dashboard check", line: 6 });
  });

  it("finds test inside describe blocks", () => {
    const source = `
test.describe("suite", () => {
  test("inner", async ({ page }) => {});
});
`.trim();
    const blocks = findTestBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].name).toBe("inner");
  });
});
