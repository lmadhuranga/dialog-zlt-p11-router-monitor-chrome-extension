const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");
const options = fs.readFileSync(path.join(root, "options.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

test("Huawei router mode uses the B310 signal and traffic APIs with browser cookies", () => {
  assert.match(background, /getActiveRouterType\(\) === "huawei"\) return getHuaweiInformation\(\)/);
  assert.match(background, /huaweiRequest\("\/api\/device\/signal"\)/);
  assert.match(background, /huaweiRequest\("\/api\/monitoring\/traffic-statistics"\)/);
  assert.match(background, /credentials: "include"/);
  assert.match(background, /CurrentDownloadRate/);
  assert.match(background, /CurrentUploadRate/);
  assert.match(options, /value="huawei"/);
  assert.ok(manifest.optional_host_permissions.some(permission => permission === "http://*/*"));
  assert.match(options, /value="auto"/);
  assert.match(options, /value="huawei"/);
  assert.match(options, /value="zlt"/);
  assert.match(background, /settings\.routerType === "auto" \? await detectAlternateRouterType\(\) : null/);
  assert.match(background, /detectedRouterType = settings\.detectedRouterType/);
});

test("Huawei XML reader extracts plain text and CDATA values", () => {
  const source = background.match(/function parseHuaweiXmlValue\(xml, tag\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const parse = vm.runInNewContext(`${source}; parseHuaweiXmlValue`);
  assert.equal(parse("<rssi>-91 dBm</rssi>", "rssi"), "-91 dBm");
  assert.equal(parse("<CurrentDownloadRate><![CDATA[12800]]></CurrentDownloadRate>", "CurrentDownloadRate"), "12800");
  assert.equal(parse("<root/>", "rssi"), "");
});

test("Huawei B310 positional signal response supports cell history fields", () => {
  const source = background.match(/function parseHuaweiSignal\(xml\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const parseValue = background.match(/function parseHuaweiXmlValue\(xml, tag\)\s*\{[\s\S]*?\n\}/)?.[0];
  const parse = vm.runInNewContext(`${parseValue}; ${source}; parseHuaweiSignal`);
  assert.deepEqual(JSON.parse(JSON.stringify(parse("12 12345678 -10dB -110dBm -80dBm 8dB 7"))), {
    pci: "12", cell_id: "12345678", rsrq: "-10dB", rsrp: "-110dBm", rssi: "-80dBm", sinr: "8dB", mode: "7"
  });
});

test("Huawei connected-device scan uses the authenticated HiLink host-list endpoint", () => {
  assert.match(background, /huaweiRequest\("\/api\/wlan\/host-list", true\)/);
  assert.match(background, /code === "100003"[\s\S]*Sign in to the Huawei router web interface/);
  assert.match(background, /credentials: "include"/);
});

test("Huawei host-list XML maps device identity into the existing registry", () => {
  const source = background.match(/function parseHuaweiHostList\(xml\)\s*\{[\s\S]*?\n\}/)?.[0];
  const parseValue = background.match(/function parseHuaweiXmlValue\(xml, tag\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const parse = vm.runInNewContext(`${parseValue}; ${source}; parseHuaweiHostList`);
  assert.deepEqual(JSON.parse(JSON.stringify(parse("<response><Hosts><Host><IpAddress>192.168.8.2</IpAddress><MacAddress>aa:bb:cc:dd:ee:ff</MacAddress><HostName>laptop</HostName><LeaseTime>10</LeaseTime></Host></Hosts></response>"))), [
    { ip: "192.168.8.2", mac: "aa:bb:cc:dd:ee:ff", hostname: "laptop", leaseRemaining: "10" }
  ]);
});

test("automatic detection requires a complete Huawei API signature and numeric traffic rates", async () => {
  const source = background.match(/async function detectAlternateRouterType\(.*?\)\s*\{[\s\S]*?\n\}/)?.[0];
  const parseValue = background.match(/function parseHuaweiXmlValue\(xml, tag\)\s*\{[\s\S]*?\n\}/)?.[0];
  const parseSignal = background.match(/function parseHuaweiSignal\(xml\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source && parseValue && parseSignal);
  const functionBody = source.slice(source.indexOf("{"));
  const valid = new Function("huaweiRequest", "parseHuaweiSignal", "parseHuaweiXmlValue", "settings", "huaweiSignalXml", "huaweiSignalTimestamp", `return (async function(currentType) ${functionBody})`);
  const parse = vm.runInNewContext(`${parseValue}; ${parseSignal}; ({parseHuaweiSignal,parseHuaweiXmlValue})`);
  const run = (request) => valid(request, parse.parseHuaweiSignal, parse.parseHuaweiXmlValue, { routerType: "auto" }, "", 0)("zlt");
  assert.equal(await run(async () => { throw new Error("router offline"); }), null);
  assert.equal(await run(async path => path.endsWith("signal") ? "<response><rssi>-90</rssi></response>" : "<response><CurrentDownloadRate>0</CurrentDownloadRate><CurrentUploadRate>42</CurrentUploadRate></response>"), "huawei");
  assert.equal(await run(async path => path.endsWith("signal") ? "<response><rssi>-90</rssi></response>" : "<response><CurrentDownloadRate>invalid</CurrentDownloadRate><CurrentUploadRate>42</CurrentUploadRate></response>"), null);
});

test("automatic ZLT detection rejects outages and authentication responses", async () => {
  const source = background.match(/async function detectAlternateRouterType\(.*?\)\s*\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const functionBody = source.slice(source.indexOf("{"));
  const factory = new Function("routerRequestWithAuth", "tryParseJSON", "isSessionInvalid", "huaweiRequest", "parseHuaweiSignal", "parseHuaweiXmlValue", "settings", "sessionId", `return (async function(currentType) ${functionBody})`);
  const noop = () => "";
  const run = request => factory(request, text => { try { return JSON.parse(text); } catch { return null; } }, text => String(text).includes("invalid session"), noop, noop, noop, { routerType: "auto" }, "")("huawei");
  assert.equal(await run(async () => { throw new Error("router offline"); }), null);
  assert.equal(await run(async () => "invalid session"), null);
  assert.equal(await run(async () => JSON.stringify({ success: true, rssi: -95, wanRxBytes: 100, wanTxBytes: 200 })), "zlt");
});
