import { test, expect } from "@playwright/test";

test("rejects non-video file with friendly error", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    indexedDB.deleteDatabase("ai-video-cutter");
  });
  await page.reload();
  const fileInput = page.locator("input[type=file]");
  await fileInput.setInputFiles({
    name: "fake.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a video"),
  });
  await expect(
    page.getByText("Only MP4, MOV, WebM supported", { exact: false })
  ).toBeVisible();
});
