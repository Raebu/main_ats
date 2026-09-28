import{test,expect}from"@playwright/test";
import AxeBuilder from"@axe-core/playwright";

test.describe("Careers",()=>{
  test.use({baseURL:process.env.CAREERS_E2E_URL||"http://127.0.0.1:3001"});
  test("renders without serious accessibility violations",async({page})=>{
    await page.goto("/careers/accessibility");
    await expect(page.locator("body")).toBeVisible();
    const results=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa","wcag22aa"]).analyze();
    expect(results.violations.filter(v=>["serious","critical"].includes(v.impact||""))).toEqual([]);
  });
  test("supports keyboard navigation",async({page})=>{
    await page.goto("/careers/accessibility");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe("BODY");
  });
});

test.describe("Talent Admin",()=>{
  test.use({baseURL:process.env.ADMIN_E2E_URL||"http://127.0.0.1:3002"});
  test("login renders",async({page})=>{
    await page.goto("/login");
    await expect(page.locator("body")).toContainText(/Raeburn|Talent|Sign|Login/i);
  });
});