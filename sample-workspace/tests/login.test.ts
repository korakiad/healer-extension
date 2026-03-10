import { test, expect } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

test("user can login", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/login");

  const loginPage = new LoginPage();

  // These will fail because selectors are wrong
  await page.locator(loginPage.usernameInput).fill("admin");
  await page.locator(loginPage.passwordInput).fill("password123");
  await page.locator(loginPage.submitButton).click();

  await expect(page).toHaveURL("/dashboard");
});

test("shows error on invalid credentials", async ({ page }) => {
  await page.goto("https://the-internet.herokuapp.com/login");

  const loginPage = new LoginPage();

  await page.locator(loginPage.usernameInput).fill("asdasd");
  await page.locator(loginPage.passwordInput).fill("wrong");
  await page.locator(loginPage.submitButton).click();

  await expect(page.locator(".error-message")).toBeVisible();
});
