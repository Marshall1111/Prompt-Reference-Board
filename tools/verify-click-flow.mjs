// 临时脚本：极简时序式点击流程（验证后删除）。
import { writeFileSync, appendFileSync } from "node:fs";
import { chromium } from "playwright-core";

const out = "tools/verify-click-out.txt";
writeFileSync(out, "");
function log(message) {
  appendFileSync(out, message + "\n");
}
process.on("unhandledRejection", (error) => log("UNHANDLED-REJECTION: " + (error?.stack || error)));
process.on("uncaughtException", (error) => log("UNCAUGHT-EXCEPTION: " + (error?.stack || error)));

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addCookies([{ name: "pg_user_session", value: "f63d9c0b-2383-4a3b-96d8-04c8518320b7", domain: "localhost", path: "/" }]);
const page = await context.newPage();
page.on("console", (msg) => log("CONSOLE[" + msg.type() + "]: " + msg.text().slice(0, 300)));
page.on("pageerror", (err) => log("PAGEERROR: " + String(err).slice(0, 400)));

for (const path of ["/tasks", "/clip"]) {
  log("==== goto " + path);
  await page.goto("http://localhost:3000" + path, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(3000);
  log("url=" + page.url());
  const bundle = await page.evaluate(() => Array.from(document.querySelectorAll("script[src]")).map((s) => s.getAttribute("src")));
  log("scripts=" + JSON.stringify(bundle));

  const card = await page.$(".draw-card-recent-tasks-grid .draw-card-result-media, .draw-card-clip-list .draw-card-clip-thumbnail");
  log("card=" + Boolean(card));
  if (!card) continue;
  await card.click({ timeout: 5000, force: true });
  log("clicked card");
  await page.waitForTimeout(1500);

  const target = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((el) => el.innerText.trim() === "做同款") || null;
  });
  log("target found=" + Boolean(target && target.asElement()));
  if (!target || !target.asElement()) continue;

  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.enable");
  cdp.on("Page.frameRequestedNavigation", (event) => log("CDP-NAV: " + JSON.stringify(event)));
  const navPromise = page.waitForURL((u) => !u.pathname.startsWith(path), { timeout: 6000 }).catch(() => null);
  await target.asElement().click({ timeout: 5000, force: true });
  log("clicked 做同款");
  const navigated = await navPromise;
  log("url after=" + page.url());
  log("navigated=" + Boolean(navigated));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "tools/step-after-click-" + path.replace(/\//g, "") + ".png", fullPage: false });
  const styleLine = await page.evaluate(() => {
    const el = document.querySelector(".draw-card-same-style-name");
    return el ? el.innerText.trim() : "";
  });
  log("style line=" + JSON.stringify(styleLine));
}
await browser.close();
log("DONE");
