const $ = id => document.getElementById(id);
let wifiBusy = false;
let currentOverlayState = null;


let popupCellPipWindow = null;
let popupCellPipTimer = null;

function popupFormatKB(value){
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function popupFormatMbps(value){
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function popupSignalValue(raw){
  const n = Number(raw);
  if(!Number.isFinite(n)) return "--";
  return n > 0 ? -Math.abs(n) : Math.round(n);
}

function popupSampleAge(sample){
  const timestamp = Number(sample?.timestamp);
  if(!Number.isFinite(timestamp)) return "Latest sample";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if(seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

function buildPopupCellPipDocument(pipWindow){
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

async function updatePopupCellPip(){
  if(!popupCellPipWindow || popupCellPipWindow.closed) return;

  const [status, cellResult] = await Promise.all([
    send({type:"getStatus"}, 3000),
    send({type:"getCellSignalHistory", limit:1}, 3000)
  ]);

  const doc = popupCellPipWindow.document;
  const cell = doc.getElementById("pipCellId");
  const signal = doc.getElementById("pipSignal");
  const traffic = doc.getElementById("pipTraffic");
  const time = doc.getElementById("pipTime");
  if(!cell || !signal || !traffic || !time) return;

  const speedUnit = status?.settings?.speedUnit === "Mbps" ? "Mbps" : "KB/s";
  const upload = speedUnit === "Mbps"
    ? `${popupFormatMbps(status?.speed?.uploadMbps)} Mbps`
    : `${popupFormatKB(status?.speed?.uploadKB)} KB/s`;
  const download = speedUnit === "Mbps"
    ? `${popupFormatMbps(status?.speed?.downloadMbps)} Mbps`
    : `${popupFormatKB(status?.speed?.downloadKB)} KB/s`;

  traffic.textContent = `↑ ${upload}  |  ↓ ${download}`;

  const sig = popupSignalValue(status?.router?.rssi);
  signal.textContent = sig === "--" ? "-- dBm" : `${sig} dBm`;

  const sample = cellResult?.latest;
  if(sample){
    cell.textContent = `Cell ${sample.globalCellId ?? "--"}`;
    time.textContent = popupSampleAge(sample);
  }else{
    cell.textContent = "Cell --";
    time.textContent = "Waiting for cell sample";
  }
}

async function openPopupCellFloat(){
  const btn = $("floatCellBtn");
  if(!btn) return;

  if(!("documentPictureInPicture" in window)){
    showError("Floating window requires a supported Chrome version.");
    return;
  }

  if(documentPictureInPicture.window){
    popupCellPipWindow = documentPictureInPicture.window;
    popupCellPipWindow.focus();
    await updatePopupCellPip();
    return;
  }

  const previous = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening…";

  try{
    popupCellPipWindow = await documentPictureInPicture.requestWindow({
      width:230,
      height:86,
      disallowReturnToOpener:true,
      preferInitialWindowPlacement:false
    });

    buildPopupCellPipDocument(popupCellPipWindow);
    await updatePopupCellPip();

    clearInterval(popupCellPipTimer);
    popupCellPipTimer = setInterval(async()=>{
      if(!popupCellPipWindow || popupCellPipWindow.closed){
        clearInterval(popupCellPipTimer);
        popupCellPipTimer = null;
        return;
      }
      try{ await updatePopupCellPip(); }catch(_){}
    },1000);

    popupCellPipWindow.addEventListener("pagehide",()=>{
      clearInterval(popupCellPipTimer);
      popupCellPipTimer = null;
      popupCellPipWindow = null;
    },{once:true});

    btn.textContent = "▣ Floating";
    hideError();
  }catch(error){
    showError(error?.message || "Unable to open floating window.");
    btn.textContent = previous;
  }finally{
    btn.disabled = false;
  }
}

function send(message, timeout=7000){
  return new Promise((resolve,reject)=>{
    let done=false;
    const timer=setTimeout(()=>{if(!done){done=true;reject(new Error("Request timeout"));}},timeout);
    chrome.runtime.sendMessage(message,response=>{
      if(done)return; done=true; clearTimeout(timer);
      if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      resolve(response);
    });
  });
}

function setTheme(theme){
  document.body.classList.toggle("light", theme==="light");
  $("themeBtn").textContent = theme==="light" ? "☀" : "☾";
}

async function toggleTheme(){
  const data=await chrome.storage.local.get(["theme"]);
  const theme=data.theme==="light"?"dark":"light";
  await chrome.storage.local.set({theme});
  setTheme(theme);
}

function setStatus(status){
  const dot=$("statusDot"), text=$("statusText");
  dot.className="dot";
  if(status==="connected"){dot.classList.add("connected");text.textContent="Connected";}
  else if(status==="paused"){dot.classList.add("connecting");text.textContent="Paused";}
  else if(status==="connecting"||status==="authenticating"){dot.classList.add("connecting");text.textContent=status==="authenticating"?"Authenticating":"Connecting";}
  else{dot.classList.add("error");text.textContent=status==="authentication_failed"?"Login Failed":"Offline";}
}

function showError(message){
  $("errorMessage").textContent=message;
  $("errorMessage").classList.remove("hidden");
}
function hideError(){$("errorMessage").classList.add("hidden");}


function hideStateOverlay(){
  currentOverlayState=null;
  $("stateOverlay")?.classList.add("hidden");
  $("stateOverlay")?.classList.remove("paused","offline");
  document.querySelector(".popup")?.classList.remove("state-dimmed");
}

function showStateOverlay(kind, detail=""){
  const overlay=$("stateOverlay");
  if(!overlay)return;

  currentOverlayState=kind;
  document.querySelector(".popup")?.classList.add("state-dimmed");
  overlay.classList.remove("hidden","paused","offline");
  overlay.classList.add(kind);

  const icon=$("overlayIcon");
  const title=$("overlayTitle");
  const message=$("overlayMessage");
  const primary=$("overlayPrimaryBtn");
  const secondary=$("overlaySecondaryBtn");

  if(kind==="paused"){
    icon.textContent="⏸";
    title.textContent="Monitoring paused";
    message.textContent=detail || "Router monitoring is paused. Enable it to continue live monitoring.";
    primary.textContent="▶ Enable Monitoring";
    secondary.classList.add("hidden");
  }else{
    icon.textContent="⊘";
    title.textContent="Router offline";
    message.textContent=detail || "Router Monitor cannot reach the router right now.";
    primary.textContent="↻ Retry Connection";
    secondary.textContent="Open Settings";
    secondary.classList.remove("hidden");
  }
}

async function resumeFromOverlay(){
  const btn=$("overlayPrimaryBtn");
  const original=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent="Enabling…";}
  try{
    const result=await send({type:"resumeExtension"},7000);
    if(result?.success===false)throw new Error(result.message||"Unable to enable monitoring");
    hideError();
    await refreshPauseControls();
    await load();
  }catch(error){
    showError(error.message||"Unable to enable monitoring");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=original||"▶ Enable Monitoring";}
  }
}

async function retryFromOverlay(){
  const btn=$("overlayPrimaryBtn");
  const original=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent="Retrying…";}
  try{
    const result=await send({type:"forceRefresh"},7000);
    applyStatus(result);
    hideError();
  }catch(error){
    showError(error.message||"Unable to reach router");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=original||"↻ Retry Connection";}
  }
}


function applyStatus(result){
  if(!result)return;
  setStatus(result.status);

  if(result.status==="paused" || result.paused===true){
    let detail="Router monitoring is paused.";
    if(result.pausedUntil==="indefinite") detail="Monitoring is paused until you enable it.";
    else if(Number.isFinite(Number(result.pausedUntil))) detail=`Monitoring is paused until ${new Date(Number(result.pausedUntil)).toLocaleString()}.`;
    showStateOverlay("paused",detail);
  }else if(["server_error","authentication_failed"].includes(result.status)){
    showStateOverlay("offline",result.status==="authentication_failed"
      ? "Router login failed. Check the configured username and password."
      : "Router Monitor cannot reach the router right now.");
  }else if(result.status==="connected" || result.status==="connecting" || result.status==="authenticating"){
    hideStateOverlay();
  }
  const speedUnit = RouterCore.sanitizeSpeedUnit(result.settings?.speedUnit);
  $("deviceLabel").textContent=RouterCore.routerDisplayName(result.settings?.activeRouterType);
  if (speedUnit === "Mbps") {
    $("downloadSpeed").textContent = RouterCore.formatMbps(result.speed?.downloadMbps);
    $("uploadSpeed").textContent = RouterCore.formatMbps(result.speed?.uploadMbps);
  } else {
    $("downloadSpeed").textContent = RouterCore.formatKB(result.speed?.downloadKB);
    $("uploadSpeed").textContent = RouterCore.formatKB(result.speed?.uploadKB);
  }
  $("downloadUnit").textContent = ` ${speedUnit}`;
  $("uploadUnit").textContent = ` ${speedUnit}`;
  $("signalValue").textContent=RouterCore.signalDisplay(result.router?.rssi).text;
  if(result.settings){
    $("routerAddress").textContent=result.settings.routerOrigin.replace(/^https?:\/\//,"");
    $("refreshText").textContent=result.settings.activeRouterType==="huawei"?"Live update: 2s":`Live update: ${result.settings.refreshInterval===500?".5":"1"}s`;
    setTheme(result.settings.theme);
  }
  const visible=result.wifi?.visible;
  if(typeof visible==="boolean"){
    $("wifiStatus").textContent=visible?"Visible":"Hidden";
    $("wifiToggleBtn").disabled=false;
    $("wifiToggleBtn").textContent=visible?"Hide Wi-Fi":"Show Wi-Fi";
  }else{
    $("wifiStatus").textContent="--";
    $("wifiToggleBtn").disabled=true;
    $("wifiToggleBtn").textContent="Wi-Fi unavailable";
  }
}

async function load(){
  try{applyStatus(await send({type:"getStatus"},3000));}
  catch(e){
    setStatus("server_error");
    showStateOverlay("offline","Router Monitor cannot communicate with the extension background service.");
    showError(e.message);
  }
}

async function refresh(){
  hideError();
  try{applyStatus(await send({type:"forceRefresh"},7000));}
  catch(e){showError(e.message);}
}

async function toggleWifi(){
  if(wifiBusy)return; wifiBusy=true;
  const btn=$("wifiToggleBtn"); btn.disabled=true; btn.textContent="Updating…";
  try{
    const current=await send({type:"getWifiVisibility"});
    if(!current?.success)throw new Error(current?.message||"Could not read Wi-Fi state");
    const result=await send({type:"setWifiVisibility",broadcast:String(current.broadcast)==="0"?"1":"0"},10000);
    if(!result?.success)throw new Error(result?.message||"Wi-Fi update failed");
    await load(); hideError();
  }catch(e){showError(e.message);}
  finally{wifiBusy=false;btn.disabled=false;}
}

$("themeBtn").addEventListener("click",toggleTheme);
$("settingsBtn").addEventListener("click",()=>chrome.runtime.openOptionsPage());
$("refreshBtn").addEventListener("click",refresh);
$("floatCellBtn")?.addEventListener("click",openPopupCellFloat);
$("wifiToggleBtn").addEventListener("click",toggleWifi);
$("openMonitorBtn").addEventListener("click",()=>send({type:"openMonitor"}));

(async()=>{
  const s=await chrome.storage.local.get(["theme","refreshInterval"]);
  setTheme(RouterCore.sanitizeTheme(s.theme));
  await load();
  setInterval(load,RouterCore.sanitizeRefreshInterval(s.refreshInterval));
})();

function pauseUntilFromPreset(preset){
  const now = new Date();
  if(preset === "1h") return Date.now() + 60 * 60 * 1000;
  if(preset === "8h") return Date.now() + 8 * 60 * 60 * 1000;
  if(preset === "tomorrow"){
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(8,0,0,0);
    return t.getTime();
  }
  return "indefinite";
}

function formatPauseStatus(state){
  if(!state?.paused) return "Running normally";
  if(state.until === "indefinite") return "Paused until you enable it";
  return `Paused until ${new Date(state.until).toLocaleString()}`;
}

async function refreshPauseControls(){
  const status = document.getElementById("pauseStatus");
  const pauseBtn = document.getElementById("pauseMenuBtn");
  const resumeBtn = document.getElementById("resumeBtn");
  const menu = document.getElementById("pauseMenu");

  try{
    const state = await send({type:"getExtensionPauseState"},3000);
    const paused = state?.paused === true;
    if(status) status.textContent = formatPauseStatus(state);
    if(pauseBtn) pauseBtn.classList.toggle("hidden", paused);
    if(resumeBtn) resumeBtn.classList.toggle("hidden", !paused);
    if(menu) menu.classList.add("hidden");
  }catch(error){
    if(status) status.textContent = "Unable to read monitoring state";
    if(pauseBtn) pauseBtn.classList.remove("hidden");
    if(resumeBtn) resumeBtn.classList.add("hidden");
  }
}

document.getElementById("pauseMenuBtn")?.addEventListener("click",()=>{
  document.getElementById("pauseMenu")?.classList.toggle("hidden");
});

document.querySelectorAll("#pauseMenu [data-pause]").forEach(btn=>btn.addEventListener("click",async()=>{
  const until = pauseUntilFromPreset(btn.dataset.pause);
  const result=await send({type:"pauseExtension",until},3000);
  await refreshPauseControls();
  if(result?.paused){
    const detail=result.until==="indefinite"
      ? "Monitoring is paused until you enable it."
      : `Monitoring is paused until ${new Date(result.until).toLocaleString()}.`;
    showStateOverlay("paused",detail);
  }
}));

document.getElementById("resumeBtn")?.addEventListener("click",async()=>{
  const btn=document.getElementById("resumeBtn");
  const previous=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent="Enabling…";}
  try{
    const result=await send({type:"resumeExtension"},7000);
    if(result?.success===false) throw new Error(result.message||"Unable to enable monitoring");
    hideError();
    await refreshPauseControls();
    await load();
  }catch(error){
    showError(error.message||"Unable to enable monitoring");
  }finally{
    if(btn){btn.disabled=false;btn.textContent=previous||"▶ Enable Monitoring";}
  }
});

refreshPauseControls();


$("overlayPrimaryBtn")?.addEventListener("click",async()=>{
  if(currentOverlayState==="paused") await resumeFromOverlay();
  else if(currentOverlayState==="offline") await retryFromOverlay();
});

$("overlaySecondaryBtn")?.addEventListener("click",()=>{
  chrome.runtime.openOptionsPage();
});
