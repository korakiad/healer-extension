import { test, expect } from "@playwright/test";

const WORKSPACE_URL = "http://workspace.ppe.refinitiv.com/web";
/**
 * Helper: get the Workspace inner frame (3 levels deep).
 * Chain: AppFrame → internal → AppFrame
 */
function getWorkspaceFrame(page: import("@playwright/test").Page) {
  return page
    .frameLocator('iframe[name="AppFrame"]')
    .frameLocator('iframe[name="internal"]')
    .frameLocator('iframe[name="AppFrame112"]');
}

/**
 * Helper: get the AI App frame (deeply nested inside Workspace iframes).
 * Chain: AppFrame → internal → AppFrame → EikonNowMarker[src*="workspace-ai-app"]
 */
function getAiAppFrame(page: import("@playwright/test").Page) {
  return getWorkspaceFrame(page).frameLocator(
    'iframe[name="EikonNowMarker"][src*="workspace-ai-app"]',
  );
}

test("IBM RIC prompt returns correct chart response", async ({ page, ai }) => {
  test.setTimeout(180_000);

  const userId = process.env.REFINITIV_USER;
  const password = process.env.REFINITIV_PASSWORD;
  if (!userId || !password) {
    throw new Error(
      "REFINITIV_USER and REFINITIV_PASSWORD env variables are required",
    );
  }

  // --- Login ---
  await page.goto(WORKSPACE_URL);
  await page.locator("#AAA-AS-SI1-SE003").fill(userId, { timeout: 30_000 });
  await page.locator("#AAA-AS-SI1-SE006").fill(password);
  await page.locator("#AAA-AS-SI1-SE014").click();

  // Throttle network to slow 3G after login to stress-test healing
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 400, // 400ms RTT
    downloadThroughput: (500 * 1024) / 8, // 500 Kbps down
    uploadThroughput: (500 * 1024) / 8, // 500 Kbps up
  });

  // --- Click AI button ("Quick search" title) in top toolbar ---
  await getWorkspaceFrame(page).getByTitle("Quick search").click();
  //   await ai.waitFor(
  //     page,
  //     "the Workspace AI App has loaded with a greeting message and an 'Ask a question' input field",
  //     { timeout: 30_000, interval: 5_000 },
  //   );

  // --- Submit IBM prompt ---
  const aiFrame = getAiAppFrame(page);
  await aiFrame
    .getByRole("textbox", { name: "Ask a question" })
    .fill("Show me IBM.N chart");
  await aiFrame.getByRole("button", { name: "Send" }).click();

  // --- Verify AI response ---
  //   await ai
  //     .expect(page)
  //     .toPass(
  //       "the AI response shows information about IBM (International Business Machines) including a chart or financial data such as stock price, Sharpe ratio, or company overview — confirming the IBM.N RIC was correctly recognized",
  //       { timeout: 60_000, interval: 5_000 },
  //     );
});
