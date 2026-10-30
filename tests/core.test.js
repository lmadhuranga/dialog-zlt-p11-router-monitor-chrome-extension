const test=require("node:test");
const assert=require("node:assert/strict");
const Core=require("../core.js");

test("normalizes plain IP",()=>assert.equal(Core.normalizeRouterOrigin("192.168.8.1"),"http://192.168.8.1"));
test("keeps https and port",()=>assert.equal(Core.normalizeRouterOrigin("https://1.2.3.4:8888/path"),"https://1.2.3.4:8888"));
test("default theme is dark",()=>assert.equal(Core.DEFAULT_SETTINGS.theme,"dark"));
test("live title defaults to KB/s and contains download upload and signal",()=>{
  const title=Core.buildLiveTitle({status:"connected",speed:{downloadKB:523,uploadKB:121,downloadMbps:4.184,uploadMbps:0.968},router:{rssi:-92}});
  assert.equal(title,"↑121KB/s ↓523KB/s 📶-92 | Router Monitor");
});
test("live title supports Mbps",()=>{
  const title=Core.buildLiveTitle({status:"connected",speed:{downloadKB:523,uploadKB:121,downloadMbps:4.2,uploadMbps:1.0},router:{rssi:-92}},"Mbps");
  assert.equal(title,"↑1.0Mbps ↓4.2Mbps 📶-92 | Router Monitor");
});
test("offline title",()=>assert.equal(Core.buildLiveTitle({status:"server_error"}),"● Offline | Router Monitor"));
test("speed calculation",()=>{
  const s=Core.calculateSpeed({rx:0,tx:0},{rx:1_000_000,tx:500_000},1000);
  assert.equal(s.downloadMbps,8);
  assert.equal(s.uploadMbps,4);
});
test("default speed unit is KB/s",()=>assert.equal(Core.DEFAULT_SETTINGS.speedUnit,"KB/s"));
test("router API selection defaults to auto and accepts manual overrides",()=>{
  assert.equal(Core.sanitizeRouterType(undefined),"auto");
  assert.equal(Core.sanitizeRouterType("auto"),"auto");
  assert.equal(Core.sanitizeRouterType("huawei"),"huawei");
  assert.equal(Core.sanitizeRouterType("zlt"),"zlt");
  assert.equal(Core.sanitizeRouterType("unknown"),"auto");
});
