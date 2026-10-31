const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "popup.html"), "utf8");
const js = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("popup device label follows the active router reported by status", () => {
  assert.match(html, /id="deviceLabel" class="device-label">Router<\/span>/);
  assert.match(js, /\$\("deviceLabel"\)\.textContent=RouterCore\.routerDisplayName\(result\.settings\?\.activeRouterType\)/);
});

test("main extension popup contains Float button", () => {
  assert.match(html, /id="floatCellBtn"/);
  assert.match(html, />▣ Float</);
});

test("popup Float button opens Document Picture-in-Picture", () => {
  assert.match(js, /openPopupCellFloat/);
  assert.match(js, /documentPictureInPicture\.requestWindow/);
  assert.match(js, /width:\s*230/);
  assert.match(js, /height:\s*86/);
});

test("popup floating HUD displays cell signal upload and download", () => {
  assert.match(js, /pipCellId/);
  assert.match(js, /pipSignal/);
  assert.match(js, /pipTraffic/);
  assert.match(js, /getCellSignalHistory/);
  assert.match(js, /getStatus/);
});

test("popup Float button has click handler", () => {
  assert.match(js, /floatCellBtn[\s\S]*openPopupCellFloat/);
});
