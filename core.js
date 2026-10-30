(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RouterCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_SETTINGS = Object.freeze({
    routerOrigin: "http://192.168.8.1",
    routerType: "auto",
    detectedRouterType: "zlt",
    routerUsername: "admin",
    routerPasswordHash: "21232f297a57a5a743894a0e4a801fc3",
    refreshInterval: 1000,
    theme: "dark",
    speedUnit: "KB/s"
  });

  function normalizeRouterOrigin(value) {
    let input = String(value || "").trim();
    if (!input) throw new Error("Router IP address / URL is required.");
    if (!/^https?:\/\//i.test(input)) input = `http://${input}`;
    let url;
    try { url = new URL(input); } catch { throw new Error("Invalid router address."); }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Router address must use HTTP or HTTPS.");
    if (!url.hostname) throw new Error("Router hostname is required.");
    return `${url.protocol}//${url.host}`;
  }

  function apiUrl(origin) {
    return `${normalizeRouterOrigin(origin)}/cgi-bin/http.cgi`;
  }

  function permissionPattern(origin) {
    return `${normalizeRouterOrigin(origin)}/*`;
  }

  function sanitizeRefreshInterval(value) {
    const n = Number(value);
    return n === 500 ? 500 : 1000;
  }

  function sanitizeTheme(value) {
    return value === "light" ? "light" : "dark";
  }

  function sanitizeSpeedUnit(value) {
    return value === "Mbps" ? "Mbps" : "KB/s";
  }

  function sanitizeRouterType(value) {
    return ["auto", "huawei", "zlt"].includes(value) ? value : "auto";
  }

  function sanitizeDetectedRouterType(value) {
    return value === "huawei" ? "huawei" : "zlt";
  }

  function signalDisplay(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return { value: "--", text: "-- dBm", quality: "unknown" };
    const signed = n > 0 ? -Math.abs(n) : n;
    const abs = Math.abs(signed);
    return {
      value: Math.round(signed),
      text: `${Math.round(signed)} dBm`,
      quality: abs <= 105 ? "good" : "weak"
    };
  }

  function formatMbps(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(1) : "0.0";
  }

  function formatKB(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)).toString() : "0";
  }

  function buildLiveTitle(status, speedUnit = "KB/s") {
    if (!status || status.status === "configuration_required") {
      return "⚙ Setup Required | Router Monitor";
    }
    if (status.status !== "connected") {
      if (status.status === "connecting" || status.status === "authenticating") {
        return "● Connecting… | Router Monitor";
      }
      return "● Offline | Router Monitor";
    }

    const unit = sanitizeSpeedUnit(speedUnit);
    const down = unit === "Mbps"
      ? formatMbps(status.speed && status.speed.downloadMbps)
      : formatKB(status.speed && status.speed.downloadKB);
    const up = unit === "Mbps"
      ? formatMbps(status.speed && status.speed.uploadMbps)
      : formatKB(status.speed && status.speed.uploadKB);
    const signal = signalDisplay(status.router && status.router.rssi).value;

    return unit === "Mbps"
      ? `↑${up}Mbps ↓${down}Mbps 📶${signal} | Router Monitor`
      : `↑${up}KB/s ↓${down}KB/s 📶${signal} | Router Monitor`;
  }

  function calculateSpeed(previous, current, elapsedMs) {
    const elapsed = Number(elapsedMs) / 1000;
    if (!previous || !current || !Number.isFinite(elapsed) || elapsed <= 0) {
      return { uploadKB: 0, downloadKB: 0, uploadMbps: 0, downloadMbps: 0 };
    }
    const prevRx = Number(previous.rx);
    const prevTx = Number(previous.tx);
    const rx = Number(current.rx);
    const tx = Number(current.tx);
    if (![prevRx, prevTx, rx, tx].every(Number.isFinite)) {
      return { uploadKB: 0, downloadKB: 0, uploadMbps: 0, downloadMbps: 0 };
    }
    const rxDiff = Math.max(0, rx - prevRx);
    const txDiff = Math.max(0, tx - prevTx);
    return {
      downloadKB: Number((rxDiff / elapsed / 1024).toFixed(2)),
      uploadKB: Number((txDiff / elapsed / 1024).toFixed(2)),
      downloadMbps: Number((rxDiff * 8 / elapsed / 1000000).toFixed(3)),
      uploadMbps: Number((txDiff * 8 / elapsed / 1000000).toFixed(3))
    };
  }

  return {
    DEFAULT_SETTINGS,
    normalizeRouterOrigin,
    apiUrl,
    permissionPattern,
    sanitizeRefreshInterval,
    sanitizeTheme,
    sanitizeSpeedUnit,
    sanitizeRouterType,
    sanitizeDetectedRouterType,
    signalDisplay,
    formatMbps,
    formatKB,
    buildLiveTitle,
    calculateSpeed
  };
});
