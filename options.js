const $=id=>document.getElementById(id);
let existingHash="";

function setTheme(theme){
  document.body.classList.toggle("light",theme==="light");
  $("themeBtn").textContent=theme==="light"?"☀":"☾";
}
function notice(message,error=false){
  const el=$("notice"); el.textContent=message; el.classList.toggle("error",error); el.classList.remove("hidden");
}
async function ensurePermission(origin){
  const pattern=RouterCore.permissionPattern(origin);
  const has=await chrome.permissions.contains({origins:[pattern]});
  if(has)return true;
  return await chrome.permissions.request({origins:[pattern]});
}
async function save({silent=false}={}){
  try{
    const origin=RouterCore.normalizeRouterOrigin($("routerOrigin").value);
    if(!(await ensurePermission(origin)))throw new Error("Permission to access this router address was not granted.");
    const username=$("routerUsername").value.trim();
    if(!username)throw new Error("Username is required.");
    const pwd=$("routerPassword").value;
    const hash=pwd?RouterMD5.md5(pwd):existingHash||RouterCore.DEFAULT_SETTINGS.routerPasswordHash;
    const data={
      routerOrigin:origin,
      routerType:RouterCore.sanitizeRouterType($("routerType").value),
      routerUsername:username,
      routerPasswordHash:hash,
      refreshInterval:RouterCore.sanitizeRefreshInterval($("refreshInterval").value),
      theme:RouterCore.sanitizeTheme($("theme").value),
      speedUnit:RouterCore.sanitizeSpeedUnit($("speedUnit").value)
    };
    await chrome.storage.local.set(data);
    existingHash=hash; $("routerPassword").value="";
    await chrome.runtime.sendMessage({type:"settingsChanged"});
    setTheme(data.theme);
    if(!silent)notice("Settings saved successfully.");
    return true;
  }catch(e){notice(e.message,true);return false;}
}
async function load(){
  const s=await chrome.storage.local.get(RouterCore.DEFAULT_SETTINGS);
  $("routerOrigin").value=s.routerOrigin;
  $("routerType").value=RouterCore.sanitizeRouterType(s.routerType);
  $("routerUsername").value=s.routerUsername;
  $("refreshInterval").value=String(RouterCore.sanitizeRefreshInterval(s.refreshInterval));
  $("theme").value=RouterCore.sanitizeTheme(s.theme);
  $("speedUnit").value=RouterCore.sanitizeSpeedUnit(s.speedUnit);
  existingHash=s.routerPasswordHash||RouterCore.DEFAULT_SETTINGS.routerPasswordHash;
  setTheme($("theme").value);
}
$("saveBtn").addEventListener("click",()=>save());
$("testBtn").addEventListener("click",async()=>{
  $("testBtn").disabled=true;$("testResult").textContent="Testing…";
  const ok=await save({silent:true});
  if(!ok){$("testResult").textContent="Save settings first";$("testBtn").disabled=false;return;}
  try{
    const result=await chrome.runtime.sendMessage({type:"testConnection"});
    $("testResult").textContent=result?.success?"✓ Connected":`✕ ${result?.message||"Connection failed"}`;
  }catch(e){$("testResult").textContent=`✕ ${e.message}`;}
  $("testBtn").disabled=false;
});
$("resetBtn").addEventListener("click",async()=>{
  const d=RouterCore.DEFAULT_SETTINGS;
  await chrome.storage.local.set({...d});
  existingHash=d.routerPasswordHash; await load();
  await chrome.runtime.sendMessage({type:"settingsChanged"});
  notice("Defaults restored.");
});
$("showPassword").addEventListener("click",()=>{
  const input=$("routerPassword"); input.type=input.type==="password"?"text":"password";
  $("showPassword").textContent=input.type==="password"?"Show":"Hide";
});
$("themeBtn").addEventListener("click",()=>{
  const theme=$("theme").value==="light"?"dark":"light"; $("theme").value=theme; setTheme(theme);
});
$("theme").addEventListener("change",()=>setTheme($("theme").value));
load();

let optionsCellPipWindow = null;

