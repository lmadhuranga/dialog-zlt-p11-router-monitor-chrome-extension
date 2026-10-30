(function (root, factory) {
  const api = factory(root.RouterCore);
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  root.RouterStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Core) {
  async function initializeSettings(storage) {
    const current = await storage.get(Object.keys(Core.DEFAULT_SETTINGS));
    const missing = {};
    for (const [key, value] of Object.entries(Core.DEFAULT_SETTINGS)) {
      if (current[key] === undefined) missing[key] = value;
    }
    if (Object.keys(missing).length) await storage.set(missing);
    return { ...Core.DEFAULT_SETTINGS, ...current, ...missing };
  }

  async function getSettings(storage) {
    await initializeSettings(storage);
    const settings = await storage.get(Object.keys(Core.DEFAULT_SETTINGS));
    return {
      ...Core.DEFAULT_SETTINGS,
      ...settings,
      routerOrigin: Core.normalizeRouterOrigin(settings.routerOrigin || Core.DEFAULT_SETTINGS.routerOrigin),
      routerType: Core.sanitizeRouterType(settings.routerType),
      detectedRouterType: Core.sanitizeDetectedRouterType(settings.detectedRouterType),
      refreshInterval: Core.sanitizeRefreshInterval(settings.refreshInterval),
      theme: Core.sanitizeTheme(settings.theme),
      speedUnit: Core.sanitizeSpeedUnit(settings.speedUnit)
    };
  }

  return { initializeSettings, getSettings };
});
