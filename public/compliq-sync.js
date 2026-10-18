(() => {
  const sharedKeys = new Set([
    'reude_fleet_db',
    'compliq_anomaly_boxes',
    'compliq_defect_overrides',
    'compliq_orgs',
    'compliq_orgs_solar'
  ]);
  const storageSetItem = Storage.prototype.setItem;
  const pendingWrites = new Map();
  let ready = false;
  let hydration;

  function reportSyncError(key, error) {
    console.error(`Could not sync ${key} with Supabase.`, error);
    if (typeof window.showToast === 'function') {
      window.showToast(`Saved ${key} on this device, but could not sync it to Supabase.`, 'error');
    }
  }

  async function writeRemote(key, value) {
    const previous = pendingWrites.get(key) || Promise.resolve();
    const write = previous.catch(() => {}).then(async () => {
      const response = await fetch(`/api/data/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: value
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    });
    pendingWrites.set(key, write);
    try {
      await write;
    } catch (error) {
      reportSyncError(key, error);
    }
  }

  Storage.prototype.setItem = function(key, value) {
    storageSetItem.call(this, key, value);
    if (this === window.localStorage && ready && sharedKeys.has(key)) {
      void writeRemote(key, value);
    }
  };

  async function hydrate() {
    if (hydration) return hydration;
    hydration = (async () => {
      for (const key of sharedKeys) {
        const response = await fetch(`/api/data/${encodeURIComponent(key)}`);
        const remoteValue = await response.json().catch(() => null);
        if (!response.ok) throw new Error(remoteValue?.error || `Could not load ${key} from Supabase.`);

        if (remoteValue !== null) {
          storageSetItem.call(window.localStorage, key, JSON.stringify(remoteValue));
        } else {
          const localValue = window.localStorage.getItem(key);
          if (localValue !== null) await writeRemote(key, localValue);
        }
      }
      ready = true;
    })();
    try {
      await hydration;
    } catch (error) {
      hydration = null;
      throw error;
    }
  }

  window.CompliQSync = { hydrate };
})();