function optionsFormatKB(value){
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function optionsFormatMbps(value){
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function optionsSignalValue(raw){
  const n = Number(raw);
  if(!Number.isFinite(n)) return "--";
  return n > 0 ? -Math.abs(n) : Math.round(n);
}

function buildOptionsCellPipDocument(pipWindow){
  const doc = pipWindow.document;
  doc.title = "Router Monitor";

  const style = doc.createElement("style");
  style.textContent = `
    *{box-sizing:border-box}
    html,body{
      margin:0;width:100%;height:100%;overflow:hidden;
      background:#07111b;color:#c6d3df;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      pointer-events:none;user-select:none;-webkit-user-select:none;
    }
    .hud{
      width:100%;height:100%;display:flex;flex-direction:column;
      justify-content:center;gap:5px;padding:8px 10px;background:#07111b;
    }
    .row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
    .cell,.signal{font-size:12px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .signal{color:#78c99a}
    .traffic{font-size:11px;font-weight:800;color:#b9c8d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .time{color:#7f93a6;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  `;
  doc.head.appendChild(style);

  const hud = doc.createElement("div");
  hud.className = "hud";
  hud.innerHTML = `
    <div class="row">
      <div id="pipCellId" class="cell">Cell --</div>
      <div id="pipSignal" class="signal">-- dBm</div>
    </div>
    <div id="pipTraffic" class="traffic">↑ 0 KB/s  |  ↓ 0 KB/s</div>
    <div id="pipTime" class="time">Waiting for cell sample</div>
  `;
  doc.body.appendChild(hud);
}

async function updateOptionsCellPip(){
  if(!optionsCellPipWindow || optionsCellPipWindow.closed) return;

  const [status, cellResult] = await Promise.all([
    chrome.runtime.sendMessage({type:"getStatus"}),
    chrome.runtime.sendMessage({type:"getCellSignalHistory", limit:1})
  ]);

  const doc = optionsCellPipWindow.document;
  const cell = doc.getElementById("pipCellId");
  const signal = doc.getElementById("pipSignal");
  const traffic = doc.getElementById("pipTraffic");
  const time = doc.getElementById("pipTime");
  if(!cell || !signal || !traffic || !time) return;

  const speedUnit = status?.settings?.speedUnit === "Mbps" ? "Mbps" : "KB/s";
  const up = speedUnit === "Mbps"
    ? `${optionsFormatMbps(status?.speed?.uploadMbps)} Mbps`
    : `${optionsFormatKB(status?.speed?.uploadKB)} KB/s`;
  const down = speedUnit === "Mbps"
    ? `${optionsFormatMbps(status?.speed?.downloadMbps)} Mbps`
    : `${optionsFormatKB(status?.speed?.downloadKB)} KB/s`;

  traffic.textContent = `↑ ${up}  |  ↓ ${down}`;

  const sig = optionsSignalValue(status?.router?.rssi);
  signal.textContent = sig === "--" ? "-- dBm" : `${sig} dBm`;

  const sample = cellResult?.latest;
  if(sample){
    cell.textContent = `Cell ${sample.globalCellId ?? "--"}`;
    const ts = Number(sample.timestamp);
    if(Number.isFinite(ts)){
      const sec = Math.max(0, Math.floor((Date.now() - ts)/1000));
      time.textContent = sec < 60 ? `${sec}s ago` : `${Math.floor(sec/60)}m ago`;
    }else{
      time.textContent = "Latest sample";
    }
  }else{
    cell.textContent = "Cell --";
    time.textContent = "Waiting for cell sample";
  }
}

async function openCellFloatingWindowFromOptions(){
  const btn = document.getElementById("floatCellFromOptionsBtn");
  if(!btn) return;

  if(!("documentPictureInPicture" in window)){
    alert("Always-on-top floating window requires a supported Chrome version.");
    return;
  }

  if(documentPictureInPicture.window){
    optionsCellPipWindow = documentPictureInPicture.window;
    optionsCellPipWindow.focus();
    await updateOptionsCellPip();
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening…";

  try{
    optionsCellPipWindow = await documentPictureInPicture.requestWindow({
      width:230,
      height:86,
      disallowReturnToOpener:true,
      preferInitialWindowPlacement:false
    });

    buildOptionsCellPipDocument(optionsCellPipWindow);
    await updateOptionsCellPip();

    const timer = setInterval(async()=>{
      if(!optionsCellPipWindow || optionsCellPipWindow.closed){
        clearInterval(timer);
        return;
      }
      try{ await updateOptionsCellPip(); }catch(_){}
    },1000);

    optionsCellPipWindow.addEventListener("pagehide",()=>{
      clearInterval(timer);
      optionsCellPipWindow = null;
      if(btn){
        btn.disabled = false;
        btn.textContent = "▣ Float Cell";
      }
    },{once:true});

    btn.textContent = "▣ Floating";
  }catch(error){
    alert(error?.message || "Unable to open floating cell window.");
    btn.textContent = original;
  }finally{
    btn.disabled = false;
  }
}

document.getElementById("floatCellFromOptionsBtn")?.addEventListener("click",openCellFloatingWindowFromOptions);


document.getElementById("cellHistoryBtn")?.addEventListener("click", async () => {
  await chrome.tabs.create({url: chrome.runtime.getURL("history.html")});
});
