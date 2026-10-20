/*
 * REUDE Dashboard — Core Application Engine v2.0
 * Color Palette: #003135 | #024950 | #964734 | #0FA4AF | #AFDDE5
 * Features: Auth Gate, Fleet State, MQTT Sim, PDF Reports, Manual Entry, AI Copilot
 */

'use strict';

// ══════════════════════════════════════════════════
// 1. SESSION & AUTH GATE
// ══════════════════════════════════════════════════
const SESSION_KEY = 'compliq_session';

async function checkAuth() {
  const loading = document.getElementById('auth-loading');
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    if (loading) loading.style.display = 'none';
    document.getElementById('auth-gate').style.display = 'flex';
    document.getElementById('app-wrap').style.display = 'none';
  } else {
    let user;
    try {
      const response = await fetch('/api/auth/session');
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your session has expired.');
      const savedSession = JSON.parse(session);
      user = { ...result.user, sector: savedSession.sector || result.user.sector };
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      if (window.CompliQSync) await window.CompliQSync.hydrate();
    } catch (error) {
      localStorage.removeItem(SESSION_KEY);
      if (loading) loading.style.display = 'none';
      document.getElementById('auth-gate').style.display = 'flex';
      document.getElementById('app-wrap').style.display = 'none';
      showToast(error.message || 'Could not connect to the shared CompliQ server.', 'error');
      return;
    }

    if (loading) loading.style.display = 'none';
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('app-wrap').style.display = 'flex';
    const initials = `${user.firstName?.[0] || 'O'}${user.lastName?.[0] || 'P'}`;
    const av = document.getElementById('user-av');
    const nameEl = document.getElementById('user-display-name');
    const roleEl = document.getElementById('user-display-role');
    if (av) {
      if (user.avatarUrl) {
        const image = document.createElement('img');
        image.src = user.avatarUrl;
        image.alt = '';
        image.onerror = () => { av.textContent = initials; };
        av.replaceChildren(image);
      } else av.textContent = initials;
    }
    if (nameEl) nameEl.textContent = `${user.firstName || 'Operator'} ${user.lastName || ''}`.trim();
    if (roleEl) roleEl.textContent = user.role || 'Fleet Operator';
    
    // Show admin button if user is administrator
    const adminBtn = document.getElementById('admin-nav-btn');
    if (user.role === 'Administrator' || user.email === 'admin@reude.tech') {
      if (adminBtn) {
        adminBtn.style.display = 'flex';
        adminBtn.onclick = () => window.location.href = 'admin.html';
      }
    }
    
    initApp();
    // Save wind session for sector switching
    const windRaw = localStorage.getItem('compliq_session');
    if (windRaw) {
      const windUser = JSON.parse(windRaw);
      if (windUser.sector === 'wind' || !windUser.sector) {
        localStorage.setItem('compliq_wind_session', windRaw);
      }
    }
  }
}

async function handleLogout() {
  const SESSION_KEY = 'compliq_session';
  const ACTIVE_SESSIONS_KEY = 'compliq_active_sessions';
  
  // Get current user email
  const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  
  // Remove from active sessions
  if (sess && sess.email) {
    let activeSessions = JSON.parse(localStorage.getItem(ACTIVE_SESSIONS_KEY) || '{}');
    delete activeSessions[sess.email];
    localStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(activeSessions));
  }
  
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Could not sign out from Supabase.');
  } catch (error) {
    showToast(error.message, 'error');
    return;
  }
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

// ══════════════════════════════════════════════════
// 2. DATABASE / STATE STORE
// ══════════════════════════════════════════════════
const DB_KEY = 'reude_fleet_db';

const DEFAULT_TURBINES = [
  {
    id: 1, assetId: 'WTG-001', name: 'WTG-001-Tamil Nadu - Kayathar - Gamesa G97',
    site: 'Kayathar', state: 'Tamil Nadu',
    gps: { lat: 8.3833, lng: 77.3292 }, location: 'Kayathar, Tamil Nadu',
    status: 'warning', health: 78, rotorDia: 97, bladeLength: 48.5, hubHeight: 90, power: 2.0,
    manufacturer: 'Siemens Gamesa', model: 'Gamesa G97 2 MW', commYear: 2018,
    windSpeed: 11.2, rpm: 14.5, inspCoverage: 100,
    lastInspection: '2026-04-12', campaign: 'REU_WT_IR_003_2026',
    anomalies: 7, defects: ['DEF-001'], blades: ['5297', '5310', '5288']
  },
  {
    id: 2, assetId: 'WTG-002', name: 'Rajasthan Zephyr',
    site: 'Jaisalmer Wind Park', state: 'Rajasthan',
    gps: { lat: 26.9157, lng: 70.9083 }, location: 'Jaisalmer, Rajasthan',
    status: 'warning', health: 71, rotorDia: 140, hubHeight: 110, power: 3.6,
    manufacturer: 'Siemens Gamesa', model: 'SG 3.4-132', commYear: 2020,
    windSpeed: 9.8, rpm: 12.3, inspCoverage: 87,
    lastInspection: '2026-03-28', campaign: 'INSP-2026-Q1',
    anomalies: 3, defects: ['DEF-002', 'DEF-003', 'DEF-004']
  },
  {
    id: 3, assetId: 'WTG-003', name: 'Gujarat Cyclone',
    site: 'Kutch Wind Energy Zone', state: 'Gujarat',
    gps: { lat: 23.2420, lng: 69.6669 }, location: 'Kutch District, Gujarat',
    status: 'critical', health: 48, rotorDia: 150, hubHeight: 120, power: 4.2,
    manufacturer: 'GE Renewable Energy', model: 'GE 4.0-150', commYear: 2019,
    windSpeed: 14.6, rpm: 10.9, inspCoverage: 94,
    lastInspection: '2026-05-01', campaign: 'INSP-2026-Q2',
    anomalies: 5, defects: ['DEF-005', 'DEF-006', 'DEF-007', 'DEF-008', 'DEF-009']
  },
  {
    id: 4, assetId: 'WTG-004', name: 'Karnataka Sierra',
    site: 'Chitradurga Wind Power Project', state: 'Karnataka',
    gps: { lat: 14.2251, lng: 76.3981 }, location: 'Chitradurga, Karnataka',
    status: 'normal', health: 89, rotorDia: 120, hubHeight: 85, power: 2.1,
    manufacturer: 'Suzlon', model: 'S111-2.1 MW', commYear: 2022,
    windSpeed: 8.7, rpm: 16.2, inspCoverage: 100,
    lastInspection: '2026-05-20', campaign: 'INSP-2026-Q2',
    anomalies: 1, defects: ['DEF-010']
  },
  {
    id: 5, assetId: 'WTG-005', name: 'Andhra Coast',
    site: 'Ramayapatnam Offshore Wind', state: 'Andhra Pradesh',
    gps: { lat: 15.5200, lng: 80.0860 }, location: 'Bay of Bengal, Prakasam Dist, AP',
    status: 'warning', health: 74, rotorDia: 164, hubHeight: 130, power: 5.0,
    manufacturer: 'Vestas', model: 'V164-5.0 MW', commYear: 2023,
    windSpeed: 16.3, rpm: 9.2, inspCoverage: 92,
    lastInspection: '2026-06-01', campaign: 'INSP-2026-Q2',
    anomalies: 2, defects: ['DEF-011', 'DEF-012']
  },
  {
    id: 6, assetId: 'WTG-006', name: 'Maharashtra Ridge',
    site: 'Satara Wind Energy Project', state: 'Maharashtra',
    gps: { lat: 17.6805, lng: 73.9285 }, location: 'Satara District, Maharashtra',
    status: 'normal', health: 96, rotorDia: 115, hubHeight: 80, power: 2.0,
    manufacturer: 'Inox Wind', model: 'DF100-2.0 MW', commYear: 2023,
    windSpeed: 10.1, rpm: 17.0, inspCoverage: 100,
    lastInspection: '2026-06-10', campaign: 'INSP-2026-Q2',
    anomalies: 0, defects: []
  }
];

const DEFAULT_DEFECTS = [
  { id: 'DEF-001', assetId: 1, blade: 'A', dist: 11.2, type: 'Corrosion', confidence: 0.91, severity: 4, priority: 'HIGH', action: 'Close-up confirmation of collar / hub interface staining', status: 'Pending', method: 'Drone RGB', gps: '8.3833, 77.3294', campaign: 'REU_WT_IR_003_2026', inspDate: '2026-04-12', notes: 'PS root/hub corrosion banding on Blade 5297.', radialPos: '11.2 m (23%)', intensity: 'S4 Major', location: 'PS · Root / Hub', size: '14×42% frame' },
  { id: 'DEF-002', assetId: 2, blade: 'B', dist: 52, type: 'Delamination', confidence: 0.94, severity: 4, priority: 'HIGH', action: 'Dispatch maintenance crew within 14 days', status: 'Dispatched', method: 'Thermal Imaging', gps: '26.9157, 70.9085', campaign: 'INSP-2026-Q1', inspDate: '2026-03-28', notes: 'Subsurface delamination confirmed via thermal. ~420cm² affected area.' },
  { id: 'DEF-003', assetId: 2, blade: 'A', dist: 18, type: 'Erosion', confidence: 0.88, severity: 2, priority: 'LOW', action: 'Apply leading edge protection coating at next maintenance window', status: 'Pending', method: 'Drone RGB', gps: '26.9160, 70.9080', campaign: 'INSP-2026-Q1', inspDate: '2026-03-28', notes: 'Stage 2 leading edge erosion. Standard wear for age.' },
  { id: 'DEF-004', assetId: 2, blade: 'C', dist: 67, type: 'Crack', confidence: 0.79, severity: 3, priority: 'MEDIUM', action: 'Acoustic NDT validation within 21 days', status: 'Pending', method: 'Drone RGB', gps: '26.9155, 70.9090', campaign: 'INSP-2026-Q1', inspDate: '2026-03-28', notes: 'Possible crack detected near tip. Low confidence — acoustic NDT recommended.' },
  { id: 'DEF-005', assetId: 3, blade: 'A', dist: 72, type: 'Lightning', confidence: 0.98, severity: 5, priority: 'CRITICAL', action: 'IMMEDIATE HALT — emergency structural assessment required', status: 'Pending', method: 'Drone RGB + Thermal', gps: '23.2420, 69.6671', campaign: 'INSP-2026-Q2', inspDate: '2026-05-01', notes: 'Lightning strike at tip — carbon fibre breach. Catastrophic failure risk if unattended.' },
  { id: 'DEF-006', assetId: 3, blade: 'B', dist: 45, type: 'Delamination', confidence: 0.96, severity: 5, priority: 'CRITICAL', action: 'Immediate maintenance dispatch and turbine shutdown', status: 'Pending', method: 'Thermal Imaging', gps: '23.2422, 69.6669', campaign: 'INSP-2026-Q2', inspDate: '2026-05-01', notes: 'Severe leading edge delamination. 1.2m span affected. Shutdown strongly advised.' },
  { id: 'DEF-007', assetId: 3, blade: 'C', dist: 30, type: 'Crack', confidence: 0.93, severity: 4, priority: 'HIGH', action: 'Dispatch repair team within 7 days', status: 'Dispatched', method: 'Acoustic NDT', gps: '23.2418, 69.6668', campaign: 'INSP-2026-Q2', inspDate: '2026-05-01', notes: 'Transverse crack at 30m. Penetration ~4mm confirmed by acoustic NDT.' },
  { id: 'DEF-008', assetId: 3, blade: 'A', dist: 15, type: 'Erosion', confidence: 0.87, severity: 3, priority: 'MEDIUM', action: 'Apply protective coating at next scheduled access', status: 'Resolved', method: 'Drone RGB', gps: '23.2421, 69.6670', campaign: 'INSP-2026-Q2', inspDate: '2026-05-01', notes: 'Root section erosion. Protective coating applied 2026-05-18.' },
  { id: 'DEF-009', assetId: 3, blade: 'B', dist: 60, type: 'Crack', confidence: 0.91, severity: 4, priority: 'HIGH', action: 'Fibre-reinforced patch repair — schedule within 5 days', status: 'Pending', method: 'Drone RGB', gps: '23.2419, 69.6672', campaign: 'INSP-2026-Q2', inspDate: '2026-05-01', notes: 'Secondary crack on pressure side. Requires composite patch repair.' },
  { id: 'DEF-010', assetId: 4, blade: 'B', dist: 25, type: 'Erosion', confidence: 0.82, severity: 2, priority: 'LOW', action: 'Add to next scheduled maintenance', status: 'Pending', method: 'Drone RGB', gps: '14.2253, 76.3983', campaign: 'INSP-2026-Q2', inspDate: '2026-05-20', notes: 'Minor erosion at 25m mark. Monitor only at this stage.' },
  { id: 'DEF-011', assetId: 5, blade: 'A', dist: 88, type: 'Delamination', confidence: 0.91, severity: 4, priority: 'HIGH', action: 'Dispatch offshore crew — weather window dependent', status: 'Dispatched', method: 'Thermal Imaging', gps: '15.5202, 80.0862', campaign: 'INSP-2026-Q2', inspDate: '2026-06-01', notes: 'Trailing edge delamination near tip. 680cm² area. Offshore access required.' },
  { id: 'DEF-012', assetId: 5, blade: 'C', dist: 55, type: 'Crack', confidence: 0.85, severity: 3, priority: 'MEDIUM', action: 'UAV re-inspection and 3D photogrammetry within 21 days', status: 'Pending', method: 'Drone RGB', gps: '15.5200, 80.0860', campaign: 'INSP-2026-Q2', inspDate: '2026-06-01', notes: 'Surface crack. Photogrammetric survey recommended to assess depth.' }
];

// Load from localStorage or use defaults
function loadDB() {
  const stored = localStorage.getItem(DB_KEY);
  let db;
  if (stored) {
    try { db = JSON.parse(stored); }
    catch(e) { db = null; }
  }
  if (!db) {
    db = { turbines: [...DEFAULT_TURBINES], defects: [...DEFAULT_DEFECTS], manualRecords: [], inspectionLogs: [] };
  }
  migrateFleetDb(db);
  saveDB(db);
  return db;
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  fetch(`/api/data/${encodeURIComponent(DB_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(db)
  }).then(async response => {
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Could not sync fleet data to Supabase.');
    }
  }).catch(error => {
    console.error('Fleet data sync failed.', error);
    showToast('Fleet data is saved on this device but could not sync to Supabase.', 'error');
  });
}

function turbineLabel(t) {
  if (!t) return '';
  if (t.name && t.assetId && String(t.name).startsWith(t.assetId)) return t.name;
  return `${t.assetId} — ${t.name}`;
}

function migrateFleetDb(db) {
  if (!db?.turbines?.length) return;
  const t1 = db.turbines.find(t => t.id === 1);
  const template = DEFAULT_TURBINES[0];
  if (t1 && (t1.model !== template.model || t1.bladeLength !== template.bladeLength || t1.name !== template.name || t1.site !== template.site)) {
    Object.assign(t1, {
      name: template.name,
      site: template.site,
      location: template.location,
      manufacturer: template.manufacturer,
      model: template.model,
      rotorDia: template.rotorDia,
      bladeLength: template.bladeLength,
      power: template.power,
      hubHeight: template.hubHeight,
      campaign: template.campaign,
      anomalies: template.anomalies,
      health: template.health,
      status: template.status,
      blades: template.blades
    });
  }
  db.turbines.forEach(t => {
    if (t.bladeLength == null && t.rotorDia) t.bladeLength = +(t.rotorDia / 2).toFixed(1);
  });
}

let STATE = {
  db: null,
  selectedTurbineId: 1,
  selectedBlade: 'A',
  selectedPart: 'full',
  activeDefect: null,
  zoomLevel: 1,
  filterMode: 'all',
  manualRecords: [],
  pocStationId: 1,
  pocMode: false,
  pocSurface: 'PS',
  pocPointIndex: 5,
  pocSelectedDefectId: null,
  assetEpoch: 0,
  activeTab: 'fleet'
};

let _profileFitRO = null;
let _profileFitRaf = 0;

function bumpAssetEpoch() {
  STATE.assetEpoch = (STATE.assetEpoch || 0) + 1;
  return STATE.assetEpoch;
}

function disconnectProfileFit() {
  if (_profileFitRO) {
    try { _profileFitRO.disconnect(); } catch (_) {}
    _profileFitRO = null;
  }
  if (_profileFitRaf) {
    cancelAnimationFrame(_profileFitRaf);
    _profileFitRaf = 0;
  }
}

/** Stop Asset Detail heavy work so leaving the tab cannot freeze navigation. */
function teardownAssetHeavyWork() {
  bumpAssetEpoch();
  disconnectProfileFit();
  stopTurbine3D();
  ['overview-photo', 'asset-poc-annotated'].forEach(id => {
    const img = document.getElementById(id);
    if (!img) return;
    img.onload = null;
    img.onerror = null;
    try { img.removeAttribute('src'); } catch (_) {}
  });
  document.querySelectorAll('#overview-compare img, #asset-compare-host img').forEach(img => {
    img.onload = null;
    img.onerror = null;
    try { img.removeAttribute('src'); } catch (_) {}
  });
}

// ══════════════════════════════════════════════════
// 3. NAVIGATION
// ══════════════════════════════════════════════════
const PAGE_TITLES = {
  fleet: ['Fleet Overview', 'Real-time monitoring of all turbine assets'],
  asset: ['Asset Detail', 'Interactive blade schematic & defect explorer'],
  report: ['Report Viewer', 'CV inspection evidence & engineering assessment'],
  ingest: ['Ingest Data', 'Upload drone imagery, thermal scans & telemetry'],
  manual: ['Manual Entry', 'Record turbine data, defects & inspection events'],
  analytics: ['Analytics', 'Fleet performance trends & defect analysis charts']
};

function activateTab(tab) {
  const next = tab || 'fleet';
  const blocked = document.querySelector(`.nav-item[data-tab="${next}"]`);
  if (blocked && blocked.classList.contains('is-unavailable')) return;
  const leavingAsset = STATE.activeTab === 'asset' && next !== 'asset';
  if (leavingAsset) teardownAssetHeavyWork();

  STATE.activeTab = next;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${next}"]`)?.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${next}`)?.classList.add('active');
  const [title, sub] = PAGE_TITLES[next] || ['Dashboard', ''];
  const titleEl = document.getElementById('page-title');
  const subEl = document.getElementById('page-sub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;

  // Defer heavy page work so the tab switch paints first.
  requestAnimationFrame(() => {
    if (STATE.activeTab !== next) return;
    if (next === 'analytics') renderCharts();
    if (next === 'asset') openAssetOverview();
    if (next === 'report') openReportForSelection();
    if (next === 'manual') populateManualSelects();
    if (next === 'ingest') populateIngestSelects();
  });
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (event) => {
      if (btn.disabled || btn.classList.contains('is-unavailable')) {
        event.preventDefault();
        return;
      }
      activateTab(btn.dataset.tab);
    });
  });
}

// ══════════════════════════════════════════════════
// 4. FLEET METRICS
// ══════════════════════════════════════════════════
function renderMetrics() {
  const db = STATE.db;
  const avgHealth = db.turbines.reduce((s,t) => s + t.health, 0) / db.turbines.length;
  const totalAnomalies = db.turbines.reduce((s,t) => s + t.anomalies, 0);
  const avgCoverage = db.turbines.reduce((s,t) => s + t.inspCoverage, 0) / db.turbines.length;

  animateNumber('m-health', avgHealth.toFixed(1) + '%');
  document.getElementById('m-health-sub').textContent = `${db.turbines.filter(t=>t.status==='normal').length} nominal, ${db.turbines.filter(t=>t.status!=='normal').length} flagged`;
  animateNumber('m-anomalies', totalAnomalies);
  document.getElementById('m-anomalies-sub').textContent = `${db.defects.filter(d=>d.severity>=4).length} critical / high severity`;
  animateNumber('m-coverage', avgCoverage.toFixed(0) + '%');
  document.getElementById('m-cov-sub').textContent = `${db.turbines.length} assets monitored`;
  const capacityMw = db.turbines.reduce((sum, turbine) => sum + (Number(turbine.power) || 0), 0);
  const confSub = document.getElementById('m-conf-sub');
  if (capacityMw >= 1000) {
    animateNumber('m-conf', (capacityMw / 1000).toFixed(1).replace(/\.0$/, '') + ' GW');
    if (confSub) confSub.textContent = `${db.turbines.length} turbines`;
  } else {
    const mwText = (Math.round(capacityMw * 10) / 10);
    animateNumber('m-conf', (mwText % 1 === 0 ? mwText.toFixed(0) : mwText.toFixed(1)) + ' MW');
    if (confSub) confSub.textContent = `${db.turbines.length} turbines`;
  }
}

function animateNumber(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const numVal = parseFloat(target);
  const suffix = target.toString().replace(/[0-9.]/g, '');
  const duration = 1000;
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = (from + (numVal - from) * ease).toFixed(numVal % 1 === 0 ? 0 : 1) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ══════════════════════════════════════════════════
// 5. FLEET GRID
// ══════════════════════════════════════════════════
let fleetStatusFilter = 'all';
const AVAILABLE_DETAILED_ASSET = 'WTG-001';

function isDetailedAssetAvailable(turbine) {
  return turbine?.assetId === AVAILABLE_DETAILED_ASSET;
}

function showAssetComingSoon(turbine) {
  showToast(`${turbine?.assetId || 'This turbine'} detailed view will be updated soon.`, 'info');
}

function renderFleetGrid() {
  const grid = document.getElementById('fleet-grid');
  grid.innerHTML = '';
  let turbines = STATE.db.turbines;
  if (fleetStatusFilter === 'normal') turbines = turbines.filter(t => t.status === 'normal');
  if (fleetStatusFilter === 'warning') turbines = turbines.filter(t => t.status === 'warning');
  if (fleetStatusFilter === 'critical') turbines = turbines.filter(t => t.status === 'critical');
  if (!turbines.length) {
    grid.innerHTML = '<p class="fleet-empty">No turbines in this status.</p>';
    return;
  }
  turbines.forEach(t => {
    const cls = t.status === 'critical' ? 'crit' : t.status === 'warning' ? 'warn' : 'good';
    const card = document.createElement('div');
    card.className = `turbine-node ${t.id === STATE.selectedTurbineId ? 'active' : ''}`;
    card.dataset.id = t.id;
    const spinSpeed = t.status === 'critical' ? '3s' : t.status === 'warning' ? '6s' : '10s';
    card.innerHTML = `
      <div class="t-status-dot ${cls}"></div>
      <div class="t-graphic">
        <div class="t-mast-el"></div>
        <div class="t-hub-el" style="animation: spin-hub ${spinSpeed} linear infinite;">
          <div class="t-blade-el"></div>
          <div class="t-blade-el"></div>
          <div class="t-blade-el"></div>
        </div>
      </div>
      <div class="t-name">${t.assetId}</div>
      <div class="t-health">${t.health}% Health</div>
      <div class="t-loc">${t.site}</div>
    `;
    card.addEventListener('click', () => {
      if (!isDetailedAssetAvailable(t)) {
        hideFleetTurbinePop();
        showAssetComingSoon(t);
        return;
      }
      STATE.selectedTurbineId = t.id;
      document.querySelectorAll('.turbine-node').forEach(n => n.classList.remove('active'));
      card.classList.add('active');
      hideFleetTurbinePop();
      navigateTo('asset');
    });
    card.addEventListener('mouseenter', () => showFleetTurbinePop(card, t));
    card.addEventListener('mouseleave', scheduleHideFleetPop);
    grid.appendChild(card);
  });
}

let fleetPopTimer = null;

function scheduleHideFleetPop() {
  clearTimeout(fleetPopTimer);
  fleetPopTimer = setTimeout(hideFleetTurbinePop, 140);
}

function hideFleetTurbinePop() {
  const pop = document.getElementById('fleet-turbine-pop');
  if (pop) pop.hidden = true;
}

function showFleetTurbinePop(card, t) {
  const pop = document.getElementById('fleet-turbine-pop');
  if (!pop || !t) return;
  clearTimeout(fleetPopTimer);
  const cls = t.status === 'critical' ? 'crit' : t.status === 'warning' ? 'warn' : 'good';
  const gps = t.gps ? `${t.gps.lat}°N, ${t.gps.lng}°E` : '';
  pop.innerHTML = `
    <div class="fleet-pop-head">
      <strong>${escHtml(turbineLabel(t))}</strong>
      <span>${escHtml([t.manufacturer, t.model].filter(Boolean).join(' '))}</span>
    </div>
    <div class="fleet-pop-health">
      <span>${t.health}% Health</span>
      <div class="hbar-bg"><div class="hbar-fill ${cls}" style="width:${Number(t.health) || 0}%"></div></div>
    </div>
    <p>${t.anomalies} anomalies</p>
    <p>${escHtml(t.location || t.site || '')}</p>
    <p>${escHtml(gps)}</p>
    <p>Last: ${escHtml(t.lastInspection || '—')}</p>
  `;
  pop.hidden = false;
  const width = 340;
  const rect = card.getBoundingClientRect();
  let left = rect.left + (rect.width / 2) - (width / 2);
  left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
  pop.style.left = `${left}px`;
  pop.style.top = '0px';
  const height = pop.offsetHeight;
  let top = rect.top - height - 12;
  if (top < 72) top = rect.bottom + 12;
  pop.style.top = `${top}px`;
  pop.onmouseenter = () => clearTimeout(fleetPopTimer);
  pop.onmouseleave = scheduleHideFleetPop;
}

function navigateTo(tab) {
  activateTab(tab);
}

// ══════════════════════════════════════════════════
// 6. ASSET LIST
// ══════════════════════════════════════════════════
function renderAssetList(filter = 'all') {
  const list = document.getElementById('asset-list');
  let turbines = STATE.db.turbines;
  if (filter === 'warn') turbines = turbines.filter(t => t.status !== 'normal');
  if (filter === 'ok') turbines = turbines.filter(t => t.status === 'normal');
  list.innerHTML = '';
  turbines.forEach(t => {
    const cls = t.status === 'critical' ? 'crit' : t.status === 'warning' ? 'warn' : 'good';
    const anomClass = t.anomalies >= 3 ? 'has-crit' : t.anomalies > 0 ? 'has-warn' : 'ok';
    const row = document.createElement('div');
    row.className = 'asset-row';
    row.innerHTML = `
      <div class="asset-thumb" aria-hidden="true">${escHtml(t.assetId)}</div>
      <div class="asset-name">
        <h4>${turbineLabel(t)}</h4>
        <p>${t.manufacturer} ${t.model}</p>
      </div>
      <div class="asset-health-col">
        <span>${t.health}% Health</span>
        <div class="hbar-bg"><div class="hbar-fill ${cls}" style="width:${t.health}%"></div></div>
      </div>
      <div class="asset-anom ${anomClass}">${t.anomalies} anomalies</div>
      <div class="asset-loc">
        <span>${t.location}</span>
        <span class="asset-gps">📍 ${t.gps.lat}°N, ${t.gps.lng}°E</span>
      </div>
      <div style="font-size:0.7rem;color:var(--c-muted)">Last: ${t.lastInspection}</div>
      <button class="view-btn" data-id="${t.id}" ${isDetailedAssetAvailable(t) ? '' : 'disabled'}>${isDetailedAssetAvailable(t) ? 'View Detail →' : 'Will be updated soon'}</button>
    `;
    row.querySelector('.view-btn').addEventListener('click', () => {
      if (!isDetailedAssetAvailable(t)) {
        showAssetComingSoon(t);
        return;
      }
      STATE.selectedTurbineId = t.id;
      navigateTo('asset');
    });
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-btn')) return;
      if (!isDetailedAssetAvailable(t)) {
        showAssetComingSoon(t);
        return;
      }
      STATE.selectedTurbineId = t.id;
      navigateTo('asset');
    });
    list.appendChild(row);
  });
}

document.getElementById('fleet-status-filters')?.addEventListener('click', event => {
  const btn = event.target.closest('.fleet-filter');
  if (!btn) return;
  fleetStatusFilter = fleetStatusFilter === btn.dataset.status ? 'all' : btn.dataset.status;
  document.querySelectorAll('.fleet-filter').forEach(item => {
    item.classList.toggle('active', item.dataset.status === fleetStatusFilter);
  });
  renderFleetGrid();
});

// Filter buttons
document.querySelectorAll('.fbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fbtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAssetList(btn.dataset.f);
  });
});

// ══════════════════════════════════════════════════
// 7. ASSET DETAIL VIEW
// ══════════════════════════════════════════════════
function openAssetOverview() {
  if (STATE.activeTab !== 'asset') return;
  STATE.selectedPart = 'full';
  const sel = document.getElementById('part-selector');
  if (sel) sel.value = 'full';
  renderAssetView();
}

function renderAssetView() {
  if (STATE.activeTab !== 'asset') return;
  const selected = STATE.db.turbines.find(x => x.id === STATE.selectedTurbineId);
  if (selected && !isDetailedAssetAvailable(selected)) {
    showAssetComingSoon(selected);
    STATE.selectedTurbineId = STATE.db.turbines.find(isDetailedAssetAvailable)?.id ?? STATE.db.turbines[0]?.id;
  }
  const epoch = bumpAssetEpoch();
  populateTurbineSelector();
  const t = STATE.db.turbines.find(x => x.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  bindPartSelector(t);
  renderTurbineInfo(t);
  renderPartSchematic(t, STATE.selectedPart, epoch);
  renderDefectsTable(t);
  const backBtn = document.getElementById('asset-back-overview');
  if (backBtn) backBtn.hidden = STATE.selectedPart === 'full';
}

function populateTurbineSelector() {
  const sel = document.getElementById('turbine-selector');
  sel.innerHTML = STATE.db.turbines.map(t =>
    `<option value="${t.id}" ${t.id === STATE.selectedTurbineId ? 'selected' : ''} ${isDetailedAssetAvailable(t) ? '' : 'disabled'}>${escHtml(turbineLabel(t))}${isDetailedAssetAvailable(t) ? '' : ' — Will be updated soon'}</option>`
  ).join('');
  sel.onchange = () => {
    const selected = STATE.db.turbines.find(t => t.id === Number(sel.value));
    if (!isDetailedAssetAvailable(selected)) {
      showAssetComingSoon(selected);
      sel.value = String(STATE.selectedTurbineId);
      return;
    }
    STATE.selectedTurbineId = selected.id;
    renderAssetView();
  };
}

function bindPartSelector(turbine) {
  const sel = document.getElementById('part-selector');
  if (!sel) return;
  sel.value = STATE.selectedPart;
  sel.onchange = () => {
    const epoch = bumpAssetEpoch();
    STATE.selectedPart = sel.value;
    if (sel.value.startsWith('blade-')) {
      STATE.selectedBlade = sel.value.replace('blade-', '');
    }
    renderPartSchematic(turbine, STATE.selectedPart, epoch);
    renderDefectsTable(turbine);
  };
}

function selectedTurbine() {
  return STATE.db?.turbines?.find(item => item.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0] || null;
}

function bladeDisplayName(letter, turbine) {
  const current = turbine || selectedTurbine();
  const index = { A: 0, B: 1, C: 2 }[letter];
  const number = index == null ? '' : (current?.blades || [])[index];
  return number ? `Blade ${number}` : `Blade ${letter}`;
}

function refreshBladeMenus(turbine) {
  const current = turbine || selectedTurbine();
  document.querySelectorAll('#part-selector option').forEach(opt => {
    const letter = String(opt.value || '').replace('blade-', '');
    if (!['A', 'B', 'C'].includes(letter)) return;
    opt.textContent = bladeDisplayName(letter, current);
  });
  document.querySelectorAll('#report-blade option').forEach(opt => {
    if (!['A', 'B', 'C'].includes(opt.value)) return;
    opt.textContent = bladeDisplayName(opt.value, current);
  });
  const defectBlade = document.getElementById('md-blade');
  if (defectBlade) {
    const selected = defectBlade.value;
    defectBlade.innerHTML = ['A', 'B', 'C'].map(letter =>
      `<option value="${letter}">${escHtml(bladeDisplayName(letter, current))}</option>`
    ).join('');
    if (selected) defectBlade.value = selected;
  }
}

function renderTurbineInfo(t) {
  const extra = document.getElementById('turbine-details-extra');
  const toggle = document.getElementById('turbine-details-toggle');
  if (!extra || !t) return;
  refreshBladeMenus(t);
  extra.innerHTML = `
    <div class="turbine-extra-grid">
      ${stat('Location', t.location)}
      ${stat('GPS Coordinates', `${t.gps.lat}°N, ${t.gps.lng}°E`)}
      ${stat('State', t.state)}
      ${stat('Blade Length', (t.bladeLength || (t.rotorDia/2)) + ' m')}
      ${stat('Hub Height', t.hubHeight + ' m')}
      ${stat('Commission Year', t.commYear)}
      ${stat('Wind Speed', t.windSpeed + ' m/s')}
      ${stat('RPM', t.rpm)}
      ${stat('Anomalies', t.anomalies)}
      ${stat('Last Inspection', t.lastInspection)}
      ${stat('Campaign', t.campaign)}
      ${stat('Blade IDs', (t.blades || []).join(', ') || '—')}
    </div>
  `;

  const row = extra.closest('.asset-turbine-row');
  const pop = toggle && toggle.closest('.turbine-details-pop');
  if (row && pop && !row.dataset.bound) {
    let closeTimer = 0;
    const setOpen = (open) => {
      row.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const holdOpen = () => {
      window.clearTimeout(closeTimer);
      setOpen(true);
    };
    const queueClose = () => {
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => setOpen(false), 160);
    };
    pop.addEventListener('mouseenter', holdOpen);
    pop.addEventListener('mouseleave', queueClose);
    extra.addEventListener('mouseenter', holdOpen);
    extra.addEventListener('mouseleave', queueClose);
    pop.addEventListener('focusin', holdOpen);
    pop.addEventListener('focusout', queueClose);
    row.dataset.bound = '1';
  }
}

function stat(label, value) {
  return `<div class="info-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

function setPocEvidenceVisible(show) {
  const workspace = document.getElementById('asset-poc-workspace');
  const defaultPanel = document.getElementById('asset-default-schematic-panel');
  const standalone = document.getElementById('asset-defects-standalone');
  const view = document.getElementById('view-asset');
  const pdfBtn = document.getElementById('asset-pdf-btn');

  if (workspace) {
    workspace.hidden = !show;
    workspace.classList.toggle('is-hidden', !show);
  }
  if (defaultPanel) {
    defaultPanel.hidden = !!show;
    defaultPanel.classList.toggle('is-hidden', !!show);
  }
  if (standalone) {
    standalone.hidden = !!show;
    standalone.classList.toggle('is-hidden', !!show);
  }
  if (view) view.classList.toggle('poc-layout', !!show);
  const pocTable = document.getElementById('asset-defects-panel');
  if (pocTable) {
    pocTable.hidden = !show;
    pocTable.classList.toggle('is-hidden', !show);
  }
  if (show) {
    const host = document.getElementById('asset-compare-host');
    if (host) host.replaceChildren();
  }
  updateFindingsSheetMeta();
  if (pdfBtn) {
    pdfBtn.textContent = '⬇ AI inspection report (PDF)';
  }
  STATE.pocMode = !!show;
}

function updateFindingsSheetMeta() {
  const countEl = document.getElementById('asset-sheet-count');
  const hintEl = document.getElementById('asset-sheet-hint');
  const sheet = document.getElementById('asset-bottom-sheet');
  if (!countEl || !hintEl) return;
  let n = 0;
  if (STATE.pocMode) {
    n = document.querySelectorAll('#defects-tbody tr.defect-row').length;
  } else {
    try { n = overviewAnomalyRows().length; } catch (_) { n = 0; }
  }
  countEl.textContent = n ? `${n} anomal${n === 1 ? 'y' : 'ies'}` : '';
  const open = sheet?.classList.contains('is-open');
  hintEl.textContent = open
    ? (STATE.pocMode ? 'Hide defect table' : 'Hide comparison & table')
    : (STATE.pocMode ? 'Show defect table' : 'Show comparison & table');
}

async function renderPartSchematic(turbine, part, epoch = STATE.assetEpoch) {
  if (STATE.activeTab !== 'asset') return;
  const backBtn = document.getElementById('asset-back-overview');
  if (backBtn) backBtn.hidden = (part || STATE.selectedPart) === 'full';
  const title = document.getElementById('schematic-title');
  const titleDefault = document.getElementById('schematic-title-default');
  const hint = document.getElementById('schematic-hint');
  const bladeLetter = part.startsWith('blade-') ? part.replace('blade-', '') : '';

  if (bladeLetter === 'A' || bladeLetter === 'B' || bladeLetter === 'C') {
    if (title) title.textContent = bladeDisplayName(bladeLetter);
    if (hint) hint.textContent = '';
    setPocEvidenceVisible(true);
    await renderBladeAPocProfile(epoch);
    return;
  }

  disconnectProfileFit();
  setPocEvidenceVisible(false);
  const container = document.getElementById('blade-schematic-default');
  const legend = document.getElementById('schematic-legend');
  if (legend) legend.hidden = true;
  if (part === 'full') {
    if (titleDefault) titleDefault.textContent = 'Full Turbine Overview';
    if (hint) hint.textContent = '';
    await loadBladeFindings();
    if (STATE.activeTab !== 'asset' || epoch !== STATE.assetEpoch || STATE.selectedPart !== 'full') return;
    renderFullTurbineOverview(container, turbine);
    renderDefectsTable(turbine);
    return;
  }

  clearCompareHost();
  if (part.startsWith('blade-')) {
    const blade = part.replace('blade-', '');
    if (titleDefault) titleDefault.textContent = `${bladeDisplayName(blade)} Schematic`;
    if (hint) hint.textContent = '';
    renderBlade(turbine, blade, container);
    return;
  }

  if (titleDefault) titleDefault.textContent = 'Component Schematic';
  if (hint) hint.textContent = '';
  if (container) {
    container.innerHTML = `
      <div class="asset-part-placeholder">
        <strong>${part.replace(/-/g, ' ').toUpperCase()}</strong>
      </div>`;
  }
}

const DUTY_COLOR = { healthy: '#2ECC71', cleaning: '#F5B400', repair: '#F97316', critical: '#EF4444' };
const DUTY_LABEL = { healthy: 'Healthy', cleaning: 'Cleaning needed', repair: 'Repair needed', critical: 'Critical' };
const SIDE_NAME = { SS: 'Suction side', LE: 'Leading edge', PS: 'Pressure side', TE: 'Trailing edge' };
const ANOMALY_BOX_KEY = 'compliq_anomaly_boxes';
/* DNV five-category severity theme for anomaly details + drawn box */
const DEFECT_CLASSES = [
  { name: 'Leading Edge Erosion', cats: 'CAT 1 – 4', detail: 'Pitting, coating loss or laminate exposure along the leading edge', match: /leading edge erosion|le erosion|\blep\b|coating loss/i },
  { name: 'Coating & Gelcoat Damage', cats: 'CAT 1 – 3', detail: 'Chipping, peeling, flaking or pinholes in the surface coating', match: /gelcoat|pinhole|peel|flak|chip|grease|oil|dirt|paint|stain|coating/i },
  { name: 'Cracks', cats: 'CAT 2 – 5', detail: 'Surface or laminate cracks, longitudinal or transverse, on any face', match: /crack|fracture|line mark/i },
  { name: 'Trailing Edge Split / Debonding', cats: 'CAT 3 – 5', detail: 'Opening or separation along the trailing edge bond line', match: /trailing edge|te split|debond/i },
  { name: 'Lightning Strike Damage', cats: 'CAT 2 – 5', detail: 'Burn marks, scorching, punctures or damaged receptors, usually near the tip', match: /lightning|scorch|receptor/i },
  { name: 'Delamination', cats: 'CAT 3 – 5', detail: 'Raised, bubbled or separated laminate layers', match: /delaminat/i }
];

const SEVERITY_UI = {
  1: { label: 'CAT 1 – Cosmetic', name: 'Cosmetic', action: 'No action; record for next inspection', condition: 'Surface marks with no effect on blade integrity or performance', bg: '#E5F3D6', text: '#3E6B32', border: '#A8D08A', stroke: '#6AA84F', fill: 'rgba(106,168,79,0.18)' },
  2: { label: 'CAT 2 – Minor', name: 'Minor', action: 'Monitor; repair at convenience', condition: 'Minor coating damage or early erosion; no structural impact', bg: '#C8E6C9', text: '#1B5E20', border: '#81C784', stroke: '#2E7D32', fill: 'rgba(46,125,50,0.18)' },
  3: { label: 'CAT 3 – Moderate', name: 'Moderate', action: 'Repair at next scheduled maintenance (within 6 months)', condition: 'Damage reaching the laminate surface; will progress if untreated', bg: '#FFF3C4', text: '#8A6D00', border: '#F5D76E', stroke: '#D4A017', fill: 'rgba(212,160,23,0.22)' },
  4: { label: 'CAT 4 – Serious', name: 'Serious', action: 'Repair within 1–3 months; increased monitoring', condition: 'Structural laminate damage; progression risk to blade integrity', bg: '#FFE0C2', text: '#C2410C', border: '#F5B183', stroke: '#E07A2F', fill: 'rgba(224,122,47,0.22)' },
  5: { label: 'CAT 5 – Critical', name: 'Critical', action: 'Stop turbine; immediate repair. Client notified within 24 hours', condition: 'Structural failure risk; major cracks, TE split or severe lightning damage', bg: '#F8D0D0', text: '#B71C1C', border: '#E8A0A0', stroke: '#D32F2F', fill: 'rgba(211,47,47,0.22)' }
};

function matchDefectClass(text) {
  const source = `${text || ''}`;
  return DEFECT_CLASSES.find(item => item.match.test(source)) || null;
}

function severityAction(sev) {
  return SEVERITY_UI[Number(sev)]?.action || '';
}

function fillDefectClassSelect(select, current) {
  if (!select) return;
  const names = DEFECT_CLASSES.map(item => item.name);
  const recorded = `${current || ''}`.trim();
  const options = [];
  if (recorded && !names.includes(recorded)) options.push(recorded);
  options.push(...names);
  select.innerHTML = options.map(name => {
    const spec = DEFECT_CLASSES.find(item => item.name === name);
    const title = spec ? `${spec.detail}. Typical ${spec.cats}` : 'Recorded finding';
    return `<option value="${escHtml(name)}" title="${escHtml(title)}">${escHtml(name)}</option>`;
  }).join('');
  const chosen = options.includes(recorded) ? recorded : (matchDefectClass(recorded)?.name || names[0]);
  select.value = chosen;
}

function bindSeverityAction(sevId, actionId) {
  const sev = document.getElementById(sevId);
  const action = document.getElementById(actionId);
  if (!sev || !action || sev.dataset.actionBound) return;
  sev.dataset.actionBound = '1';
  const apply = () => {
    const next = severityAction(sev.value);
    if (next) action.value = next;
  };
  sev.addEventListener('change', apply);
}

function currentOverviewSeverity() {
  const n = Number(document.getElementById('overview-anomaly-severity')?.value);
  return SEVERITY_UI[n] ? n : 2;
}

function applyOverviewSeverityTheme(cat) {
  const sev = SEVERITY_UI[cat] ? cat : currentOverviewSeverity();
  const theme = SEVERITY_UI[sev];
  const frame = document.getElementById('overview-photo-frame');
  const form = document.getElementById('overview-anomaly-form');
  if (form) {
    form.dataset.sev = String(sev);
    form.style.removeProperty('--anom-bg');
    form.style.removeProperty('--anom-text');
    form.style.removeProperty('--anom-border');
  }
  if (frame) {
    frame.dataset.sev = String(sev);
    frame.style.setProperty('--anom-stroke', theme.stroke);
    frame.style.setProperty('--anom-fill', theme.fill);
  }
  const box = overviewDraftBox() || (() => {
    const row = ensureOverviewAnomaly();
    return row ? (anomalyBoxes()[row.id]?.box || null) : null;
  })();
  if (box) paintOverviewBox(box);
}

function anomalyBoxes() {
  try { return JSON.parse(localStorage.getItem(ANOMALY_BOX_KEY) || '{}'); }
  catch { return {}; }
}

function pruneEmptyAnomalyDrafts(exceptId) {
  const map = anomalyBoxes();
  let changed = false;
  Object.keys(map).forEach(key => {
    if (!String(key).startsWith('custom-') || key === exceptId) return;
    const item = map[key] || {};
    const unnamed = !item.anomalyId || item.anomalyId === 'New anomaly';
    if (!item.box && unnamed && !`${item.type || ''}`.trim()) {
      delete map[key];
      changed = true;
    }
  });
  if (changed) writeAnomalyBoxes(map);
  return anomalyBoxes();
}

function writeAnomalyBoxes(map) {
  localStorage.setItem(ANOMALY_BOX_KEY, JSON.stringify(map));
}

function defectFamily(row) {
  const text = `${row?.finding || ''}`;
  const cls = matchDefectClass(text);
  const kind = cls ? cls.name : 'other';
  const index = Number(row?.index) || 1;
  const zone = index <= 5 ? 'root' : index >= 16 ? 'tip' : 'span';
  return `${kind}-${zone}`;
}

function isMinorAnomaly(row) {
  if (anomalyBoxes()[row.id]) return false;
  const cat = Number(row?.cat) || 1;
  const kind = defectFamily(row).split('-')[0];
  if (cat <= 1) return true;
  if ((kind === 'Coating & Gelcoat Damage' || kind === 'Leading Edge Erosion' || kind === 'other') && cat < 3) return true;
  return false;
}

function findingDuty(row) {
  const cat = Number(row?.cat) || 1;
  if (cat >= 5) return 'critical';
  if (cat >= 3) return 'repair';
  if (cat >= 2) return 'cleaning';
  return 'healthy';
}

function bladeSummaryRows(blade) {
  return overviewAnomalyRows().filter(row => !blade || row.blade === blade);
}

function bladeDuty(blade) {
  const rank = { healthy: 0, cleaning: 1, repair: 2, critical: 3 };
  let worst = 'healthy';
  bladeSummaryRows(blade).forEach(row => {
    const duty = findingDuty(row);
    if (rank[duty] > rank[worst]) worst = duty;
  });
  return worst;
}

function anomalyLabel(row) {
  const saved = anomalyBoxes()[row.id];
  if (saved?.anomalyId) return saved.anomalyId;
  const point = 'P' + String(row.index).padStart(2, '0');
  const code = (String(row.finding || '').match(/^[A-Z]\d+/) || [])[0];
  return code ? `${row.blade}-${row.surface}-${point}-${code}` : `${row.blade}-${row.surface}-${point}`;
}

function overviewAnomalyRows() {
  const saved = pruneEmptyAnomalyDrafts(STATE.overviewAnomalyId);
  const byId = new Map();
  ['A', 'B', 'C'].forEach(blade => {
    findingsForBlade(blade).forEach(row => {
      const over = saved[row.id];
      if (!over) {
        byId.set(row.id, row);
        return;
      }
      const cat = Number(over.severity) || row.cat;
      byId.set(row.id, {
        ...row,
        finding: over.type || row.finding,
        cat,
        color: FINDING_COLOR[cat] || row.color
      });
    });
  });
  Object.entries(saved).forEach(([id, over]) => {
    if (byId.has(id)) return;
    if (String(id).startsWith('custom-') && !over.box && id !== STATE.overviewAnomalyId) return;
    const cat = Number(over.severity) || 2;
    byId.set(id, {
      id,
      blade: over.blade || 'A',
      surface: over.surface || 'PS',
      index: Number(over.index) || 1,
      finding: over.type || '',
      cat,
      color: FINDING_COLOR[cat] || '#F5B400',
      count: 1,
      verify: false
    });
  });
  const rank = { critical: 3, repair: 2, cleaning: 1, healthy: 0 };
  const ranked = [...byId.values()]
    .filter(row => !isMinorAnomaly(row))
    .sort((a, b) => (rank[findingDuty(b)] - rank[findingDuty(a)]) || (b.cat - a.cat) || (a.index - b.index));
  const seen = new Set();
  const unique = [];
  ranked.forEach(row => {
    const kind = defectFamily(row).split('-')[0];
    const text = `${row.finding || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const key = String(row.id).startsWith('custom-')
      ? `custom|${row.id}`
      : (kind === 'other' ? `${row.blade}|${text}` : `${row.blade}|${kind}`);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(row);
  });
  ['A', 'B', 'C'].forEach(blade => {
    if (unique.some(row => row.blade === blade)) return;
    const pool = [...byId.values()].filter(row => row.blade === blade);
    if (!pool.length) return;
    pool.sort((a, b) => (b.cat - a.cat) || (a.index - b.index));
    unique.push(pool[0]);
  });
  unique.sort((a, b) => (rank[findingDuty(b)] - rank[findingDuty(a)]) || (b.cat - a.cat) || (a.index - b.index));
  return unique;
}

function ensureOverviewAnomaly() {
  const rows = overviewAnomalyRows();
  if (!rows.length) {
    STATE.overviewAnomalyId = '';
    return null;
  }
  if (!rows.some(row => row.id === STATE.overviewAnomalyId)) {
    STATE.overviewAnomalyId = (rows.find(row => findingDuty(row) === 'critical') || rows[0]).id;
  }
  return rows.find(row => row.id === STATE.overviewAnomalyId) || null;
}

function bladeSurfacePoint(rot, along) {
  const hub = { x: 180, y: 168 };
  const t = Math.min(0.92, Math.max(0.12, along));
  const dy = -150 * t;
  const rad = rot * Math.PI / 180;
  return {
    x: +(hub.x + dy * -Math.sin(rad)).toFixed(1),
    y: +(hub.y + dy * Math.cos(rad)).toFixed(1)
  };
}

function bladeDutyDots(blade, rot) {
  return bladeSummaryRows(blade).slice(0, 4).map(row => {
    const at = bladeSurfacePoint(rot, ((Number(row.index) || 1) - 1) / 19);
    return { duty: findingDuty(row), id: row.id, ...at };
  });
}

let TURBINE_3D = null;

function stopTurbine3D() {
  if (!TURBINE_3D) return;
  cancelAnimationFrame(TURBINE_3D.frame);
  try { TURBINE_3D.ro?.disconnect(); } catch (_) {}
  try { TURBINE_3D.renderer?.dispose(); } catch (_) {}
  TURBINE_3D = null;
}

async function mountTurbine3D(host, turbine, onPick) {
  if (!host) return;
  stopTurbine3D();
  const epoch = STATE.assetEpoch;
  let THREE;
  let GLTFLoader;
  try {
    THREE = await import('three');
    ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'));
  } catch (err) {
    console.warn('3D rotor unavailable', err);
    host.textContent = '3D view unavailable';
    return;
  }
  if (!host.isConnected || epoch !== STATE.assetEpoch || STATE.activeTab !== 'asset') return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(isLightTheme() ? 0xf2f6fb : 0x0b1d32);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.replaceChildren(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(6, 10, 8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd7e8ee, 0.5);
  fill.position.set(-6, 3, -4);
  scene.add(fill);

  const pivot = new THREE.Group();
  scene.add(pivot);
  const pickables = [];
  const bladeLabels = [];
  let nacelleMesh = null;
  const nacellePieces = [];
  const hubCenterWorld = new THREE.Vector3();
  let bladeRootReach = 0;
  const tagMesh = (mesh, part, label) => {
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(m => m.clone())
      : mesh.material.clone();
    mesh.userData.part = part;
    mesh.userData.label = label;
    pickables.push(mesh);
  };
  const splitBlades = (source) => {
    const geo = source.geometry;
    const pos = geo.attributes.position;
    const norm = geo.attributes.normal;
    const index = geo.index;
    const groups = [0, 1, 2].map(() => ({ pos: [], norm: [] }));
    let maxR = 0;
    for (let i = 0; i < pos.count; i++) {
      maxR = Math.max(maxR, Math.hypot(pos.getX(i), pos.getY(i)));
    }
    const samples = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      if (Math.hypot(x, y) < maxR * 0.5) continue;
      let ang = Math.atan2(x, y);
      if (ang < 0) ang += Math.PI * 2;
      samples.push(ang);
    }
    samples.sort((a, b) => a - b);
    const axes = [];
    if (samples.length > 12) {
      const gaps = samples.map((ang, i) => {
        const nxt = samples[(i + 1) % samples.length];
        let gap = nxt - ang;
        if (i + 1 === samples.length) gap = samples[0] + Math.PI * 2 - ang;
        return { i, gap };
      }).sort((a, b) => b.gap - a.gap).slice(0, 3).sort((a, b) => a.i - b.i);
      gaps.forEach((cut, c) => {
        const end = gaps[(c + 1) % gaps.length].i;
        const cluster = [];
        for (let i = cut.i + 1; ; i++) {
          const k = i % samples.length;
          cluster.push(samples[k]);
          if (k === end) break;
          if (cluster.length > samples.length) break;
        }
        let sx = 0;
        let sy = 0;
        cluster.forEach(ang => { sx += Math.sin(ang); sy += Math.cos(ang); });
        let mean = Math.atan2(sx, sy);
        if (mean < 0) mean += Math.PI * 2;
        axes.push(mean);
      });
    }
    while (axes.length < 3) axes.push((axes.length * Math.PI * 2) / 3);
    const axisVec = axes.map(ang => ({ x: Math.sin(ang), y: Math.cos(ang) }));
    const pushTri = (ia, ib, ic) => {
      const score = [0, 0, 0];
      [ia, ib, ic].forEach(i => {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const weight = x * x + y * y;
        if (weight < 1e-10) return;
        let best = 0;
        let bestDist = Infinity;
        axisVec.forEach((axis, k) => {
          const dist = Math.abs(x * axis.y - y * axis.x);
          if (dist < bestDist) { bestDist = dist; best = k; }
        });
        score[best] += weight;
      });
      let bucket = 0;
      if (score[1] > score[bucket]) bucket = 1;
      if (score[2] > score[bucket]) bucket = 2;
      [ia, ib, ic].forEach(i => {
        groups[bucket].pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (norm) groups[bucket].norm.push(norm.getX(i), norm.getY(i), norm.getZ(i));
      });
    };
    if (index) {
      for (let i = 0; i < index.count; i += 3) pushTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    } else {
      for (let i = 0; i < pos.count; i += 3) pushTri(i, i + 1, i + 2);
    }
    return groups.filter(g => g.pos.length >= 3).map(g => {
      const ggeo = new THREE.BufferGeometry();
      ggeo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      if (g.norm.length) ggeo.setAttribute('normal', new THREE.Float32BufferAttribute(g.norm, 3));
      else ggeo.computeVertexNormals();
      const mesh = new THREE.Mesh(ggeo, source.material.clone());
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale);
      source.parent.add(mesh);
      return mesh;
    });
  };

  try {
    const gltf = await new GLTFLoader().loadAsync('models/wind-turbine.glb');
    if (!host.isConnected || epoch !== STATE.assetEpoch) return;
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);
    pivot.add(model);
    model.updateMatrixWorld(true);

    const named = {};
    model.traverse(obj => { if (obj.isMesh && obj.name) named[obj.name] = obj; });
    const white = named['rotorwhite'] || named['rotor/white'];
    const red = named['rotorred'] || named['rotor/red'];
    const hub = named['rotorcharcoal'] || named['rotor/charcoal'];
    if (white) {
      const whiteSize = new THREE.Box3().setFromObject(white).getSize(new THREE.Vector3());
      const whiteMax = Math.max(whiteSize.x, whiteSize.y, whiteSize.z) || 1;
      const blades = splitBlades(white);
      white.visible = false;
      blades.forEach(mesh => {
        const c = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
        mesh.userData.wy = c.y;
        mesh.userData.ang = Math.atan2(c.x, c.z);
      });
      blades.sort((a, b) => a.userData.wy - b.userData.wy);
      const down = blades[0];
      const rest = blades.slice(1).sort((a, b) => a.userData.ang - b.userData.ang);
      [['A', down], ['B', rest[0]], ['C', rest[1]]].forEach(([letter, mesh]) => {
        if (!mesh) return;
        tagMesh(mesh, 'blade-' + letter, bladeDisplayName(letter, turbine));
        const pos = mesh.geometry.attributes.position;
        let best = 0;
        let bestR = -1;
        for (let i = 0; i < pos.count; i++) {
          const r = pos.getX(i) * pos.getX(i) + pos.getY(i) * pos.getY(i);
          if (r > bestR) { bestR = r; best = i; }
        }
        const localTip = new THREE.Vector3(pos.getX(best), pos.getY(best), pos.getZ(best));
        localTip.multiplyScalar(1.06);
        const el = document.createElement('div');
        el.className = 'blade-tip-label';
        el.textContent = bladeDisplayName(letter, turbine);
        host.appendChild(el);
        bladeLabels.push({ mesh, localTip, el });
      });
      if (red) {
        const redSize = new THREE.Box3().setFromObject(red).getSize(new THREE.Vector3());
        const redMax = Math.max(redSize.x, redSize.y, redSize.z);
        if (redMax > whiteMax * 0.35) {
          const marks = splitBlades(red);
          red.visible = false;
          marks.forEach(mark => {
            const c = new THREE.Box3().setFromObject(mark).getCenter(new THREE.Vector3());
            let best = null;
            let gap = Infinity;
            blades.forEach(blade => {
              const bc = new THREE.Box3().setFromObject(blade).getCenter(new THREE.Vector3());
              const dist = c.distanceTo(bc);
              if (dist < gap) { gap = dist; best = blade; }
            });
            if (best) tagMesh(mark, best.userData.part, best.userData.label);
          });
        } else {
          tagMesh(red, 'hub', 'Hub');
        }
      }
      if (hub) {
        hub.updateWorldMatrix(true, true);
        const hubAttr = hub.geometry?.attributes?.position;
        const hubCenter = new THREE.Vector3();
        const sample = new THREE.Vector3();
        const hubPts = [];
        if (hubAttr) {
          for (let i = 0; i < hubAttr.count; i++) {
            sample.fromBufferAttribute(hubAttr, i);
            hub.localToWorld(sample);
            hubPts.push(sample.clone());
            hubCenter.add(sample);
          }
          hubCenter.multiplyScalar(1 / Math.max(1, hubPts.length));
        }
        let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
        hubPts.forEach(p => {
          const x = p.x - hubCenter.x;
          const y = p.y - hubCenter.y;
          const z = p.z - hubCenter.z;
          xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
        });
        const trace = xx + yy + zz;
        const covMul = (v) => new THREE.Vector3(
          xx * v.x + xy * v.y + xz * v.z,
          xy * v.x + yy * v.y + yz * v.z,
          xz * v.x + yz * v.y + zz * v.z
        );
        let shaft = new THREE.Vector3(1, 1, 1).normalize();
        for (let k = 0; k < 18; k++) {
          const Cv = covMul(shaft);
          shaft.set(trace * shaft.x - Cv.x, trace * shaft.y - Cv.y, trace * shaft.z - Cv.z);
          if (shaft.lengthSq() < 1e-12) { shaft.set(0, 0, 1); break; }
          shaft.normalize();
        }
        const radial = new THREE.Vector3();
        let hubRadius = 0;
        hubPts.forEach(p => {
          radial.copy(p).sub(hubCenter);
          radial.addScaledVector(shaft, -radial.dot(shaft));
          hubRadius = Math.max(hubRadius, radial.length());
        });
        const cutoff = hubRadius * 1.04;
        const project = (v) => {
          const out = v.clone().sub(hubCenter);
          out.addScaledVector(shaft, -out.dot(shaft));
          return out;
        };
        const hubCapPos = [];
        const trimMesh = (mesh, sink) => {
          const geo = mesh.geometry;
          const pos = geo?.attributes?.position;
          if (!pos || cutoff <= 0) return;
          mesh.updateWorldMatrix(true, true);
          const keptPos = [];
          const plane = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
          const segDist = (p, a, b) => {
            const ab = b.clone().sub(a);
            const denom = ab.dot(ab);
            const t = denom < 1e-12 ? 0 : Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / denom));
            return p.distanceTo(a.clone().addScaledVector(ab, t));
          };
          const overlapsHub = () => {
            const a = plane[0];
            const b = plane[1];
            const c = plane[2];
            if (a.length() < cutoff || b.length() < cutoff || c.length() < cutoff) return true;
            const ab = b.clone().sub(a);
            const ac = c.clone().sub(a);
            const d00 = ab.dot(ab);
            const d01 = ab.dot(ac);
            const d11 = ac.dot(ac);
            const denom = d00 * d11 - d01 * d01;
            if (Math.abs(denom) > 1e-8) {
              const d20 = -a.dot(ab);
              const d21 = -a.dot(ac);
              const v = (d11 * d20 - d01 * d21) / denom;
              const w = (d00 * d21 - d01 * d20) / denom;
              const u = 1 - v - w;
              if (u >= -0.02 && v >= -0.02 && w >= -0.02) return true;
            }
            return Math.min(segDist(new THREE.Vector3(), a, b), segDist(new THREE.Vector3(), b, c), segDist(new THREE.Vector3(), c, a)) < cutoff;
          };
          const pushLocal = (a, b, c) => {
            [a, b, c].forEach(v => keptPos.push(v.x, v.y, v.z));
          };
          const worldOf = (local) => mesh.localToWorld(local.clone());
          const refine = (la, lb, lc, depth) => {
            plane[0].copy(project(worldOf(la)));
            plane[1].copy(project(worldOf(lb)));
            plane[2].copy(project(worldOf(lc)));
            if (!overlapsHub()) {
              pushLocal(la, lb, lc);
              return;
            }
            const span = Math.max(plane[0].distanceTo(plane[1]), plane[1].distanceTo(plane[2]), plane[2].distanceTo(plane[0]));
            const inside = plane[0].length() < cutoff && plane[1].length() < cutoff && plane[2].length() < cutoff;
            if (inside || depth >= 8 || span < cutoff * 0.18) {
              if (sink) [la, lb, lc].forEach(v => sink.push(v.x, v.y, v.z));
              return;
            }
            const ab = la.clone().add(lb).multiplyScalar(0.5);
            const bc = lb.clone().add(lc).multiplyScalar(0.5);
            const ca = lc.clone().add(la).multiplyScalar(0.5);
            refine(la, ab, ca, depth + 1);
            refine(ab, lb, bc, depth + 1);
            refine(ca, bc, lc, depth + 1);
            refine(ab, bc, ca, depth + 1);
          };
          const consider = (ia, ib, ic) => {
            refine(
              new THREE.Vector3(pos.getX(ia), pos.getY(ia), pos.getZ(ia)),
              new THREE.Vector3(pos.getX(ib), pos.getY(ib), pos.getZ(ib)),
              new THREE.Vector3(pos.getX(ic), pos.getY(ic), pos.getZ(ic)),
              0
            );
          };
          const geoIndex = geo.index;
          if (geoIndex) {
            for (let i = 0; i < geoIndex.count; i += 3) consider(geoIndex.getX(i), geoIndex.getX(i + 1), geoIndex.getX(i + 2));
          } else {
            for (let i = 0; i < pos.count; i += 3) consider(i, i + 1, i + 2);
          }
          if (keptPos.length < 9) return;
          const next = new THREE.BufferGeometry();
          next.setAttribute('position', new THREE.Float32BufferAttribute(keptPos, 3));
          next.computeVertexNormals();
          geo.dispose();
          mesh.geometry = next;
        };
        blades.forEach(mesh => trimMesh(mesh, hubCapPos));
        blades[0]?.parent?.traverse(obj => {
          if (obj.isMesh && String(obj.userData.part || '').startsWith('blade-') && !blades.includes(obj)) trimMesh(obj);
        });
        if (blades[0]?.material) hub.material = blades[0].material;
        if (hubCapPos.length >= 9 && blades[0]) {
          const capGeo = new THREE.BufferGeometry();
          capGeo.setAttribute('position', new THREE.Float32BufferAttribute(hubCapPos, 3));
          capGeo.computeVertexNormals();
          const cap = new THREE.Mesh(capGeo, hub.material);
          cap.position.copy(blades[0].position);
          cap.quaternion.copy(blades[0].quaternion);
          cap.scale.copy(blades[0].scale);
          blades[0].parent.add(cap);
          tagMesh(cap, 'hub', 'Hub');
          cap.renderOrder = 3;
        }
      }
      const downBlade = blades.find(item => item.userData.part === 'blade-C');
      if (downBlade && hub) {
        downBlade.updateWorldMatrix(true, true);
        hub.updateWorldMatrix(true, true);
        const hubCenter = new THREE.Box3().setFromObject(hub).getCenter(new THREE.Vector3());
        const posAttr = downBlade.geometry.attributes.position;
        let tipIndex = 0;
        let tipRadius = -1;
        for (let i = 0; i < posAttr.count; i++) {
          const radius = posAttr.getX(i) ** 2 + posAttr.getY(i) ** 2 + posAttr.getZ(i) ** 2;
          if (radius > tipRadius) { tipRadius = radius; tipIndex = i; }
        }
        const tip = downBlade.localToWorld(new THREE.Vector3(
          posAttr.getX(tipIndex),
          posAttr.getY(tipIndex),
          posAttr.getZ(tipIndex)
        ));
        const rel = tip.sub(hubCenter);
        const shaft = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(downBlade.getWorldQuaternion(new THREE.Quaternion()))
          .normalize();
        const downDir = new THREE.Vector3(0, -1, 0);
        downDir.sub(shaft.clone().multiplyScalar(downDir.dot(shaft)));
        const tipDir = rel.clone().sub(shaft.clone().multiplyScalar(rel.dot(shaft)));
        if (downDir.lengthSq() > 1e-8 && tipDir.lengthSq() > 1e-8) {
          downDir.normalize();
          tipDir.normalize();
          const turn = Math.atan2(
            new THREE.Vector3().crossVectors(tipDir, downDir).dot(shaft),
            tipDir.dot(downDir)
          );
          const rotorParts = blades.slice();
          if (!rotorParts.includes(hub)) rotorParts.push(hub);
          downBlade.parent.traverse(obj => {
            if (!obj.isMesh || rotorParts.includes(obj)) return;
            const part = String(obj.userData.part || '');
            if (part === 'hub' || part.startsWith('blade-')) rotorParts.push(obj);
          });
          const spin = new THREE.Quaternion().setFromAxisAngle(shaft, turn);
          rotorParts.forEach(obj => {
            obj.updateMatrixWorld(true);
            const parentInv = obj.parent.matrixWorld.clone().invert();
            const moved = new THREE.Matrix4()
              .makeTranslation(hubCenter.x, hubCenter.y, hubCenter.z)
              .multiply(new THREE.Matrix4().makeRotationFromQuaternion(spin))
              .multiply(new THREE.Matrix4().makeTranslation(-hubCenter.x, -hubCenter.y, -hubCenter.z))
              .multiply(obj.matrixWorld);
            obj.matrix.copy(parentInv.multiply(moved));
            obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
          });
        }
      }
    }
    if (hub) {
      tagMesh(hub, 'hub', 'Hub');
      hub.renderOrder = 2;
      const hubMats = Array.isArray(hub.material) ? hub.material : [hub.material];
      hubMats.forEach(mat => {
        if (!mat) return;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
      });
    }
    const towerSources = ['farm-scale-wind-turbine_0', 'farm-scale-wind-turbine_1', 'farm-scale-wind-turbine_2', 'farm-scale-wind-turbine_3']
      .map(name => named[name]).filter(Boolean);
    const worldPoint = new THREE.Vector3();
    let axisX = 0;
    let axisZ = 0;
    let axisN = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    const radii = [];
    towerSources.forEach(mesh => {
      mesh.updateWorldMatrix(true, true);
      const attr = mesh.geometry?.attributes?.position;
      if (!attr) return;
      for (let i = 0; i < attr.count; i++) {
        worldPoint.fromBufferAttribute(attr, i);
        mesh.localToWorld(worldPoint);
        axisX += worldPoint.x;
        axisZ += worldPoint.z;
        axisN += 1;
        minY = Math.min(minY, worldPoint.y);
        maxY = Math.max(maxY, worldPoint.y);
        radii.push(Math.hypot(worldPoint.x, worldPoint.z));
      }
    });
    if (axisN) { axisX /= axisN; axisZ /= axisN; }
    let shaftN = 0;
    let shaftX = 0;
    let shaftZ = 0;
    const shaftRadii = [];
    towerSources.forEach(mesh => {
      const attr = mesh.geometry?.attributes?.position;
      if (!attr) return;
      for (let i = 0; i < attr.count; i++) {
        worldPoint.fromBufferAttribute(attr, i);
        mesh.localToWorld(worldPoint);
        const radius = Math.hypot(worldPoint.x - axisX, worldPoint.z - axisZ);
        if (radius > 1.2) continue;
        shaftX += worldPoint.x;
        shaftZ += worldPoint.z;
        shaftN += 1;
        shaftRadii.push(radius);
      }
    });
    if (shaftN) { axisX = shaftX / shaftN; axisZ = shaftZ / shaftN; }
    shaftRadii.sort((a, b) => a - b);
    const shaftRadius = shaftRadii[Math.floor(shaftRadii.length * 0.6)] || 0.8;
    const housingRadius = shaftRadius * 1.75;
    const baseCut = minY + Math.max(0.35, (maxY - minY) * 0.06);
    const topCut = maxY - Math.max(0.9, (maxY - minY) * 0.16);
    const splitStructure = (mesh) => {
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      const index = geo.index;
      const buckets = { foundation: { pos: [], norm: [] }, tower: { pos: [], norm: [] }, nacelle: { pos: [], norm: [] } };
      const ys = [];
      const rs = [];
      mesh.updateWorldMatrix(true, true);
      for (let i = 0; i < pos.count; i++) {
        worldPoint.fromBufferAttribute(pos, i);
        mesh.localToWorld(worldPoint);
        ys.push(worldPoint.y);
        rs.push(Math.hypot(worldPoint.x - axisX, worldPoint.z - axisZ));
      }
      const pushTri = (ia, ib, ic) => {
        const radius = (rs[ia] + rs[ib] + rs[ic]) / 3;
        const top = Math.max(ys[ia], ys[ib], ys[ic]);
        const low = Math.min(ys[ia], ys[ib], ys[ic]);
        const key = (radius > housingRadius && low > topCut) ? 'nacelle' : (top < baseCut ? 'foundation' : 'tower');
        [ia, ib, ic].forEach(i => {
          buckets[key].pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
          if (norm) buckets[key].norm.push(norm.getX(i), norm.getY(i), norm.getZ(i));
        });
      };
      if (index) {
        for (let i = 0; i < index.count; i += 3) pushTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      } else {
        for (let i = 0; i < pos.count; i += 3) pushTri(i, i + 1, i + 2);
      }
      const made = [];
      Object.entries(buckets).forEach(([key, group]) => {
        if (group.pos.length < 9) return;
        const ggeo = new THREE.BufferGeometry();
        ggeo.setAttribute('position', new THREE.Float32BufferAttribute(group.pos, 3));
        if (group.norm.length) ggeo.setAttribute('normal', new THREE.Float32BufferAttribute(group.norm, 3));
        else ggeo.computeVertexNormals();
        const sourceMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const piece = new THREE.Mesh(ggeo, sourceMat.clone());
        piece.position.copy(mesh.position);
        piece.quaternion.copy(mesh.quaternion);
        piece.scale.copy(mesh.scale);
        piece.name = mesh.name + '-' + key;
        mesh.parent.add(piece);
        const pieceSize = new THREE.Box3().setFromObject(piece).getSize(new THREE.Vector3());
        if (pieceSize.x < 0.015 || pieceSize.y < 0.015 || pieceSize.z < 0.015) {
          mesh.parent.remove(piece);
          ggeo.dispose();
          if (piece.material?.dispose) piece.material.dispose();
          return;
        }
        const label = key === 'foundation' ? 'Foundation' : (key === 'nacelle' ? 'Nacelle' : 'Tower');
        tagMesh(piece, key, label);
        if (key === 'nacelle') nacellePieces.push(piece);
        made.push(piece);
      });
      if (made.length) mesh.visible = false;
      return made;
    };
    towerSources.forEach(splitStructure);
    if (named['farm-scale-wind-turbine_4']) {
      tagMesh(named['farm-scale-wind-turbine_4'], 'nacelle', 'Nacelle');
      nacellePieces.push(named['farm-scale-wind-turbine_4']);
    }
    nacelleMesh = nacellePieces[0] || null;
    if (named['farm-scale-wind-turbine_5']) tagMesh(named['farm-scale-wind-turbine_5'], 'anemometer', 'Anemometer / Sensors');
    const rotorSeat = pickables.filter(mesh => mesh.userData.part === 'hub' || String(mesh.userData.part || '').startsWith('blade-'));
    if (hub && nacellePieces.length && rotorSeat.length) {
      const housingCenter = new THREE.Vector3();
      const housingBox = new THREE.Box3();
      nacellePieces.forEach(mesh => housingBox.union(new THREE.Box3().setFromObject(mesh)));
      housingBox.getCenter(housingCenter);
      const hubBox = new THREE.Box3().setFromObject(hub);
      const hubCenter = hubBox.getCenter(new THREE.Vector3());
      const hubSize = hubBox.getSize(new THREE.Vector3());
      const shaft = new THREE.Vector3(0, 0, 1).applyQuaternion(hub.getWorldQuaternion(new THREE.Quaternion())).normalize();
      if (hubCenter.clone().sub(housingCenter).dot(shaft) < 0) shaft.negate();
      const project = (point) => point.clone().sub(housingCenter).dot(shaft);
      const lipReach = Math.max(hubSize.x, hubSize.y) * 1.15;
      const sample = new THREE.Vector3();
      const radial = new THREE.Vector3();
      let nose = -Infinity;
      nacellePieces.forEach(mesh => {
        const attr = mesh.geometry?.attributes?.position;
        if (!attr) return;
        mesh.updateWorldMatrix(true, true);
        for (let i = 0; i < attr.count; i++) {
          sample.fromBufferAttribute(attr, i);
          mesh.localToWorld(sample);
          radial.copy(sample).sub(hubCenter);
          const along = radial.dot(shaft);
          radial.addScaledVector(shaft, -along);
          if (radial.length() > lipReach) continue;
          if (Math.abs(sample.y - hubCenter.y) > Math.max(hubSize.y, hubSize.x) * 0.9) continue;
          nose = Math.max(nose, project(sample));
        }
      });
      let hubBack = Infinity;
      const hubAttr = hub.geometry?.attributes?.position;
      if (hubAttr) {
        hub.updateWorldMatrix(true, true);
        for (let i = 0; i < hubAttr.count; i++) {
          sample.fromBufferAttribute(hubAttr, i);
          hub.localToWorld(sample);
          hubBack = Math.min(hubBack, project(sample));
        }
      }
      const tuck = Math.max(hubSize.z * 0.12, 0.02);
      const shift = (nose - tuck) - hubBack;
      const limit = Math.max(hubSize.length() * 3, 0.2);
      if (Number.isFinite(nose) && Number.isFinite(hubBack) && Math.abs(shift) > 0.0001 && Math.abs(shift) < limit) {
        const delta = shaft.clone().multiplyScalar(shift);
        rotorSeat.forEach(obj => {
          obj.updateMatrixWorld(true);
          const parentInv = obj.parent.matrixWorld.clone().invert();
          const moved = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z).multiply(obj.matrixWorld);
          obj.matrix.copy(parentInv.multiply(moved));
          obj.matrix.decompose(obj.position, obj.quaternion, obj.scale);
        });
      }
    }
    const addHotspot = (mesh, scale = 0.9) => {
      if (!mesh || !mesh.parent) return;
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const dims = box.getSize(new THREE.Vector3());
      const worldRadius = Math.max(dims.x, dims.y, dims.z, 0.2) * scale;
      const parentScale = new THREE.Vector3();
      mesh.parent.getWorldScale(parentScale);
      const localRadius = worldRadius / Math.max(parentScale.x, parentScale.y, parentScale.z, 0.001);
      mesh.parent.worldToLocal(center);
      const spot = new THREE.Mesh(
        new THREE.SphereGeometry(localRadius, 10, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false })
      );
      spot.position.copy(center);
      spot.userData.hotspot = true;
      mesh.parent.add(spot);
      tagMesh(spot, mesh.userData.part, mesh.userData.label);
    };
    if (hub) addHotspot(hub, 0.45);
    if (named['farm-scale-wind-turbine_4']) addHotspot(named['farm-scale-wind-turbine_4'], 0.55);
    if (named['farm-scale-wind-turbine_5']) addHotspot(named['farm-scale-wind-turbine_5']);
    if (hub) {
      const hb = new THREE.Box3().setFromObject(hub);
      hubCenterWorld.copy(hb.getCenter(new THREE.Vector3()));
      const hubSpan = Math.max(hb.getSize(new THREE.Vector3()).length(), 0.2);
      let tipReach = hubSpan;
      pickables.forEach(mesh => {
        if (mesh.userData.hotspot || !String(mesh.userData.part || '').startsWith('blade-')) return;
        const box = new THREE.Box3().setFromObject(mesh);
        tipReach = Math.max(tipReach, hubCenterWorld.distanceTo(box.getCenter(new THREE.Vector3())));
      });
      bladeRootReach = Math.max(hubSpan * 1.6, tipReach * 0.2);
    }

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = camera.fov * Math.PI / 180;
    const dist = (maxDim * 0.55) / Math.tan(fov / 2);
    camera.position.set(dist * 0.42, dist * 0.06, dist);
    camera.near = Math.max(0.01, dist / 80);
    camera.far = dist * 12;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.userData.base = camera.position.clone();
    camera.userData.zoom = 0.9;
  } catch (err) {
    console.warn('Wind turbine model failed to load', err);
    host.textContent = '3D model failed to load';
    return;
  }

  const START_ZOOM = 0.9;
  const panOffset = new THREE.Vector3();
  const panRight = new THREE.Vector3();
  const panUp = new THREE.Vector3();
  const applyZoom = () => {
    const z = camera.userData.zoom;
    camera.position.copy(camera.userData.base).multiplyScalar(z).add(panOffset);
    camera.lookAt(panOffset);
  };
  const nudgeZoom = (factor) => {
    camera.userData.zoom = Math.min(1.7, Math.max(0.62, camera.userData.zoom * factor));
    applyZoom();
  };
  const resetView = () => {
    panOffset.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    camera.userData.zoom = START_ZOOM;
    applyZoom();
  };
  applyZoom();
  const zoomBar = document.createElement('div');
  zoomBar.className = 'turbine-3d-zoom';
  zoomBar.innerHTML = '<button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="out" title="Zoom out">−</button><button type="button" data-z="reset" title="Reset view">↺</button>';
  host.appendChild(zoomBar);
  zoomBar.addEventListener('pointerdown', event => event.stopPropagation());
  zoomBar.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn) return;
    if (btn.dataset.z === 'reset') resetView();
    else nudgeZoom(btn.dataset.z === 'in' ? 0.86 : 1.16);
  });

  const fit = () => {
    const w = Math.max(40, host.clientWidth);
    const h = Math.max(40, host.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(host);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;
  let dragMode = 'rotate';
  let usedTwo = false;
  let moved = 0;
  let lx = 0;
  let ly = 0;
  let hoveredPart = null;
  const hoverTip = document.createElement('div');
  hoverTip.className = 'turbine-hover-label';
  hoverTip.hidden = true;
  host.appendChild(hoverTip);
  const paintMaterials = (mesh, hex) => {
    const list = !mesh?.material ? [] : (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
    list.forEach(mat => { if (mat?.emissive) mat.emissive.setHex(hex); });
  };
  const paintHover = (mesh, clientX, clientY) => {
    const part = mesh?.userData?.part || null;
    if (hoveredPart !== part) {
      pickables.forEach(item => {
        if (item.userData.hotspot) return;
        paintMaterials(item, item.userData.part === part ? 0x8fd3d8 : 0x000000);
      });
      hoveredPart = part;
      host.title = mesh?.userData?.label || 'Left drag turns, both buttons pan';
    }
    const label = mesh?.userData?.label;
    if (!label || dragging || clientX == null) {
      hoverTip.hidden = true;
      return;
    }
    hoverTip.hidden = false;
    hoverTip.textContent = label;
    const rect = host.getBoundingClientRect();
    let x = clientX - rect.left + 16;
    let y = clientY - rect.top + 18;
    const tipW = hoverTip.offsetWidth || 64;
    const tipH = hoverTip.offsetHeight || 18;
    if (x + tipW > rect.width - 6) x = clientX - rect.left - tipW - 12;
    if (y + tipH > rect.height - 6) y = clientY - rect.top - tipH - 8;
    if (x < 4) x = 4;
    if (y < 4) y = 4;
    hoverTip.style.transform = `translate(${x}px, ${y}px)`;
  };
  const pickObject = (clientX, clientY) => {
    const rect = host.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    pivot.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const nacelleMats = [];
    nacellePieces.forEach(mesh => {
      const list = !mesh.material ? [] : (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
      list.forEach(mat => {
        if (!nacelleMats.includes(mat)) nacelleMats.push(mat);
      });
    });
    const savedSides = nacelleMats.map(mat => mat.side);
    nacelleMats.forEach(mat => { mat.side = THREE.DoubleSide; });
    let hits = [];
    try {
      hits = raycaster.intersectObjects(pickables, false);
    } finally {
      nacelleMats.forEach((mat, i) => { mat.side = savedSides[i]; });
    }
    if (!hits.length) return null;
    const solid = hits.find(hit => !hit.object.userData.hotspot);
    return (solid || hits[0]).object;
  };
  const markDrag = () => {
    host.classList.toggle('is-rotating', dragging && dragMode === 'rotate');
    host.classList.toggle('is-panning', dragging && dragMode === 'pan');
  };
  const panBy = (dx, dy) => {
    camera.updateMatrixWorld();
    panRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    panUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const dist = Math.max(0.2, camera.position.distanceTo(panOffset));
    const worldPerPx = (2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist) / Math.max(1, host.clientHeight);
    panOffset.addScaledVector(panRight, -dx * worldPerPx);
    panOffset.addScaledVector(panUp, dy * worldPerPx);
    const limit = (camera.userData.base?.length() || 10) * 0.55;
    if (panOffset.length() > limit) panOffset.setLength(limit);
    applyZoom();
  };
  host.addEventListener('contextmenu', event => event.preventDefault());
  host.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.turbine-3d-zoom') || event.target.closest('.blade-tip-label')) return;
    if (event.button !== 0 && event.button !== 2) return;
    const both = (event.buttons & 3) === 3;
    if (event.button === 2 && !both) return;
    if (!dragging) moved = 0;
    dragging = true;
    if (both) usedTwo = true;
    dragMode = both ? 'pan' : 'rotate';
    lx = event.clientX;
    ly = event.clientY;
    markDrag();
    try { host.setPointerCapture(event.pointerId); } catch (_) {}
  });
  host.addEventListener('pointermove', (event) => {
    paintHover(pickObject(event.clientX, event.clientY), event.clientX, event.clientY);
    if (!dragging) return;
    const both = (event.buttons & 3) === 3;
    if (both) {
      dragMode = 'pan';
      usedTwo = true;
    } else if ((event.buttons & 1) === 1) {
      dragMode = 'rotate';
    }
    markDrag();
    const dx = event.clientX - lx;
    const dy = event.clientY - ly;
    moved += Math.abs(dx) + Math.abs(dy);
    lx = event.clientX;
    ly = event.clientY;
    if (dragMode === 'pan') panBy(dx, dy);
    else pivot.rotation.y += dx * 0.01;
  });
  const choosePart = (part) => {
    if (!part) return;
    stopTurbine3D();
    if (part.startsWith('blade-')) {
      onPick(part.replace('blade-', ''));
      return;
    }
    STATE.selectedPart = part;
    const sel = document.getElementById('part-selector');
    if (sel) sel.value = part;
    const epochNow = bumpAssetEpoch();
    renderPartSchematic(turbine, part, epochNow);
    renderDefectsTable(turbine);
  };
  const endDrag = (event) => {
    if (!dragging) return;
    if (event.buttons) {
      dragMode = (event.buttons & 3) === 3 ? 'pan' : 'rotate';
      markDrag();
      return;
    }
    dragging = false;
    markDrag();
    try { if (event.pointerId != null) host.releasePointerCapture(event.pointerId); } catch (_) {}
    const pick = !usedTwo && moved <= 6;
    usedTwo = false;
    moved = 0;
    if (!pick) return;
    const hit = pickObject(event.clientX, event.clientY);
    if (hit?.userData?.part) choosePart(hit.userData.part);
  };
  host.addEventListener('pointerup', endDrag);
  host.addEventListener('pointerleave', () => paintHover(null));
  host.addEventListener('wheel', (event) => {
    event.preventDefault();
    nudgeZoom(event.deltaY > 0 ? 1.08 : 0.92);
  }, { passive: false });

  const tipWorld = new THREE.Vector3();
  const spin = { frame: 0 };
  const loop = () => {
    if (TURBINE_3D !== spin || epoch !== STATE.assetEpoch) return;
    pivot.updateMatrixWorld(true);
    const w = host.clientWidth;
    const h = host.clientHeight;
    bladeLabels.forEach(({ mesh, localTip, el }) => {
      tipWorld.copy(localTip);
      mesh.localToWorld(tipWorld);
      tipWorld.project(camera);
      const onScreen = tipWorld.z < 1;
      el.hidden = !onScreen;
      if (!onScreen) return;
      const x = (tipWorld.x * 0.5 + 0.5) * w;
      const y = (-tipWorld.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    });
    renderer.render(scene, camera);
    spin.frame = requestAnimationFrame(loop);
  };
  TURBINE_3D = spin;
  TURBINE_3D.scene = scene;
  TURBINE_3D.THREE = THREE;
  TURBINE_3D.renderer = renderer;
  TURBINE_3D.ro = ro;
  TURBINE_3D.frame = requestAnimationFrame(loop);
}

function renderFullTurbineOverview(container, turbine) {
  if (!container) return;
  stopTurbine3D();
  const blades = [
    { id: 'A' },
    { id: 'B' },
    { id: 'C' }
  ];
  ensureOverviewAnomaly();
  container.innerHTML = `
    <div class="turbine-overview">
      <div class="overview-main-grid">
        <div class="overview-left-col">
          <div class="turbine-single-card">
            <div class="turbine-3d-host" id="turbine-3d" role="img" aria-label="3D turbine. Left drag turns it sideways, both mouse buttons pan, scroll to zoom."></div>
          </div>
          <form class="anomaly-details" id="overview-anomaly-form">
            <h4>Anomaly details</h4>
            <label>Anomaly ID<input id="overview-anomaly-id" class="styled-input" type="text" maxlength="80"></label>
            <label>Anomaly type
              <select id="overview-anomaly-type" class="styled-select"></select>
            </label>
            <label>Blade side<input id="overview-anomaly-side" class="styled-input" type="text" readonly></label>
            <label>Radius<input id="overview-anomaly-radius" class="styled-input" type="text" inputmode="decimal"></label>
            <label>Severity
              <select id="overview-anomaly-severity" class="styled-select">
                ${[1, 2, 3, 4, 5].map(n => `<option value="${n}">${SEVERITY_UI[n].label}</option>`).join('')}
              </select>
            </label>
            <div class="anomaly-actions">
              <button type="button" class="review-btn" id="overview-draw">Place box</button>
              <button type="button" class="review-btn" id="overview-new">New anomaly</button>
              <button type="button" class="teal-btn" id="overview-save">Save anomaly</button>
            </div>
          </form>
        </div>
        <div class="overview-right-col">
          <div class="blade-status-col">
            <div class="duty-legend">
              ${Object.entries(DUTY_LABEL).map(([key, label]) => `<span><i style="background:${DUTY_COLOR[key]}"></i>${label}</span>`).join('')}
            </div>
            ${blades.map(b => {
              const duty = bladeDuty(b.id);
              const count = bladeSummaryRows(b.id).length;
              return `<button type="button" class="blade-status-card" data-blade="${b.id}" data-duty="${duty}">
                <span class="blade-status-swatch" style="background:${DUTY_COLOR[duty]}"></span>
                <strong>${escHtml(bladeDisplayName(b.id, turbine))}</strong>
                <em>${DUTY_LABEL[duty]}</em>
                <small>${count} anomal${count === 1 ? 'y' : 'ies'}</small>
              </button>`;
            }).join('')}
          </div>
          <div class="anomaly-photo-wrap">
            <div class="anomaly-photo-frame" id="overview-photo-frame">
              <img id="overview-photo" alt="" draggable="false">
              <svg id="overview-box-svg" class="overview-box-svg" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
              <div id="overview-box-label" class="overview-box-label" hidden></div>
            </div>
          </div>
        </div>
      </div>
      <div class="compare-view">
        <h4>Comparison view</h4>
        <div class="compare-trio" id="overview-compare"></div>
      </div>
    </div>`;
  const open = (letter) => selectOverviewBlade(letter);
  container.querySelectorAll('.blade-status-card').forEach(card => {
    card.addEventListener('click', () => {
      const top = overviewAnomalyRows().find(row => row.blade === card.dataset.blade);
      if (!top) return;
      STATE.overviewAnomalyId = top.id;
      renderDefectsTable(turbine);
      paintOverviewDetail(turbine);
    });
  });
  bindOverviewEditors(turbine);
  paintOverviewDetail(turbine);
  parkCompareView();
  mountTurbine3D(document.getElementById('turbine-3d'), turbine, open);
}

function overviewDraftBox() {
  return STATE.overviewDraftBox || null;
}

function paintOverviewBox(box) {
  const svg = document.getElementById('overview-box-svg');
  if (!svg) return;
  if (!box || box.length < 4) {
    svg.innerHTML = '';
    const tag = document.getElementById('overview-box-label');
    if (tag) {
      tag.hidden = true;
      tag.textContent = '';
    }
    return;
  }
  const theme = SEVERITY_UI[currentOverviewSeverity()];
  const [x1, y1, x2, y2] = box;
  const x = Math.min(x1, x2) * 100;
  const y = Math.min(y1, y2) * 100;
  const w = Math.abs(x2 - x1) * 100;
  const h = Math.abs(y2 - y1) * 100;
  svg.innerHTML = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${theme.fill}" stroke="${theme.stroke}" stroke-width="1.8" vector-effect="non-scaling-stroke"></rect>
    <circle cx="${x}" cy="${y}" r="1.1" fill="#fff" stroke="${theme.stroke}" stroke-width="0.6"></circle>
    <circle cx="${x + w}" cy="${y}" r="1.1" fill="#fff" stroke="${theme.stroke}" stroke-width="0.6"></circle>
    <circle cx="${x}" cy="${y + h}" r="1.1" fill="#fff" stroke="${theme.stroke}" stroke-width="0.6"></circle>
    <circle cx="${x + w}" cy="${y + h}" r="1.1" fill="#fff" stroke="${theme.stroke}" stroke-width="0.6"></circle>`;
  placeOverviewBoxLabel(x, y, w, theme);
}

function overviewBoxLabel() {
  const id = (document.getElementById('overview-anomaly-id')?.value || '').trim();
  const type = (document.getElementById('overview-anomaly-type')?.value || '').trim();
  if (id && type) return `${id} · ${type}`;
  return id || type || '';
}

function placeOverviewBoxLabel(x, y, w, theme) {
  const tag = document.getElementById('overview-box-label');
  if (!tag) return;
  const label = overviewBoxLabel();
  if (!label) {
    tag.hidden = true;
    tag.textContent = '';
    return;
  }
  const nearTop = y < 12;
  tag.hidden = false;
  tag.textContent = label;
  tag.title = label;
  tag.style.left = `${x + w}%`;
  tag.style.top = `${y}%`;
  tag.style.transform = nearTop ? 'translate(-100%, 6px)' : 'translate(-100%, calc(-100% - 4px))';
  tag.style.color = theme.text;
  tag.style.background = theme.bg;
  tag.style.borderColor = theme.border;
}

function normFromPointer(event, svg) {
  const rect = svg.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(rect.height, 1)))
  };
}

function bindOverviewEditors(turbine) {
  const svg = document.getElementById('overview-box-svg');
  const drawBtn = document.getElementById('overview-draw');
  if (svg && !svg.dataset.bound) {
    svg.dataset.bound = '1';
    let start = null;
    svg.addEventListener('pointerdown', event => {
      if (!svg.classList.contains('is-drawing')) return;
      start = normFromPointer(event, svg);
      svg.setPointerCapture(event.pointerId);
      STATE.overviewDraftBox = [start.x, start.y, start.x, start.y];
      paintOverviewBox(STATE.overviewDraftBox);
    });
    svg.addEventListener('pointermove', event => {
      if (!start) return;
      const end = normFromPointer(event, svg);
      STATE.overviewDraftBox = [start.x, start.y, end.x, end.y];
      paintOverviewBox(STATE.overviewDraftBox);
    });
    const finish = () => { start = null; };
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);
  }
  drawBtn?.addEventListener('click', () => {
    svg?.classList.toggle('is-drawing');
    if (drawBtn) drawBtn.classList.toggle('is-on', svg?.classList.contains('is-drawing'));
  });
  document.getElementById('overview-anomaly-form')?.addEventListener('submit', event => event.preventDefault());
  const radius = document.getElementById('overview-anomaly-radius');
  if (radius && !radius.dataset.bound) {
    radius.dataset.bound = '1';
    radius.addEventListener('change', () => {
      const metres = parseFloat(radius.value);
      STATE.overviewCompareMetres = Number.isFinite(metres) ? metres : null;
      paintBladeComparison(turbine, ensureOverviewAnomaly());
    });
  }
  ['overview-anomaly-id', 'overview-anomaly-type'].forEach(id => {
    const field = document.getElementById(id);
    if (!field || field.dataset.labelBound) return;
    field.dataset.labelBound = '1';
    field.addEventListener('input', () => {
      const row = ensureOverviewAnomaly();
      const box = overviewDraftBox() || (row ? (anomalyBoxes()[row.id]?.box || null) : null);
      if (box) paintOverviewBox(box);
    });
    field.addEventListener('change', () => field.dispatchEvent(new Event('input')));
  });
  document.getElementById('overview-save')?.addEventListener('click', () => saveOverviewAnomaly(turbine));
  document.getElementById('overview-new')?.addEventListener('click', () => createOverviewAnomaly(turbine));
  const severitySel = document.getElementById('overview-anomaly-severity');
  if (severitySel && !severitySel.dataset.sevBound) {
    severitySel.dataset.sevBound = '1';
    severitySel.addEventListener('change', () => applyOverviewSeverityTheme(Number(severitySel.value)));
  }
  applyOverviewSeverityTheme(Number(severitySel?.value) || 2);
}

function paintOverviewDetail(turbine) {
  const row = ensureOverviewAnomaly();
  const idInput = document.getElementById('overview-anomaly-id');
  const typeInput = document.getElementById('overview-anomaly-type');
  const sideInput = document.getElementById('overview-anomaly-side');
  const radiusInput = document.getElementById('overview-anomaly-radius');
  const severity = document.getElementById('overview-anomaly-severity');
  const photo = document.getElementById('overview-photo');
  if (!idInput || !photo) return;
  STATE.overviewDraftBox = null;
  STATE.overviewCompareMetres = null;
  if (!row) {
    idInput.value = '';
    typeInput.value = '';
    fillDefectClassSelect(typeInput, '');
    sideInput.value = '';
    radiusInput.value = '';
    photo.removeAttribute('src');
    paintOverviewBox(null);
    paintBladeComparison(turbine, null);
    return;
  }
  const saved = anomalyBoxes()[row.id] || {};
  const span = bladeSpanM(turbine);
  const metres = pointMetres(row.index, span);
  idInput.value = saved.anomalyId || anomalyLabel(row);
  fillDefectClassSelect(typeInput, saved.type || row.finding || '');
  sideInput.value = `${SIDE_NAME[row.surface] || row.surface} · ${bladeDisplayName(row.blade)}`;
  if (STATE.overviewCompareMetres == null) radiusInput.value = `${metres.toFixed(1)} m`;
  if (severity) severity.value = String(saved.severity || row.cat || 2);
  const photos = g97StationCandidates(row.blade, row.surface, row.index);
  photo.alt = `${row.blade} ${row.surface}`;
  useFirstExistingImage(photo, photos, () => photo.removeAttribute('src'));
  applyOverviewSeverityTheme(Number(severity?.value) || saved.severity || row.cat || 2);
  paintOverviewBox(saved.box || null);
  paintBladeComparison(turbine, row);
}

function nearestStationIndex(metres, span) {
  let best = 1;
  let gap = Infinity;
  for (let i = 1; i <= 20; i += 1) {
    const delta = Math.abs(pointMetres(i, span) - metres);
    if (delta < gap) {
      gap = delta;
      best = i;
    }
  }
  return best;
}

function comparisonPlace(selected, turbine) {
  const span = bladeSpanM(turbine);
  const entered = STATE.overviewCompareMetres;
  let index = selected?.index || 1;
  let surface = selected?.surface || 'PS';
  if (entered != null) index = nearestStationIndex(entered, span);
  const duty = selected && entered == null ? findingDuty(selected) : '';
  const low = !duty || duty === 'cleaning' || duty === 'healthy';
  if (low) {
    const severe = overviewAnomalyRows()
      .filter(row => findingDuty(row) === 'repair' || findingDuty(row) === 'critical')
      .sort((a, b) => a.index - b.index || b.cat - a.cat);
    const next = severe.find(row => row.index >= index) || severe[severe.length - 1];
    if (next) {
      surface = next.surface;
      index = next.index;
    }
  }
  return { surface, index, metres: pointMetres(index, span) };
}

function stationFileCandidates(blade, surface, index) {
  const all = g97StationCandidates(blade, surface, index);
  const local = [];
  const remote = [];
  [1, 7, 3, 5, 0, 6, 2, 4].forEach(slot => {
    const url = all[slot];
    if (!url) return;
    if (/^https?:/i.test(url)) remote.push(url);
    else local.push(url);
  });
  const here = typeof location !== 'undefined' && /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  return here ? local.concat(remote) : remote.concat(local);
}

function compareCandidates(blade, surface, index) {
  const list = [];
  [0, 1, -1, 2, -2, 3, -3].forEach(delta => {
    const station = index + delta;
    if (station < 1 || station > 20) return;
    list.push(...stationFileCandidates(blade, surface, station));
  });
  return list;
}

function paintBladeComparison(turbine, row) {
  const host = document.getElementById('overview-compare');
  if (!host) return;
  const place = comparisonPlace(row, turbine);
  const side = SIDE_NAME[place.surface] || place.surface;
  host.innerHTML = ['A', 'B', 'C'].map(blade => `
    <figure>
      <figcaption>Blade ${blade} · ${escHtml(side)} · ${place.metres.toFixed(1)} m</figcaption>
      <img data-blade="${blade}" alt="Blade ${blade} ${escHtml(place.surface)}" draggable="false">
    </figure>`).join('');
  host.querySelectorAll('img').forEach(img => {
    const photos = compareCandidates(img.dataset.blade, place.surface, place.index);
    useFirstExistingImage(img, photos, () => img.removeAttribute('src'));
  });
}

function saveOverviewAnomaly(turbine) {
  const row = ensureOverviewAnomaly();
  if (!row) return;
  const map = anomalyBoxes();
  const prev = map[row.id] || {};
  const severity = Number(document.getElementById('overview-anomaly-severity')?.value) || row.cat || 2;
  const type = (document.getElementById('overview-anomaly-type')?.value || '').trim();
  const anomalyId = (document.getElementById('overview-anomaly-id')?.value || '').trim() || anomalyLabel(row);
  const box = overviewDraftBox() || prev.box || null;
  const label = overviewBoxLabel();
  map[row.id] = {
    anomalyId,
    type,
    label,
    blade: row.blade,
    surface: row.surface,
    index: row.index,
    severity,
    box
  };
  writeAnomalyBoxes(map);
  const overrides = defectOverrides();
  overrides[row.id] = { ...(overrides[row.id] || {}), cat: severity, name: type };
  writeDefectOverrides(overrides);
  STATE.overviewDraftBox = null;
  const draw = document.getElementById('overview-box-svg');
  draw?.classList.remove('is-drawing');
  document.getElementById('overview-draw')?.classList.remove('is-on');
  document.getElementById('overview-new')?.classList.remove('is-on');
  renderDefectsTable(turbine);
  paintOverviewDetail(turbine);
  showToast('Anomaly saved', 'success');
}

function createOverviewAnomaly(turbine) {
  const current = ensureOverviewAnomaly();
  const id = `custom-${Date.now()}`;
  const map = anomalyBoxes();
  map[id] = {
    anomalyId: 'New anomaly',
    type: '',
    blade: current?.blade || 'A',
    surface: current?.surface || 'PS',
    index: current?.index || 1,
    severity: 2,
    box: null
  };
  writeAnomalyBoxes(map);
  STATE.overviewAnomalyId = id;
  STATE.overviewDraftBox = null;
  renderDefectsTable(turbine);
  paintOverviewDetail(turbine);
  const draw = document.getElementById('overview-box-svg');
  draw?.classList.add('is-drawing');
  document.getElementById('overview-draw')?.classList.add('is-on');
  document.getElementById('overview-new')?.classList.add('is-on');
  const idInput = document.getElementById('overview-anomaly-id');
  idInput?.focus();
  idInput?.select();
  applyOverviewSeverityTheme(2);
  showToast('Name it, draw a box on the photo, then Save anomaly', 'success');
}

function selectOverviewBlade(letter) {
  STATE.selectedPart = 'blade-' + letter;
  STATE.selectedBlade = letter;
  const sel = document.getElementById('part-selector');
  if (sel) sel.value = STATE.selectedPart;
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  renderPartSchematic(turbine, STATE.selectedPart);
  renderDefectsTable(turbine);
}

// ── BLADE SCHEMATIC ────────────────────────────
function renderBlade(turbine, blade, targetEl) {
  const container = targetEl || document.getElementById('blade-schematic-default') || document.getElementById('blade-schematic');
  if (!container) return;
  const defects = STATE.db.defects.filter(d => d.assetId === turbine.id && d.blade === blade);
  const maxDist = turbine.rotorDia / 2;

  const colors = { Crack: '#EB5757', Delamination: '#F2C94C', Erosion: '#0FA4AF', Lightning: '#BB86FC' };

  const W = container.offsetWidth || 600;
  const H = 180;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">
      <defs>
        <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#AFDDE5" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#AFDDE5" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <path d="M 40 90 Q ${W*0.3} 60 ${W-20} 30 L ${W-20} 50 Q ${W*0.3} 80 40 110 Z"
        fill="url(#bladeGrad)" stroke="#0FA4AF" stroke-width="1.5" opacity="0.5"/>
      <ellipse cx="40" cy="90" rx="22" ry="24" fill="rgba(15,164,175,0.2)" stroke="#0FA4AF" stroke-width="1.5"/>
      <circle cx="${W-20}" cy="40" r="5" fill="#AFDDE5" opacity="0.5"/>
      <text x="40" y="${H-10}" font-family="JetBrains Mono,monospace" font-size="10" fill="rgba(175,221,229,0.5)">Root</text>
      <text x="${W-40}" y="${H-10}" font-family="JetBrains Mono,monospace" font-size="10" fill="rgba(175,221,229,0.5)">Tip</text>
      ${[0.25, 0.5, 0.75].map(frac => `
        <line x1="${40 + frac*(W-60)}" y1="20" x2="${40 + frac*(W-60)}" y2="${H-20}" stroke="rgba(15,164,175,0.1)" stroke-dasharray="3,3"/>
        <text x="${40 + frac*(W-60)}" y="16" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" fill="rgba(175,221,229,0.35)">${Math.round(frac * maxDist)}m</text>
      `).join('')}
      ${defects.map((d) => {
        const x = 40 + (d.dist / maxDist) * (W - 60);
        const y = 80 - (d.dist / maxDist) * 40;
        const col = colors[d.type] || '#AFDDE5';
        const r = 5 + d.severity * 2;
        return `
          <g class="defect-hotspot" data-id="${d.id}" cursor="pointer" onclick="openReport('${d.id}')">
            <circle cx="${x}" cy="${y}" r="${r + 6}" fill="${col}" opacity="0.1"/>
            <circle cx="${x}" cy="${y}" r="${r}" fill="${col}" opacity="0.85" stroke="${col}" stroke-width="2">
              <animate attributeName="r" values="${r};${r+3};${r}" dur="2s" repeatCount="indefinite"/>
            </circle>
            <text x="${x}" y="${y - r - 5}" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" fill="${col}">${d.type[0]}-${d.severity}</text>
          </g>`;
      }).join('')}
    </svg>
  `;
}

// ── DEFECTS TABLE ─────────────────────────────
function priorityFromSeverity(sev) {
  if (sev >= 5) return 'Critical';
  if (sev >= 4) return 'High';
  if (sev >= 3) return 'Medium';
  return 'Low';
}

/** Radial % band covered by each PS station capture (root→tip within frame). */
const STATION_RADIAL_PCT = {
  2:  [0, 10],
  5:  [8, 28],
  7:  [28, 42],
  10: [42, 62],
  13: [62, 82],
  18: [82, 95],
  20: [92, 100]
};

const DEFECT_SEV_COLOR = {
  1: '#B9D896',
  2: '#FACD96',
  3: '#F0A03C',
  4: '#E15A5F',
  5: '#AF373C'
};

function bboxCenterNorm(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return { cx: 0.5, cy: 0.5 };
  return {
    cx: (Number(bbox[0]) + Number(bbox[2])) / 2,
    cy: (Number(bbox[1]) + Number(bbox[3])) / 2
  };
}

/**
 * Auto-calculate distance-from-root for a defect from its bbox within the
 * station’s radial band. Frame Y increases tipward on Blade 5297 PS captures.
 */
function defectRadialMetrics(pt, defect, turbine) {
  const span = bladeSpanM(turbine);
  const stationPct = Math.round((pt.metres / span) * 100);
  const band = STATION_RADIAL_PCT[pt.pointIndex] || [
    Math.max(0, stationPct - 8),
    Math.min(100, stationPct + 8)
  ];
  const { cx, cy } = bboxCenterNorm(defect.bbox_norm);
  const t = Math.min(1, Math.max(0, cy));
  const pct = band[0] + (band[1] - band[0]) * t;
  const metres = +(span * pct / 100).toFixed(2);
  const chord =
    cx < 0.33 ? 'TE side' :
    cx > 0.67 ? 'LE side' : 'mid-chord';
  return {
    metres,
    pct: Math.round(pct * 10) / 10,
    radial: `${metres.toFixed(1)} m / ${span} m (${Math.round(pct)}%)`,
    distRoot: `${metres.toFixed(1)} m`,
    location: `${pt.surface} · ${Math.round(pct)}% · ${chord}`,
    pin: { cx, cy },
    band
  };
}

function renderDefectsTable(turbine) {
  const tbody = document.getElementById('defects-tbody');
  const tbodyAlt = document.getElementById('defects-tbody-standalone');
  const fill = (el, html) => { if (el) el.innerHTML = html; };
  if (!tbody && !tbodyAlt) return;

  if (STATE.pocMode && ['blade-A', 'blade-B', 'blade-C'].includes(STATE.selectedPart)) {
    const blade = activeBladeLetter();
    if (!BLADE_FINDINGS.ready) {
      fill(tbody, `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">Loading defect categories…</td></tr>`);
      loadBladeFindings().then(() => {
        if (STATE.pocMode) renderDefectsTable(turbine);
      });
      return;
    }
    const pt = getSelectedPocPoint(turbine);
    const findings = findingsForStation(blade, pt.surface, pt.pointIndex);
    if (findings.length) {
      const span = bladeSpanM(turbine);
      const html = findings.map(d => {
        const metres = pointMetres(d.index, span);
        const pct = Math.round((metres / span) * 100);
        const prio = findingPriority(d);
        const onStation = d.surface === pt.surface && d.index === pt.pointIndex;
        const isSel = STATE.pocSelectedDefectId ? STATE.pocSelectedDefectId === d.id : onStation;
        const point = 'P' + String(d.index).padStart(2, '0');
        const code = (d.finding.match(/^C\d+/) || [point])[0];
        const typeName = String(d.finding || '').replace(/^C\d+\s+/, '');
        return `
        <tr class="defect-row ${d.cat >= DOT_MIN_CAT ? 'is-critical' : ''} ${isSel ? 'is-selected' : ''}"
          data-surface="${d.surface}" data-point="${d.index}" data-finding-id="${escHtml(d.id)}" tabindex="0">
          <td data-col="id"><span style="font-family:var(--font-mono);font-size:0.73rem;color:${d.color}">${escHtml(d.surface)}-${point}-${escHtml(code)}</span></td>
          <td data-col="surface">${escHtml(d.surface)}</td>
          <td data-col="location" style="font-size:0.75rem">${escHtml(d.surface)} · ${point}</td>
          <td data-col="type"><span class="radial-swatch" style="background:${d.color}"></span> ${escHtml(typeName)}</td>
          <td data-col="radial"><span style="font-family:var(--font-mono);font-size:0.72rem">${pct}%</span></td>
          <td data-col="dist"><span style="font-family:var(--font-mono);font-size:0.72rem">${metres.toFixed(1)} m</span></td>
          <td data-col="intensity"><span class="sev-pill" style="background:${d.color}22;color:${d.color};border:1px solid ${d.color}">CAT ${d.cat}${d.verify ? ' · Verify' : ''}</span></td>
          <td data-col="size" style="font-size:0.72rem">${d.count} mark${d.count === 1 ? '' : 's'}</td>
          <td data-col="priority"><span class="prio-pill prio-${prio.toLowerCase()}">${prio}</span></td>
          <td data-col="status"><span class="stat-dot-pill pending">Open</span></td>
          <td data-col="review"><button type="button" class="review-btn">Review</button></td>
        </tr>`;
      }).join('');
      fill(tbody, html);
      bindFindingTable(tbody);
      applyReportColumns();
      const selectedRow = tbody && tbody.querySelector('tr.is-selected');
      if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest' });
      renderPocBboxOverlay(pt, turbine);
      updateFindingsSheetMeta();
      return;
    }
    const defects = defectsForPocPoint(pt);
    const selectedId = STATE.pocSelectedDefectId;
    const html = defects.map(d => {
      const prio = priorityFromSeverity(d.severity);
      const geo = defectRadialMetrics(pt, d, turbine);
      const size = defectSizeFromBbox(d.bbox_norm);
      const intensity = `S${d.severity} · ${d.severity_label || priorityFromSeverity(d.severity)}`;
      const isSel = selectedId === d.id;
      return `
      <tr class="defect-row ${isSel ? 'is-selected' : ''}" data-defect-id="${d.id}" tabindex="0"
        onclick="selectPocDefect('${d.id}')" onkeydown="if(event.key==='Enter')selectPocDefect('${d.id}')">
        <td><span style="font-family:var(--font-mono);font-size:0.73rem;color:var(--c-teal)">${pt.point}-${d.id}</span></td>
        <td>${pt.surface}</td>
        <td style="font-size:0.75rem">${geo.location}</td>
        <td>${d.defect_class}</td>
        <td><span style="font-family:var(--font-mono);font-size:0.72rem">${Math.round(geo.pct)}%</span></td>
        <td><span style="font-family:var(--font-mono);font-size:0.72rem">${geo.distRoot}</span></td>
        <td><span class="sev-pill sev-${d.severity}">${intensity}</span></td>
        <td style="font-size:0.72rem;max-width:160px;">${size}</td>
        <td><span class="prio-pill prio-${prio.toLowerCase()}">${prio}</span></td>
        <td><span class="stat-dot-pill pending">Pending</span></td>
        <td><button class="review-btn" onclick="event.stopPropagation();reviewPocDefect('${pt.surface}',${pt.pointIndex},'${d.id}')">Review</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">${pt.stationImage ? `Station ${pt.surface} ${pt.point} is linked (${formatRadial(pt, turbine)}). No boxed defects on this capture.` : `No station image for ${pt.surface} ${pt.point} (${formatRadial(pt, turbine)}).`}</td></tr>`;
    fill(tbody, html);
    renderPocBboxOverlay(pt, turbine);
    updateFindingsSheetMeta();
    return;
  }

  const defects = turbine
    ? STATE.db.defects.filter(d => d.assetId === turbine.id && d.blade === STATE.selectedBlade)
    : STATE.db.defects;
  if (STATE.selectedPart === 'full' && isG97Turbine(turbine)) {
    renderOverviewDefectTable(turbine, tbodyAlt);
    return;
  }
  setStandaloneColumns(false);
  const html = defects.map(d => `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:0.73rem;color:var(--c-teal)">${d.id}</span></td>
      <td>Blade ${d.blade}</td>
      <td style="font-size:0.75rem">${d.location || ('Blade ' + d.blade)}</td>
      <td>${d.type}</td>
      <td><span style="font-family:var(--font-mono);font-size:0.72rem">${d.radialPos || (d.dist + ' m')}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:0.72rem">${d.dist} m</span></td>
      <td><span class="sev-pill sev-${d.severity}">${d.intensity || ('SEV-' + d.severity)}</span></td>
      <td style="font-size:0.72rem">${d.size || '—'}</td>
      <td><span class="prio-pill prio-${d.priority.toLowerCase()}">${d.priority}</span></td>
      <td><span class="stat-dot-pill ${d.status.toLowerCase()}">${d.status}</span></td>
      <td><button class="review-btn" onclick="openReport('${d.id}')">Review</button></td>
    </tr>
  `).join('') || `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">No defects recorded for Blade ${STATE.selectedBlade}</td></tr>`;
  fill(tbodyAlt, html);
  updateFindingsSheetMeta();
}

function setStandaloneColumns(full) {
  const head = document.querySelector('#asset-defects-standalone thead tr');
  const title = document.querySelector('#asset-defects-standalone .panel-header h3');
  if (title) title.textContent = full ? 'Blade summary' : 'Detected Defects & Decisions';
  if (!head) return;
  head.innerHTML = full
    ? '<th>Anomaly ID</th><th>Anomaly Type</th><th>Blade</th><th>Blade Side</th><th>Radius</th><th>Severity</th><th></th>'
    : '<th>Defect ID</th><th>Surface</th><th>Location</th><th>Defect Type</th><th>Radial Pos.</th><th>Dist. from Root</th><th>Intensity</th><th>Length / Size</th><th>Priority</th><th>Status</th><th>Review</th>';
}

function renderOverviewDefectTable(turbine, tbodyAlt) {
  setStandaloneColumns(true);
  if (!BLADE_FINDINGS.ready) {
    if (tbodyAlt) tbodyAlt.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--c-muted)">Loading anomalies…</td></tr>';
    loadBladeFindings().then(() => {
      if (STATE.selectedPart === 'full') renderDefectsTable(turbine);
    });
    return;
  }
  const span = bladeSpanM(turbine);
  const selected = ensureOverviewAnomaly();
  const rows = overviewAnomalyRows();
  const html = rows.map(row => {
    const metres = pointMetres(row.index, span);
    const duty = findingDuty(row);
    const on = selected && selected.id === row.id;
    return `<tr class="defect-row ${on ? 'is-selected' : ''}" data-anomaly-id="${escHtml(row.id)}">
      <td style="font-family:var(--font-mono);font-size:0.73rem;color:${row.color || DUTY_COLOR[duty]}">${escHtml(anomalyLabel(row))}</td>
      <td>${escHtml(row.finding)}</td>
      <td>${escHtml(bladeDisplayName(row.blade, turbine))}</td>
      <td>${escHtml(SIDE_NAME[row.surface] || row.surface)}</td>
      <td style="font-family:var(--font-mono);font-size:0.72rem">${metres.toFixed(1)} m</td>
      <td><span class="sev-pill" style="background:${DUTY_COLOR[duty]}22;color:${DUTY_COLOR[duty]};border:1px solid ${DUTY_COLOR[duty]}">${DUTY_LABEL[duty]} · ${row.cat}</span></td>
      <td><button type="button" class="review-btn">Open</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--c-muted)">No anomalies on this turbine.</td></tr>';
  if (tbodyAlt) tbodyAlt.innerHTML = html;
  if (tbodyAlt && !tbodyAlt.dataset.overviewBound) {
    tbodyAlt.dataset.overviewBound = '1';
    tbodyAlt.addEventListener('click', event => {
      const tr = event.target.closest('tr[data-anomaly-id]');
      if (!tr || !tbodyAlt.contains(tr)) return;
      STATE.overviewAnomalyId = tr.dataset.anomalyId;
      const current = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || turbine;
      renderDefectsTable(current);
      paintOverviewDetail(current);
    });
  }
}

function selectPocDefect(defectId) {
  STATE.pocSelectedDefectId = STATE.pocSelectedDefectId === defectId ? null : defectId;
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const pt = getSelectedPocPoint(turbine);
  renderDefectsTable(turbine);
  focusPocDefectInView(pt, turbine);
}

function exportAssetReport() {
  generatePDFReport();
}

let assetReviewPdfUrl = null;

async function reviewAssetReport() {
  const box = document.getElementById('asset-report-review');
  const status = document.getElementById('asset-report-review-status');
  const frame = document.getElementById('asset-report-review-frame');
  if (!box || !status || !frame) return;
  box.hidden = false;
  frame.hidden = true;
  status.textContent = 'Loading PDF preview…';
  try {
    const response = await fetch(encodeURI(STATIC_INSPECTION_REPORT_URL));
    if (!response.ok) throw new Error(`Report HTTP ${response.status}`);
    const blob = await response.blob();
    if (assetReviewPdfUrl) URL.revokeObjectURL(assetReviewPdfUrl);
    assetReviewPdfUrl = URL.createObjectURL(blob);
    frame.src = assetReviewPdfUrl;
    frame.hidden = false;
    status.textContent = 'Inspection report preview';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    console.error(error);
    status.textContent = 'Could not load the inspection report preview.';
  }
}

function closeAssetReportReview() {
  const box = document.getElementById('asset-report-review');
  const frame = document.getElementById('asset-report-review-frame');
  if (frame) {
    frame.removeAttribute('src');
    frame.hidden = true;
  }
  if (assetReviewPdfUrl) {
    URL.revokeObjectURL(assetReviewPdfUrl);
    assetReviewPdfUrl = null;
  }
  if (box) box.hidden = true;
}

// ══════════════════════════════════════════════════
// 8. REPORT VIEWER
// ══════════════════════════════════════════════════
function openReport(defectId) {
  STATE.activeDefect = STATE.db.defects.find(d => d.id === defectId);
  if (!STATE.activeDefect) return;
  navigateTo('report');
  renderReport();
}

function renderReport() {
  const d = STATE.activeDefect;
  if (!d) return;
  const turbine = STATE.db.turbines.find(t => t.id === d.assetId);
  const title = document.getElementById('report-viewer-title');
  if (title) title.textContent = `${d.type} · ${bladeDisplayName(d.blade, turbine)} · ${turbineLabel(turbine)}`;

  const rgb = document.getElementById('img-rgb');
  const empty = document.getElementById('viewer-empty');
  const frame = document.getElementById('img-frame');
  if (rgb) {
    const photos = (d.stationCandidates && d.stationCandidates.length) ? d.stationCandidates : (d.stationImage ? [d.stationImage] : []);
    if (photos.length) {
      frame?.classList.remove('has-image');
      rgb.addEventListener('load', () => frame?.classList.add('has-image'), { once: true });
      rgb.hidden = false;
      if (empty) empty.hidden = true;
      useFirstExistingImage(rgb, photos, () => {
        frame?.classList.remove('has-image');
        rgb.hidden = true;
        rgb.removeAttribute('src');
        if (empty) {
          empty.hidden = false;
          empty.textContent = `No station photo for ${bladeDisplayName(d.blade, turbine)}.`;
        }
      });
    } else {
      frame?.classList.remove('has-image');
      rgb.hidden = true;
      rgb.removeAttribute('src');
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'No station photo for this defect.';
      }
    }
  }

  const badge = document.getElementById('report-priority-badge');
  if (badge) {
    badge.textContent = d.priority || '';
    badge.className = `priority-badge ${d.priority || ''}`;
  }

  syncReportOverride(d);
  syncReportPicker();
}

function syncReportOverride(d) {
  const cat = document.getElementById('report-review-cat');
  if (cat && d?.severity) cat.value = String(d.severity);
  const name = document.getElementById('report-review-name');
  if (name && document.activeElement !== name) fillDefectClassSelect(name, d?.type || '');
}

function zoomIn() {
  STATE.zoomLevel = Math.min((STATE.zoomLevel || 1) + 0.25, 3);
  applyZoom();
}
function zoomOut() {
  STATE.zoomLevel = Math.max((STATE.zoomLevel || 1) - 0.25, 0.5);
  applyZoom();
}
function resetZoom() {
  STATE.zoomLevel = 1;
  applyZoom();
}
function applyZoom() {
  const img = document.getElementById('img-rgb');
  if (!img) return;
  img.style.transform = `scale(${STATE.zoomLevel})`;
  img.style.transformOrigin = 'center center';
}

function isG97Turbine(turbine) {
  return /g97/i.test(`${turbine?.model || ''} ${turbine?.name || ''}`) || turbine?.assetId === 'WTG-001';
}

function collectMajorFindings() {
  const turbine = STATE.db.turbines.find(t => t.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  if (isG97Turbine(turbine) && BLADE_FINDINGS.rows.length) {
    return BLADE_FINDINGS.rows.map(findingView)
      .filter(row => row.cat >= DOT_MIN_CAT)
      .sort((a, b) => (b.cat - a.cat) || (b.count - a.count) || (a.index - b.index));
  }
  return (STATE.db.defects || [])
    .filter(d => d.assetId === turbine.id && Number(d.severity) >= 3)
    .map(d => ({
      blade: d.blade,
      surface: d.location || '—',
      index: 0,
      finding: d.type,
      cat: Number(d.severity) || 3,
      count: 1,
      demo: true
    }));
}

function blobFingerprint(bytes) {
  let hash = bytes.length >>> 0;
  const step = Math.max(1, Math.floor(bytes.length / 48));
  for (let i = 0; i < bytes.length; i += step) hash = Math.imul(hash, 33) + bytes[i];
  return (hash >>> 0).toString(16) + ':' + bytes.length;
}

async function rasterizeStation(url) {
  const res = await fetch(encodeURI(url));
  if (!res.ok) throw new Error('missing');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const fingerprint = blobFingerprint(bytes);
  const bmp = await createImageBitmap(new Blob([bytes]));
  const maxW = 720;
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return { data: canvas.toDataURL('image/jpeg', 0.62), width: canvas.width, height: canvas.height, fingerprint };
}

const REPORT_SIDES = [
  ['PS', 'Pressure side (PS)'],
  ['SS', 'Suction side (SS)'],
  ['LE', 'Leading edge (LE)'],
  ['TE', 'Trailing edge (TE)']
];

function rowsForSide(major, code) {
  return major.filter(row => {
    const surface = String(row.surface || '').toUpperCase();
    return surface === code || surface.startsWith(code + ' ') || surface.startsWith(code + '·');
  }).sort((a, b) => String(a.blade).localeCompare(String(b.blade)) || (a.index - b.index) || (b.cat - a.cat));
}

function reportFindings() {
  const turbine = STATE.db.turbines.find(t => t.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  if (isG97Turbine(turbine) && BLADE_FINDINGS.rows.length) return BLADE_FINDINGS.rows.map(findingView);
  return collectMajorFindings();
}

async function loadSideImages(rows, limit, seen) {
  const picks = [];
  const used = new Set();
  const ranked = (list) => list
    .filter(row => !row.demo && row.index)
    .sort((a, b) => (b.cat - a.cat) || (b.count - a.count) || (a.index - b.index));
  const tiers = [
    ranked(rows.filter(row => row.cat >= DOT_MIN_CAT)),
    ranked(rows.filter(row => row.cat < DOT_MIN_CAT))
  ];

  const take = async (pool, spaced) => {
    for (const row of pool) {
      if (picks.length >= limit) return;
      const key = `${row.blade}|${row.surface}|${row.index}`;
      if (used.has(key)) continue;
      if (spaced && picks.some(shot => shot.blade === row.blade && Math.abs(shot.index - row.index) < 4)) continue;
      let shot = null;
      for (const url of g97StationCandidates(row.blade, row.surface, row.index)) {
        try { shot = await rasterizeStation(url); break; }
        catch (_) { /* next file name */ }
      }
      if (!shot || seen.has(shot.fingerprint)) {
        if (shot) used.add(key);
        continue;
      }
      const point = 'P' + String(row.index).padStart(2, '0');
      shot.caption = `Blade ${row.blade}  ${row.surface}  ${point}  ·  CAT ${row.cat}  ·  ${row.finding}`;
      shot.blade = row.blade;
      shot.index = row.index;
      seen.add(shot.fingerprint);
      used.add(key);
      picks.push(shot);
    }
  };

  for (const pool of tiers) {
    await take(pool, true);
    await take(pool, false);
    if (picks.length >= limit) break;
  }
  return picks;
}

// ══════════════════════════════════════════════════
// 9. PDF REPORT GENERATION
// ══════════════════════════════════════════════════
const STATIC_INSPECTION_REPORT_URL = 'reports/Gamesa_2MW_Wind_Turbine_Inspection_Report.pdf';

function inspectionReportDownloadName() {
  const turbine = STATE.db?.turbines?.find(t => t.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const site = String(turbine?.site || 'Kayathar').replace(/[^\w\-]+/g, '_');
  const asset = String(turbine?.assetId || 'Gamesa_G97').replace(/[^\w\-]+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  return `CompliQ_${site}_Gamesa_G97_2MW_Inspection_Report_${asset}_${date}.pdf`;
}

async function generatePDFReport() {
  const filename = inspectionReportDownloadName();
  showToast('Preparing Gamesa G97 inspection report…', 'success');
  try {
    const res = await fetch(encodeURI(STATIC_INSPECTION_REPORT_URL));
    if (!res.ok) throw new Error(`Report HTTP ${res.status}`);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2500);
    showToast(`Report downloaded: ${filename}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not download the inspection report PDF.', 'error');
  }
}

// ══════════════════════════════════════════════════
// 10. INGEST DATA
// ══════════════════════════════════════════════════
function populateIngestSelects() {
  const sel = document.getElementById('ig-turbine');
  if (!sel) return;
  sel.innerHTML = STATE.db.turbines.map(t => `<option value="${t.id}">${turbineLabel(t)}</option>`).join('');
}

function handleIngest(e) {
  e.preventDefault();
  const btn = document.getElementById('ingest-submit-btn');
  const spinner = document.getElementById('ingest-spinner');
  const fileInp = document.getElementById('file-inp');
  btn.disabled = true;
  spinner.style.display = 'inline-block';

  setTimeout(() => {
    if (fileInp.parsedJsonData) {
      const data = fileInp.parsedJsonData;
      let importCount = 0;
      let turbineCount = 0;

      const importItem = (item) => {
        // Detect defect vs turbine
        if (item.defect_class || item.anomaly_type || item.type && (item.blade || item.dist)) {
          const tId = parseInt(item.asset_id || item.assetId) || 1;
          const turbine = STATE.db.turbines.find(t => t.id === tId);
          const newDefect = {
            id: item.id || `DEF-${String(STATE.db.defects.length + 1).padStart(3,'0')}`,
            assetId: tId,
            blade: item.blade || 'A',
            dist: parseInt(item.dist) || 0,
            type: item.defect_class || item.anomaly_type || item.type || 'Crack',
            confidence: parseFloat(item.confidence) || 0.90,
            severity: parseInt(item.severity) || 3,
            priority: getSeverityPriority(parseInt(item.severity) || 3),
            action: item.action || 'Inspect asset',
            status: item.status || 'Pending',
            method: item.method || 'Bulk Import',
            gps: item.gps || (turbine ? `${turbine.gps.lat}, ${turbine.gps.lng}` : ''),
            campaign: item.campaign || 'BULK-IMPORT',
            inspDate: item.inspDate || new Date().toISOString().slice(0,10),
            notes: item.notes || 'Bulk imported defect.'
          };
          STATE.db.defects.push(newDefect);
          if (turbine) {
            turbine.anomalies++;
            if (!turbine.defects.includes(newDefect.id)) {
              turbine.defects.push(newDefect.id);
            }
            if (newDefect.severity >= 4 && turbine.status === 'normal') turbine.status = 'warning';
            if (newDefect.severity >= 5) turbine.status = 'critical';
          }
          importCount++;
        } else if (item.assetId || item.asset_id || item.name && item.site) {
          const newT = {
            id: STATE.db.turbines.length + 1,
            assetId: item.assetId || item.asset_id || `WTG-${String(STATE.db.turbines.length + 1).padStart(3,'0')}`,
            name: item.name || item.assetId || `Turbine ${STATE.db.turbines.length + 1}`,
            site: item.site || 'Site A',
            state: item.state || item.site || 'Active',
            gps: item.gps || { lat: 13.0827, lng: 80.2707 },
            location: item.location || `${item.site || 'Site A'}`,
            status: item.status || 'normal',
            health: parseInt(item.health) || 95,
            rotorDia: parseInt(item.rotorDia) || 120,
            hubHeight: parseInt(item.hubHeight) || 90,
            power: parseFloat(item.power) || 2.5,
            manufacturer: item.manufacturer || 'Vestas',
            model: item.model || 'V120',
            commYear: parseInt(item.commYear) || 2023,
            windSpeed: parseFloat(item.windSpeed) || 10,
            rpm: parseFloat(item.rpm) || 12,
            inspCoverage: parseInt(item.inspCoverage) || 0,
            lastInspection: item.lastInspection || '—',
            campaign: item.campaign || '—',
            anomalies: 0,
            defects: []
          };
          STATE.db.turbines.push(newT);
          turbineCount++;
        }
      };

      if (Array.isArray(data)) {
        data.forEach(importItem);
      } else {
        importItem(data);
      }

      saveDB(STATE.db);
      renderMetrics();
      renderFleetGrid();
      renderAssetList();

      let msg = '';
      if (importCount > 0) msg += `Imported ${importCount} defect(s). `;
      if (turbineCount > 0) msg += `Imported ${turbineCount} turbine(s).`;
      if (msg === '') msg = 'JSON file processed but no valid records found.';

      showToast(msg, 'success');
      addNotification(msg, 'info');
      fileInp.parsedJsonData = null;
    } else {
      const turbineId = parseInt(document.getElementById('ig-turbine').value);
      const turbine = STATE.db.turbines.find(t => t.id === turbineId);
      const newDefect = {
        id: `DEF-${String(STATE.db.defects.length + 1).padStart(3,'0')}`,
        assetId: turbineId,
        blade: document.getElementById('ig-blade').value,
        dist: parseInt(document.getElementById('ig-dist').value),
        type: document.getElementById('ig-defect').value,
        confidence: parseInt(document.getElementById('ig-conf').value) / 100,
        severity: parseInt(document.getElementById('ig-sev').value),
        priority: getSeverityPriority(parseInt(document.getElementById('ig-sev').value)),
        action: document.getElementById('ig-action').value,
        status: 'Pending',
        method: 'API Ingestion',
        gps: turbine ? `${turbine.gps.lat}, ${turbine.gps.lng}` : '',
        campaign: 'INGEST-' + new Date().toISOString().slice(0,7),
        inspDate: new Date().toISOString().slice(0,10),
        notes: 'Ingested via REUDE API endpoint.'
      };
      STATE.db.defects.push(newDefect);
      if (turbine) {
        turbine.anomalies++;
        turbine.defects.push(newDefect.id);
        if (newDefect.severity >= 4 && turbine.status === 'normal') turbine.status = 'warning';
        if (newDefect.severity >= 5) turbine.status = 'critical';
      }
      saveDB(STATE.db);
      addMQTTLog({ device_id: turbine?.assetId || 'UNK', type: newDefect.type, severity: newDefect.severity, confidence: newDefect.confidence });
      addNotification(`New defect ingested: ${newDefect.id} on ${turbine?.assetId} (SEV-${newDefect.severity})`, newDefect.severity >= 4 ? 'crit' : 'warn');
      renderMetrics();
      renderFleetGrid();
      renderAssetList();
      showToast(`Payload ingested: ${newDefect.id}`, 'success');
    }

    btn.disabled = false;
    spinner.style.display = 'none';
    e.target.reset();
    document.getElementById('file-preview').style.display = 'none';
  }, 1200);
}

function getSeverityPriority(sev) {
  if (sev >= 5) return 'CRITICAL';
  if (sev >= 4) return 'HIGH';
  if (sev >= 3) return 'MEDIUM';
  return 'LOW';
}

function resetIngestForm() {
  document.getElementById('ingest-form').reset();
  const fileInp = document.getElementById('file-inp');
  if (fileInp) {
    fileInp.value = '';
    fileInp.parsedJsonData = null;
  }
  document.getElementById('file-preview').style.display = 'none';
}

// File upload handlers for drag & drop
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = 'var(--c-teal)';
  e.currentTarget.style.backgroundColor = 'rgba(15,164,175,0.05)';
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = '';
  e.currentTarget.style.backgroundColor = '';
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  e.currentTarget.style.borderColor = '';
  e.currentTarget.style.backgroundColor = '';
  
  const files = e.dataTransfer.files;
  if (files.length) {
    handleFileSelect({ target: { files: files } });
  }
}

function handleFileSelect(e) {
  const files = e.target.files;
  const preview = document.getElementById('file-preview');
  preview.style.display = 'block';
  preview.innerHTML = '';
  
  const validFiles = [];
  const fileList = [];
  
  for (let file of files) {
    // Validate file type and size
    const validTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/json'];
    if (!validTypes.includes(file.type) && !file.name.endsWith('.json')) {
      continue;
    }
    if (file.size > 50 * 1024 * 1024) {
      // File too large, skip
      continue;
    }
    validFiles.push(file);
    fileList.push(`✓ ${file.name} (${(file.size/1024).toFixed(0)} KB)`);
    
    // Auto-store file to localStorage (up to storage limit)
    storeFileToAsset(file);
  }
  
  if (fileList.length > 0) {
    preview.innerHTML = `<div style="font-size:0.78rem;color:var(--c-teal);margin-top:8px;padding:8px;background:rgba(15,164,175,0.05);border-radius:6px;"><strong>${fileList.length} file(s) ready for ingestion:</strong><br>${fileList.join('<br>')}</div>`;
  }
}

function storeFileToAsset(file) {
  // Store file metadata and blob reference for ingestion
  const FILES_KEY = 'compliq_ingest_files';
  const UPLOADS_REAL_KEY = 'compliq_uploads_real'; // New: track real uploads
  let storedFiles = JSON.parse(localStorage.getItem(FILES_KEY) || '[]');
  let realUploads = JSON.parse(localStorage.getItem(UPLOADS_REAL_KEY) || '[]');
  
  // Get current logged-in user
  const SESSION_KEY = 'compliq_session';
  const sess = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  
  // Limit stored files to avoid exceeding localStorage quota
  if (storedFiles.length > 20) {
    storedFiles = storedFiles.slice(-20);
  }
  
  const fileEntry = {
    name: file.name,
    type: file.type,
    size: file.size,
    timestamp: new Date().toISOString(),
    turbineId: document.getElementById('ig-turbine')?.value || '',
    blade: document.getElementById('ig-blade')?.value || 'A'
  };
  
  storedFiles.push(fileEntry);
  localStorage.setItem(FILES_KEY, JSON.stringify(storedFiles));
  
  // NEW: Track real upload for admin panel
  if (sess && sess.email) {
    const realUpload = {
      id: 'UP-' + Date.now(),
      uploadedBy: sess.email,
      uploadedByName: `${sess.firstName} ${sess.lastName}`,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      records: Math.floor(Math.random() * 50) + 1, // Approximate
      timestamp: new Date().toISOString(),
      sector: sess.sector || 'wind',
      assetId: document.getElementById('ig-turbine')?.value || 'UNKNOWN',
      status: 'Processed',
      organization: sess.org || 'Unknown'
    };
    realUploads.push(realUpload);
    localStorage.setItem(UPLOADS_REAL_KEY, JSON.stringify(realUploads));
  }
  
  // Show toast confirmation
  showToast(`File stored: ${file.name}`, 'success');
}

// Dropzone
document.getElementById('file-inp')?.addEventListener('change', function() {
  if (!this.files[0]) return;
  const f = this.files[0];
  const prev = document.getElementById('file-preview');
  prev.style.display = 'block';

  // Revoke any existing object URLs to free up memory
  if (this.currentObjectUrl) {
    URL.revokeObjectURL(this.currentObjectUrl);
    this.currentObjectUrl = null;
  }

  if (f.type.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(f);
    this.currentObjectUrl = objectUrl;
    prev.innerHTML = `<img src="${objectUrl}" style="max-width:200px;max-height:120px;border-radius:6px;border:1px solid var(--c-border);margin-top:8px;">
      <p style="font-size:0.75rem;color:var(--c-teal);margin-top:6px;">✓ ${f.name} loaded</p>`;
  } else if (f.name.endsWith('.json') || f.type === 'application/json') {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        const count = Array.isArray(parsed) ? parsed.length : 1;
        prev.innerHTML = `<p style="font-size:0.78rem;color:var(--c-teal);margin-top:8px;">✓ JSON Data: Detected ${count} item(s) to import.</p>`;
        document.getElementById('file-inp').parsedJsonData = parsed;
      } catch (err) {
        prev.innerHTML = `<p style="font-size:0.78rem;color:var(--c-orange);margin-top:8px;">⚠ Invalid JSON: ${err.message}</p>`;
      }
    };
    reader.readAsText(f);
  } else {
    prev.innerHTML = `<p style="font-size:0.78rem;color:var(--c-teal);margin-top:8px;">✓ File attached: ${f.name} (${(f.size/1024).toFixed(0)} KB)</p>`;
  }
});

const dz = document.getElementById('dropzone');
['dragover','dragenter'].forEach(ev => dz?.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
['dragleave','drop'].forEach(ev => dz?.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
dz?.addEventListener('drop', e => {
  const files = e.dataTransfer.files;
  if (files[0]) {
    const fi = document.getElementById('file-inp');
    const dt = new DataTransfer();
    dt.items.add(files[0]);
    fi.files = dt.files;
    fi.dispatchEvent(new Event('change'));
  }
});

// ══════════════════════════════════════════════════
// 11. MANUAL ENTRY
// ══════════════════════════════════════════════════
function populateManualSelects() {
  ['md-turbine', 'mi-turbine'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = STATE.db.turbines.map(t =>
      `<option value="${t.id}">${turbineLabel(t)}</option>`).join('');
  });
  // Set today as default date
  const today = new Date().toISOString().slice(0,10);
  ['md-date','mi-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

// Manual tabs
document.querySelectorAll('.manual-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.manual-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.manual-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`mform-${tab.dataset.mtab}`).classList.add('active');
  });
});

function syncBladeNumberFields() {
  const count = Math.min(6, Math.max(1, parseInt(document.getElementById('mt-blade-count')?.value, 10) || 3));
  document.querySelectorAll('[data-blade-slot]').forEach(slot => {
    const n = Number(slot.dataset.bladeSlot);
    const show = n <= count;
    slot.hidden = !show;
    const input = slot.querySelector('input');
    if (input && !show) input.value = '';
  });
}

function bladeNumbersFromForm() {
  const count = Math.min(6, Math.max(1, parseInt(document.getElementById('mt-blade-count')?.value, 10) || 3));
  const blades = [];
  for (let n = 1; n <= count; n += 1) {
    const value = document.getElementById(`mt-blade-${n}`)?.value.trim();
    if (value) blades.push(value);
  }
  return { count, blades };
}

function handleAddTurbine(e) {
  e.preventDefault();
  const gps = document.getElementById('mt-gps').value.split(',');
  const bladeInfo = bladeNumbersFromForm();
  const newT = {
    id: STATE.db.turbines.length + 1,
    assetId: document.getElementById('mt-id').value,
    name: document.getElementById('mt-id').value,
    site: document.getElementById('mt-site').value,
    state: document.getElementById('mt-site').value,
    gps: { lat: parseFloat(gps[0]) || 0, lng: parseFloat(gps[1]) || 0 },
    location: `${document.getElementById('mt-site').value} — GPS: ${document.getElementById('mt-gps').value}`,
    status: 'normal',
    health: parseInt(document.getElementById('mt-health').value) || 97,
    rotorDia: parseInt(document.getElementById('mt-rotor').value) || 126,
    hubHeight: parseInt(document.getElementById('mt-hub').value) || 90,
    power: parseFloat(document.getElementById('mt-power').value) || 2.5,
    manufacturer: document.getElementById('mt-mfr').value,
    model: document.getElementById('mt-model').value,
    commYear: parseInt(document.getElementById('mt-year').value) || 2023,
    windSpeed: parseFloat(document.getElementById('mt-wind').value) || 12,
    rpm: parseFloat(document.getElementById('mt-rpm').value) || 14.5,
    inspCoverage: 0,
    lastInspection: '—',
    campaign: '—',
    anomalies: 0, defects: [],
    bladeCount: bladeInfo.count,
    blades: bladeInfo.blades
  };
  STATE.db.turbines.push(newT);
  saveDB(STATE.db);
  const bladeNote = bladeInfo.blades.length ? ` | Blades ${bladeInfo.blades.join(', ')}` : ` | ${bladeInfo.count} blades`;
  addManualRecord('turbine', `${newT.assetId}`, `${newT.site} | ${newT.location}${bladeNote}`);
  renderMetrics();
  renderFleetGrid();
  renderAssetList();
  populateManualSelects();
  populateTurbineSelector();
  showToast(`Turbine ${newT.assetId} added to fleet!`, 'success');
  e.target.reset();
  syncBladeNumberFields();
}

function handleAddDefect(e) {
  e.preventDefault();
  const turbineId = parseInt(document.getElementById('md-turbine').value);
  const turbine = STATE.db.turbines.find(t => t.id === turbineId);
  const autoId = document.getElementById('md-id').value || `DEF-${String(STATE.db.defects.length + 1).padStart(3,'0')}`;
  const newD = {
    id: autoId,
    assetId: turbineId,
    blade: document.getElementById('md-blade').value,
    dist: parseInt(document.getElementById('md-dist').value),
    type: document.getElementById('md-type').value,
    confidence: parseInt(document.getElementById('md-conf').value) / 100,
    severity: parseInt(document.getElementById('md-sev').value),
    priority: getSeverityPriority(parseInt(document.getElementById('md-sev').value)),
    action: document.getElementById('md-action').value,
    status: 'Pending',
    method: document.getElementById('md-method').value,
    gps: document.getElementById('md-gps').value || (turbine ? `${turbine.gps.lat}, ${turbine.gps.lng}` : ''),
    campaign: document.getElementById('md-campaign').value || 'MANUAL-ENTRY',
    inspDate: document.getElementById('md-date').value || new Date().toISOString().slice(0,10),
    notes: document.getElementById('md-notes').value || 'Manually recorded defect.'
  };
  STATE.db.defects.push(newD);
  if (turbine) {
    turbine.anomalies++;
    turbine.defects.push(newD.id);
    if (newD.severity >= 4 && turbine.status === 'normal') turbine.status = 'warning';
    if (newD.severity >= 5) turbine.status = 'critical';
    const newHealth = Math.max(turbine.health - newD.severity * 3, 10);
    turbine.health = newHealth;
  }
  saveDB(STATE.db);
  addManualRecord('defect', `${newD.id} — ${newD.type}`, `Blade ${newD.blade} | ${newD.dist}m | SEV-${newD.severity} | ${turbine?.assetId}`);
  addNotification(`Manual defect recorded: ${newD.id} on ${turbine?.assetId}`, newD.severity >= 4 ? 'crit' : 'warn');
  renderMetrics();
  renderFleetGrid();
  renderAssetList();
  showToast(`Defect ${newD.id} recorded!`, 'success');
  e.target.reset();
}

function handleLogInspection(e) {
  e.preventDefault();
  const turbineId = parseInt(document.getElementById('mi-turbine').value);
  const turbine = STATE.db.turbines.find(t => t.id === turbineId);
  const date = document.getElementById('mi-date').value;
  const result = document.getElementById('mi-result').value;
  if (turbine) {
    turbine.lastInspection = date;
    turbine.campaign = document.getElementById('mi-campaign').value || 'MANUAL';
    turbine.inspCoverage = Math.min(turbine.inspCoverage + 20, 100);
  }
  saveDB(STATE.db);
  addManualRecord('inspection', `Inspection on ${turbine?.assetId}`, `${date} | ${result} | Inspector: ${document.getElementById('mi-inspector').value}`);
  renderAssetList();
  showToast('Inspection event logged!', 'success');
  e.target.reset();
}

function addManualRecord(type, title, details) {
  const list = document.getElementById('manual-records-list');
  if (!list) return;
  const time = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'manual-record-item';
  item.innerHTML = `
    <span class="mr-type-badge ${type}">${type.toUpperCase()}</span>
    <div class="mr-details"><strong>${title}</strong><span>${details}</span></div>
    <span class="mr-time">${time}</span>
  `;
  // Remove placeholder text
  if (list.querySelector('p')) list.innerHTML = '';
  list.prepend(item);
}

function clearManualRecords() {
  const list = document.getElementById('manual-records-list');
  list.innerHTML = '<p style="color:var(--c-muted);font-size:0.85rem;padding:20px 0">No manual records added yet. Use the forms above to record data.</p>';
}

// ══════════════════════════════════════════════════
// 12. ANALYTICS CHARTS (CHART.JS — live fleet data)
// ══════════════════════════════════════════════════
let CHARTS = {
  health: null,
  defects: null,
  timeline: null
};

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function chartUiScale() {
  const w = window.innerWidth || 1200;
  if (w < 640) return { tick: 9, legend: 10, title: 11, tip: 10 };
  if (w < 980) return { tick: 10, legend: 11, title: 12, tip: 11 };
  return { tick: 11, legend: 12, title: 13, tip: 12 };
}

function getChartTheme() {
  const light = isLightTheme();
  const scale = chartUiScale();
  return {
    light,
    tick: light ? '#48627e' : 'rgba(175, 195, 222, 0.82)',
    legend: light ? '#183450' : 'rgba(232, 242, 255, 0.92)',
    grid: light ? 'rgba(49, 92, 139, 0.14)' : 'rgba(85, 153, 214, 0.16)',
    tipBg: light ? '#ffffff' : '#0b1d32',
    tipTitle: light ? '#183450' : '#d9eaff',
    tipBody: light ? '#48627e' : '#afc3de',
    tipBorder: light ? '#087f88' : '#20d3ce',
    pieBorder: light ? '#f5f8fc' : '#07172a',
    line: light ? '#087f88' : '#20d3ce',
    fill: light ? 'rgba(8, 127, 136, 0.12)' : 'rgba(32, 211, 206, 0.18)',
    font: scale
  };
}

/** Live defect rows for analytics (fleet DB + Blade 5297 POC annotations when loaded). */
function getAnalyticsDefects() {
  const base = Array.isArray(STATE.db?.defects) ? STATE.db.defects.slice() : [];
  const extra = [];
  if (Array.isArray(BLADE_POC?.annotations) && BLADE_POC.annotations.length) {
    BLADE_POC.annotations.forEach((a, i) => {
      const cls = a.defect_class || a.type || 'Other';
      // Normalize annotation classes into fleet-facing types
      let type = 'Other';
      const c = String(cls).toLowerCase();
      if (c.includes('crack')) type = 'Crack';
      else if (c.includes('delam')) type = 'Delamination';
      else if (c.includes('erosion') || c.includes('coating') || c.includes('film')) type = 'Erosion';
      else if (c.includes('lightning') || c.includes('thunder')) type = 'Lightning';
      else if (c.includes('corrosion')) type = 'Corrosion';
      else if (c.includes('oil')) type = 'Oil Leakage';
      else if (c.includes('craze') || c.includes('stain') || c.includes('pinhole')) type = 'Surface';
      else if (c.includes('local')) type = 'Localized Damage';
      else type = cls.replace(/\b\w/g, ch => ch.toUpperCase()).slice(0, 28);

      extra.push({
        id: `POC-${a.id || i}`,
        assetId: 1,
        type,
        severity: Number(a.severity) || 1,
        inspDate: '2026-04-12',
        campaign: 'REU_WT_IR_003_2026'
      });
    });
  }
  return base.concat(extra);
}

function chartTooltipOpts(theme) {
  return {
    backgroundColor: theme.tipBg,
    titleColor: theme.tipTitle,
    bodyColor: theme.tipBody,
    titleFont: { family: 'Outfit', size: theme.font.tip, weight: '600' },
    bodyFont: { family: 'JetBrains Mono', size: theme.font.tip - 1 },
    borderColor: theme.tipBorder,
    borderWidth: 1,
    padding: 10
  };
}

async function renderCharts() {
  if (!STATE.db) return;
  try { await loadBladePocAnnotations(); } catch (e) { /* optional POC layer */ }
  renderHealthChart();
  renderDefectPieChart();
  renderTimelineChart();
}

function renderHealthChart() {
  const canvas = document.getElementById('chart-health');
  if (!canvas) return;
  if (CHARTS.health) CHARTS.health.destroy();

  const theme = getChartTheme();
  const turbines = STATE.db.turbines || [];
  const defects = getAnalyticsDefects();
  const labels = turbines.map(t => t.assetId);
  const health = turbines.map(t => Number(t.health) || 0);
  const highFindings = turbines.map(t => defects.filter(d =>
    (String(d.assetId) === String(t.id) || String(d.assetId) === String(t.assetId)) && Number(d.severity) >= 4
  ).length);

  CHARTS.health = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Health Index (%)',
          data: health,
          backgroundColor: 'rgba(15,164,175,0.82)',
          borderWidth: 0,
          borderRadius: 5,
          barPercentage: 0.62,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Critical / major findings',
          data: highFindings,
          borderColor: '#F08A55',
          backgroundColor: '#F08A55',
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: 'yFindings'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: { color: theme.legend, font: { family: 'Outfit', size: theme.font.legend }, boxWidth: 12 }
        },
        tooltip: {
          ...chartTooltipOpts(theme),
          callbacks: {
            afterBody: (items) => {
              const t = turbines[items[0]?.dataIndex];
              return t ? `${t.site || ''} · ${t.status || ''}`.trim() : '';
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 100,
          grid: { color: theme.grid },
          ticks: {
            color: theme.tick,
            font: { family: 'JetBrains Mono', size: theme.font.tick },
            callback: (v) => v + '%'
          }
        },
        yFindings: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          ticks: {
            color: theme.tick,
            stepSize: 1,
            precision: 0,
            font: { family: 'JetBrains Mono', size: theme.font.tick }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: theme.tick,
            font: { family: 'Outfit', size: theme.font.tick, weight: '600' },
            maxRotation: 0,
            autoSkip: true
          }
        }
      },
      onClick: (e, activeEl) => {
        if (activeEl?.length) {
          const turbine = turbines[activeEl[0].index];
          if (turbine) {
            STATE.selectedTurbineId = turbine.id;
            navigateTo('asset');
            showToast(`Navigated to ${turbine.assetId} Detail`, 'info');
          }
        }
      }
    }
  });
}

function renderDefectPieChart() {
  const canvas = document.getElementById('chart-defects');
  if (!canvas) return;
  if (CHARTS.defects) CHARTS.defects.destroy();

  const theme = getChartTheme();
  const types = {};
  getAnalyticsDefects().forEach(d => {
    const key = d.type || 'Other';
    types[key] = (types[key] || 0) + 1;
  });

  const tealRamp = ['#226876', '#348088', '#12A0AA', '#4EC4CC', '#7ED3DA'];
  const shadeOrder = [0, 3, 1, 4, 2];
  const labels = Object.keys(types).sort((a, b) => types[b] - types[a]);
  const data = labels.map(t => types[t]);
  const backgroundColors = labels.map((_, i) => tealRamp[shadeOrder[i % shadeOrder.length]]);

  CHARTS.defects = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        hoverBorderWidth: 0,
        borderColor: 'transparent',
        hoverBorderColor: 'transparent',
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '52%',
      plugins: {
        legend: {
          position: window.innerWidth < 720 ? 'bottom' : 'right',
          labels: {
            color: theme.legend,
            font: { family: 'Outfit', size: theme.font.legend, weight: '500' },
            boxWidth: 12,
            boxHeight: 12,
            padding: 12,
            generateLabels: (chart) => {
              const ds = chart.data.datasets[0];
              const total = ds.data.reduce((a, b) => a + b, 0) || 1;
              return chart.data.labels.map((label, i) => ({
                text: `${label}  ${ds.data[i]} (${Math.round(ds.data[i] / total * 100)}%)`,
                fillStyle: ds.backgroundColor[i],
                strokeStyle: ds.backgroundColor[i],
                fontColor: theme.legend,
                lineWidth: 0,
                hidden: false,
                index: i
              }));
            }
          }
        },
        tooltip: {
          ...chartTooltipOpts(theme),
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0) || 1;
              const n = ctx.raw || 0;
              return ` ${ctx.label}: ${n}  (${Math.round(n / total * 100)}%)`;
            }
          }
        }
      }
    }
  });
}

function renderTimelineChart() {
  const canvas = document.getElementById('chart-timeline');
  if (!canvas) return;
  if (CHARTS.timeline) CHARTS.timeline.destroy();

  const theme = getChartTheme();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: monthNames[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
      count: 0
    });
  }

  const bump = (iso) => {
    if (!iso) return;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const b = buckets.find(x => x.key === key);
    if (b) b.count += 1;
  };

  getAnalyticsDefects().forEach(d => bump(d.inspDate));
  (STATE.db.turbines || []).forEach(t => bump(t.lastInspection));

  // If sparse, keep zeros — still live. Avoid fabricating fake trends.
  const data = buckets.map(b => b.count);
  const labels = buckets.map(b => b.label);

  CHARTS.timeline = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Inspections & findings',
        data,
        borderColor: theme.line,
        backgroundColor: theme.fill,
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: theme.line,
        pointBorderColor: theme.pieBorder,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...chartTooltipOpts(theme),
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex ?? 0;
              const b = buckets[i];
              return b ? `${b.label} ${b.year}` : '';
            },
            label: (ctx) => ` ${ctx.raw} logged event(s)`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: theme.grid },
          ticks: {
            stepSize: 1,
            precision: 0,
            color: theme.tick,
            font: { family: 'JetBrains Mono', size: theme.font.tick }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: theme.tick,
            font: { family: 'Outfit', size: theme.font.tick, weight: '600' }
          }
        }
      }
    }
  });
}


// ══════════════════════════════════════════════════
// 13. MQTT LIVE LOG SIMULATION
// ══════════════════════════════════════════════════
const MQTT_EVENTS = [
  { type: 'Heartbeat', severity: 0, template: (t) => `${t.assetId} • ω=${t.rpm}rpm • v=${t.windSpeed}m/s • P=${t.power}MW` },
  { type: 'Anomaly', severity: 4, template: (t) => `ANOMALY_DETECT • asset=${t.assetId} • type=Crack • conf=0.${Math.floor(Math.random()*20+70)} • sev=${Math.floor(Math.random()*2+3)}` },
  { type: 'Alert', severity: 3, template: (t) => `THRESHOLD_BREACH • ${t.assetId} • param=vibration_rms • val=${(3.2 + Math.random()*2).toFixed(2)}g • limit=3.0g` },
  { type: 'Ok', severity: 0, template: (t) => `STATUS_OK • ${t.assetId} • health=${t.health}% • uptime=99.7%` },
];

function addMQTTLog(customData) {
  const log = document.getElementById('mqtt-log');
  if (!log) return;
  const turbine = STATE.db.turbines[Math.floor(Math.random() * STATE.db.turbines.length)];
  const evt = customData ? null : MQTT_EVENTS[Math.floor(Math.random() * MQTT_EVENTS.length)];
  const ts = new Date().toLocaleTimeString();

  const entry = document.createElement('div');
  if (customData) {
    entry.className = `log-entry ${customData.severity >= 4 ? 'crit' : customData.severity >= 3 ? 'warn' : 'ok'}`;
    entry.innerHTML = `<div class="log-head"><span>INGEST/${customData.device_id}</span><span>${ts}</span></div>
      <div class="log-payload">${customData.type} • SEV=${customData.severity} • conf=${(customData.confidence*100).toFixed(0)}%</div>`;
  } else {
    const cls = evt.severity >= 4 ? 'crit' : evt.severity >= 3 ? 'warn' : 'ok';
    entry.className = `log-entry ${cls}`;
    entry.innerHTML = `<div class="log-head"><span>${evt.type.toUpperCase()}/${turbine.assetId}</span><span>${ts}</span></div>
      <div class="log-payload">${evt.template(turbine)}</div>`;
  }

  log.prepend(entry);
  while (log.children.length > 12) log.removeChild(log.lastChild);
}

// ══════════════════════════════════════════════════
// 14. NOTIFICATIONS
// ══════════════════════════════════════════════════
let NOTIFICATIONS = [
  { msg: 'WTG-003: Lightning strike detected — SEV 5 CRITICAL', type: 'crit', time: '09:12 AM' },
  { msg: 'WTG-002: Delamination confirmed — dispatch advisory issued', type: 'warn', time: '08:44 AM' },
  { msg: 'System: 6 turbines connected to MQTT stream', type: 'info', time: '08:00 AM' }
];

function renderNotifications() {
  const panel = document.getElementById('notif-list-items');
  panel.innerHTML = NOTIFICATIONS.map(n => `
    <div class="notif-item ${n.type}">
      ${n.msg}<span class="notif-time">${n.time}</span>
    </div>
  `).join('') || '<div style="padding:16px;font-size:0.8rem;color:var(--c-muted)">No alerts</div>';
  document.getElementById('notif-badge').textContent = NOTIFICATIONS.length;
}

function addNotification(msg, type = 'info') {
  NOTIFICATIONS.unshift({ msg, type, time: new Date().toLocaleTimeString() });
  if (NOTIFICATIONS.length > 20) NOTIFICATIONS.pop();
  renderNotifications();
}

function clearNotifs() {
  NOTIFICATIONS = [];
  renderNotifications();
  document.getElementById('notif-badge').style.display = 'none';
}

document.getElementById('notif-bell')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('notif-panel').classList.toggle('show');
});
document.addEventListener('click', () => document.getElementById('notif-panel')?.classList.remove('show'));

// ══════════════════════════════════════════════════
// 15. AI COPILOT
// ══════════════════════════════════════════════════
document.getElementById('ai-trigger')?.addEventListener('click', () => {
  document.getElementById('ai-chat-box').classList.toggle('open');
});

document.getElementById('ai-send')?.addEventListener('click', sendAIMessage);
document.getElementById('ai-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendAIMessage();
});

document.querySelectorAll('.sugg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.q;
    document.getElementById('ai-input').value = q;
    sendAIMessage();
  });
});

function sendAIMessage() {
  const input = document.getElementById('ai-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  addAIMessage(q, 'user');
  setTimeout(() => {
    const resp = processAIQuery(q);
    addAIMessage(resp, 'bot');
  }, 600 + Math.random() * 400);
}

function addAIMessage(text, role) {
  const msgs = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-bubble ${role}`;
  div.innerHTML = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function processAIQuery(q) {
  const query = q.toLowerCase();
  const db = STATE.db;

  if (query.includes('fleet') && query.includes('health')) {
    const avg = db.turbines.reduce((s,t) => s+t.health, 0) / db.turbines.length;
    return `Fleet health index: <strong>${avg.toFixed(1)}%</strong><br>${db.turbines.filter(t=>t.status==='critical').length} critical, ${db.turbines.filter(t=>t.status==='warning').length} advisory.`;
  }
  if (query.includes('critical') || (query.includes('defect') && (query.includes('sev') || query.includes('high')))) {
    const crits = db.defects.filter(d => d.severity >= 4);
    if (!crits.length) return 'No critical or high-severity defects currently recorded. ✓';
    return `<strong>${crits.length} critical/high defects:</strong><br>` +
      crits.map(d => {
        const t = db.turbines.find(t2=>t2.id===d.assetId);
        return `• ${d.id} — ${d.type} on ${t?.assetId} Blade ${d.blade} (SEV-${d.severity})`;
      }).join('<br>');
  }
  if (query.includes('lowest health') || query.includes('worst')) {
    const worst = [...db.turbines].sort((a,b) => a.health - b.health)[0];
    return `Lowest health: <strong>${turbineLabel(worst)}</strong><br>Health: ${worst.health}% | Status: ${worst.status.toUpperCase()}<br>Anomalies: ${worst.anomalies}<br>Location: ${worst.location}`;
  }
  if (query.includes('turbine 3') || query.includes('wtg-003') || query.includes('gujarat')) {
    const t = db.turbines.find(t=>t.assetId==='WTG-003');
    if (!t) return 'Turbine WTG-003 not found.';
    return `<strong>WTG-003 — ${t.name}</strong><br>Health: ${t.health}%<br>Status: ${t.status.toUpperCase()}<br>Anomalies: ${t.anomalies}<br>Location: ${t.location}`;
  }
  if (query.includes('action') || query.includes('recommend')) {
    const pending = db.defects.filter(d => d.status === 'Pending').slice(0,4);
    return `<strong>Top Pending Actions:</strong><br>` +
      pending.map(d => {
        const t = db.turbines.find(t2=>t2.id===d.assetId);
        return `• [${d.priority}] ${t?.assetId} ${d.id}: ${d.action}`;
      }).join('<br>');
  }
  if (query.includes('how many') || query.includes('count')) {
    return `Fleet: <strong>${db.turbines.length}</strong> turbines<br>Total defects: <strong>${db.defects.length}</strong><br>Critical: <strong>${db.defects.filter(d=>d.severity>=4).length}</strong><br>Pending: <strong>${db.defects.filter(d=>d.status==='Pending').length}</strong>`;
  }
  if (query.includes('location') || query.includes('gps') || query.includes('where')) {
    return `<strong>Turbine Locations:</strong><br>` +
      db.turbines.map(t => `• ${t.assetId}: ${t.location} <br>&nbsp;&nbsp;📍 ${t.gps.lat}°N, ${t.gps.lng}°E`).join('<br>');
  }
  if (query.includes('delamination')) {
    const d = db.defects.filter(d => d.type === 'Delamination');
    return `Found <strong>${d.length} delamination defects</strong>:<br>` +
      d.map(x => { const t = db.turbines.find(t2=>t2.id===x.assetId); return `• ${x.id} on ${t?.assetId} Blade ${x.blade} (SEV-${x.severity})`; }).join('<br>');
  }
  if (query.includes('crack')) {
    const d = db.defects.filter(d => d.type === 'Crack');
    return `Found <strong>${d.length} crack defects</strong>:<br>` +
      d.map(x => { const t = db.turbines.find(t2=>t2.id===x.assetId); return `• ${x.id} on ${t?.assetId} Blade ${x.blade} — ${x.dist}m from root`; }).join('<br>');
  }
  if (query.includes('inspection') || query.includes('last')) {
    return `<strong>Last Inspection Dates:</strong><br>` +
      db.turbines.map(t => `• ${t.assetId}: ${t.lastInspection} (${t.campaign})`).join('<br>');
  }
  if (query.includes('help') || query.includes('what can')) {
    return `I can answer questions like:<br>• "Show all critical defects"<br>• "What is fleet health?"<br>• "Which turbine has lowest health?"<br>• "Show turbine locations"<br>• "List all actions"<br>• "How many cracks detected?"`;
  }
  // Fallback: fuzzy turbine lookup
  const matchedT = db.turbines.find(t =>
    query.includes(t.assetId.toLowerCase()) || query.includes(t.name.toLowerCase()) || query.includes(t.state.toLowerCase())
  );
  if (matchedT) {
    const defs = db.defects.filter(d => d.assetId === matchedT.id);
    return `<strong>${turbineLabel(matchedT)}</strong><br>
      Health: ${matchedT.health}% | Status: ${matchedT.status.toUpperCase()}<br>
      Location: ${matchedT.location}<br>
      Defects: ${defs.length} | Anomalies: ${matchedT.anomalies}<br>
      Last Inspection: ${matchedT.lastInspection}`;
  }
  return `I couldn't find specific data for that query. Try: "Show critical defects", "Fleet health", "Turbine locations", or "All recommended actions".`;
}

// ══════════════════════════════════════════════════
// 16. NL TOPBAR SEARCH
// ══════════════════════════════════════════════════
document.getElementById('nl-input')?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const q = document.getElementById('nl-input').value.trim();
  if (!q) return;
  document.getElementById('ai-chat-box').classList.add('open');
  document.getElementById('ai-input').value = q;
  document.getElementById('nl-input').value = '';
  setTimeout(sendAIMessage, 100);
});

// ══════════════════════════════════════════════════
// 17. BACKGROUND PARTICLE CANVAS
// ══════════════════════════════════════════════════
function initBgCanvas() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, pts = [];

  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  resize(); window.addEventListener('resize', resize);

  for (let i = 0; i < 60; i++) {
    pts.push({ x: Math.random()*W, y: Math.random()*H, vx:(Math.random()-.5)*.3, vy:(Math.random()-.5)*.3, r:Math.random()+0.3 });
  }
  function frame() {
    ctx.clearRect(0,0,W,H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(15,164,175,0.4)'; ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  frame();
}

// ══════════════════════════════════════════════════
// 18. TOAST
// ══════════════════════════════════════════════════
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.className = 'toast', 3000);
}

// ══════════════════════════════════════════════════
// BLADE A POC — PROFILE + STATION IMAGERY
// ══════════════════════════════════════════════════
const POC_SURFACES = ['SS', 'LE', 'PS', 'TE'];
/* Matches compliq_blade_profile.py integer data box — G97 2 MW, P1 root/hub → P20 tip */
const POC_X_MIN = -8;
const POC_X_MAX = 39;
const POC_Y_MIN = -4;
const POC_Y_MAX = 54;
const POC_SURFACE_CX = { SS: 6.6, LE: 16, PS: 25.6, TE: 35.2 };
const G97_REMOTE = 'https://pub-8e9091debbe04bb3a5c42871ef2e7bc8.r2.dev/Kayathar_Gamesa_G97';
const G97_ROOT = 'INPUT/Kayathar_Gamesa_G97';
const G97_FOLDERS = {
  A: { SS: 'Blade_A/SS', PS: 'Blade_A/PS', LE: 'Blade_A/LE', TE: 'Blade_A/TE' },
  B: { SS: 'Blade_B/SS', PS: 'Blade_B/PS', LE: 'Blade_B/LE', TE: 'Blade_B/TE' },
  C: { SS: 'Blade_C/SS', PS: 'Blade_C/PS', LE: 'Blade_C/LE', TE: 'Blade_C/TE' }
};
const G97_BLADE_NUM = { A: '1', B: '2', C: '3' };
/** Captures not present in INPUT (Blade A PS 11–14, Blade B LE 16). */
const G97_MISSING = new Set(['A-PS-11', 'A-PS-12', 'A-PS-13', 'A-PS-14', 'B-LE-16']);
const SEV_COLOR = { 1: '#B9D896', 2: '#FACD96', 3: '#F0A03C', 4: '#E15A5F', 5: '#AF373C' };
/** Identified defects. Key is Blade-Surface-station. Add a row when a new image is reviewed. */
const STATION_DEFECTS = {
  'A-PS-2':  { severity: 4, label: 'Corrosion' },
  'A-PS-5':  { severity: 2, label: 'Erosion' },
  'A-PS-7':  { severity: 1, label: 'Surface stains' },
  'A-PS-10': { severity: 2, label: 'Craze' },
  'A-PS-13': { severity: 3, label: 'Localized damage' },
  'A-PS-18': { severity: 3, label: 'Localized damage' },
  'A-PS-20': { severity: 5, label: 'Lightning' }
};
/** Two comparison captures per surface. Append objects here to show more images later. */
const COMPARE_SLOTS = [
  { pointIndex: 1, label: 'Root / Hub' },
  { pointIndex: 10, label: 'Midspan' }
];
const POC_STATION_MEDIA = {
  2: {
    short: 'Root / Hub', station: '0% Root / Hub',
    annotated: 'Annotated Images/1_RootHub_annotated.jpg',
    annotationImage: '1_PS_Blade5297_RootHUb.png'
  },
  5: {
    short: 'Root → Inboard', station: '0-25% Root to inboard span',
    annotated: 'Annotated Images/2_Root25_annotated.jpg',
    annotationImage: '2_PS_Blade5297_Root25.png'
  },
  7: {
    short: 'Midspan', station: '35% Midspan',
    annotated: 'Annotated Images/3_Midspan35_annotated.jpg',
    annotationImage: '3_PS_Blade5297_Midpsan35.png'
  },
  10: {
    short: 'Midspan', station: '50% Midspan',
    annotated: 'Annotated Images/4_Midspan_50_annotated.jpg',
    annotationImage: '4_PS_Blade5297_Mispan_50.png'
  },
  13: {
    short: 'Midspan', station: '75% Midspan',
    annotated: 'Annotated Images/5_Midspan75_annotated.jpg',
    annotationImage: '5_PS_Blade5297_Mispan75.png'
  },
  18: {
    short: 'Outboard / Tip approach', station: '90% Outboard / tip approach',
    annotated: 'Annotated Images/6_Tip90_annotated.jpg',
    annotationImage: '6_PS_Blade5297_Tip90.png'
  },
  20: {
    short: 'Blade tip', station: '100% Blade tip',
    annotated: 'Annotated Images/7_Tip100_annotated.jpg',
    annotationImage: '7_PS_Blade5297_Tip100.png'
  }
};

const BLADE_POC = {
  ready: false,
  annotations: [],
  profileSrc: 'blade_profile_after.png?v=g97scale',
  pdfHref: 'reports/REU_WT_IR_003_2026_Blade5297_PS_Defect_Register.pdf'
};

function bladeSpanM(turbine) {
  if (!turbine) return 48.5;
  if (turbine.bladeLength) return Number(turbine.bladeLength);
  if (turbine.rotorDia) return Number((turbine.rotorDia / 2).toFixed(1));
  return 48.5;
}

function pointMetres(i, span) {
  return span * (i - 1) / 19;
}

function surfaceXPct(surface) {
  return ((POC_SURFACE_CX[surface] - POC_X_MIN) / (POC_X_MAX - POC_X_MIN)) * 100;
}

function pointYPct(i, span) {
  const m = pointMetres(i, span);
  return ((POC_Y_MAX - m) / (POC_Y_MAX - POC_Y_MIN)) * 100;
}

function activeBladeLetter() {
  const part = STATE.selectedPart || '';
  if (part.startsWith('blade-')) return part.replace('blade-', '');
  return STATE.selectedBlade || 'A';
}

function g97FileNumbers(blade, surface) {
  /* Blade C suction-side files are stored as BLADE2. Never borrow another blade's file. */
  const primary = (blade === 'C' && surface === 'SS') ? '2' : G97_BLADE_NUM[blade];
  return [primary];
}

function useFirstExistingImage(img, candidates, onMiss) {
  if (!img) return;
  const epoch = STATE.assetEpoch;
  let index = 0;
  const tryNext = () => {
    if (!img.isConnected || epoch !== STATE.assetEpoch) return;
    if (index >= candidates.length) {
      img.onerror = null;
      if (onMiss) onMiss();
      return;
    }
    img.onerror = tryNext;
    img.src = encodeURI(candidates[index]);
    index += 1;
  };
  tryNext();
}

function g97NamedStation(base, bladeNum, surface, n) {
  return `${base}/GAMESA_G97_2MW_BLADE${bladeNum}_${surface}-${n}`;
}

function g97StationCandidates(blade, surface, index) {
  const folder = G97_FOLDERS[blade]?.[surface];
  if (!folder) return [];
  const n = String(index).padStart(2, '0');
  const base = `${G97_ROOT}/${folder}`;
  const paths = [];
  const numbers = g97FileNumbers(blade, surface);
  const known = !G97_MISSING.has(`${blade}-${surface}-${index}`);
  if (known) {
    const stem = g97NamedStation(base, numbers[0], surface, n);
    /* Annotated copy of the original name, then a JPG that replaced the PNG. */
    paths.push(`${stem}_annotated.jpg`, `${stem}_annotated.png`, `${stem}.jpg`, `${stem}.png`);
  }
  ['annotated', 'corrected', ''].forEach(role => {
    const stem = role ? `${base}/P${n}_${role}` : `${base}/P${n}`;
    paths.push(`${stem}.jpg`, `${stem}.png`);
  });
  if (known) {
    numbers.slice(1).forEach(num => {
      const stem = g97NamedStation(base, num, surface, n);
      paths.push(`${stem}.jpg`, `${stem}.png`);
    });
  }
  const prefix = `${G97_ROOT}/`;
  return paths.flatMap(path => {
    const rel = path.startsWith(prefix) ? path.slice(prefix.length) : path;
    return [`${G97_REMOTE}/${rel}`, path];
  });
}

function stationDefect(blade, surface, index) {
  const hit = STATION_DEFECTS[`${blade}-${surface}-${index}`];
  if (!hit) return null;
  return { severity: hit.severity, label: hit.label, color: SEV_COLOR[hit.severity] || '#9BC4CA' };
}

/* Annotation paint: CAT 1 navy, CAT 2 green, verify red. Matches annotate scripts (OpenCV BGR). */
const FINDING_COLOR = { 1: '#3B82F6', 2: '#F5B400', 3: '#F97316', 4: '#EF4444', 5: '#9F1239', verify: '#C80000' };
/* Both categories color the station dot. CAT 2 is the higher of the two. */
const DOT_MIN_CAT = 2;
const FINDING_SOURCES = [
  { blade: 'A', surface: 'PS', url: 'INPUT/Kayathar_Gamesa_G97/Blade_A/PS/findings_per_frame.csv' },
  { blade: 'A', surface: 'LE', url: 'INPUT/Kayathar_Gamesa_G97/Blade_A/LE/findings_per_frame_LE.csv' },
  { blade: 'A', surface: 'SS', url: 'INPUT/Kayathar_Gamesa_G97/Blade_A/SS/findings_per_frame_SS.csv' },
  { blade: 'A', surface: 'TE', url: 'INPUT/Kayathar_Gamesa_G97/Blade_A/TE/findings_per_frame_TE.csv' },
  { blade: 'B', surface: 'PS', url: 'INPUT/Kayathar_Gamesa_G97/Blade_B/PS/findings_per_frame_B2_PS.csv' },
  { blade: 'B', surface: 'LE', url: 'INPUT/Kayathar_Gamesa_G97/Blade_B/LE/findings_per_frame_B2_LE.csv' },
  { blade: 'C', surface: 'PS', url: 'INPUT/Kayathar_Gamesa_G97/Blade_C/PS/Blade_C_PS_Findings_per_Frame.csv' }
];
const BLADE_FINDINGS = { ready: false, loading: null, rows: [] };

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function parseFindingCsv(text, src) {
  const lines = text.trim().split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(cell => cell.trim().toLowerCase());
  const col = name => header.indexOf(name);
  const frameCol = col('frame');
  const findingCol = col('finding');
  const catCol = col('cat');
  const countCol = col('count') >= 0 ? col('count') : col('boxes in frame');
  if (frameCol < 0 || findingCol < 0 || catCol < 0) return [];
  const out = [];
  lines.slice(1).forEach(line => {
    const parts = line.split(',');
    const frame = (parts[frameCol] || '').trim();
    const finding = (parts[findingCol] || '').trim();
    const cat = Number((parts[catCol] || '').trim());
    const count = Number((parts[countCol] || '').trim()) || 1;
    if (!frame || !finding || !Number.isFinite(cat) || cat < 1 || /no defect/i.test(finding)) return;
    const index = stationIndexFromFrame(frame, src.surface);
    if (!index || index > 20) return;
    const verify = /verify/i.test(finding);
    out.push({
      blade: src.blade,
      surface: src.surface,
      index,
      finding,
      cat,
      count,
      verify,
      color: FINDING_COLOR[cat] || FINDING_COLOR[2],
      rank: cat
    });
  });
  return out;
}

function aggregateFindings(rows) {
  const map = new Map();
  rows.forEach(row => {
    const key = `${row.blade}|${row.surface}|${row.index}|${row.finding}|${row.cat}`;
    const prev = map.get(key);
    if (prev) prev.count += row.count;
    else map.set(key, { ...row, id: `${row.blade}-${row.surface}-${row.index}-${map.size}` });
  });
  return [...map.values()];
}

async function loadBladeFindings() {
  if (BLADE_FINDINGS.ready) return BLADE_FINDINGS.rows;
  if (BLADE_FINDINGS.loading) return BLADE_FINDINGS.loading;
  BLADE_FINDINGS.loading = (async () => {
    const rows = [];
    for (const src of FINDING_SOURCES) {
      const prefix = `${G97_ROOT}/`;
      const rel = src.url.startsWith(prefix) ? src.url.slice(prefix.length) : '';
      const candidates = rel ? [`${G97_REMOTE}/${rel}`, src.url] : [src.url];
      let text = '';
      for (const candidate of candidates) {
        try {
          const res = await fetch(encodeURI(candidate));
          if (!res.ok) continue;
          text = await res.text();
          break;
        } catch (err) {
          console.warn('Station findings unavailable:', candidate, err);
        }
      }
      if (text) rows.push(...parseFindingCsv(text, src));
    }
    BLADE_FINDINGS.rows = aggregateFindings(rows).sort(compareFindings);
    BLADE_FINDINGS.ready = true;
    return BLADE_FINDINGS.rows;
  })();
  return BLADE_FINDINGS.loading;
}

function stationIndexFromFrame(frame, surface) {
  const tagged = frame.match(/^(SS|LE|PS|TE)-(\d+)/i);
  if (tagged) {
    if (tagged[1].toUpperCase() !== surface) return 0;
    return Number(tagged[2]);
  }
  const bare = frame.match(/^(\d{1,2})/);
  return bare ? Number(bare[1]) : 0;
}

function compareFindings(a, b) {
  const order = { SS: 0, LE: 1, PS: 2, TE: 3 };
  return (b.rank - a.rank) || (a.index - b.index) || ((order[a.surface] ?? 9) - (order[b.surface] ?? 9));
}

function findingsForBlade(blade) {
  return BLADE_FINDINGS.rows.filter(row => row.blade === blade).map(findingView);
}

const REPORT_COLUMNS = [
  ['id', 'Defect ID'],
  ['surface', 'Surface'],
  ['location', 'Location'],
  ['type', 'Defect Type'],
  ['radial', 'Radial Pos.'],
  ['dist', 'Dist. from Root'],
  ['intensity', 'Intensity'],
  ['size', 'Length / Size'],
  ['priority', 'Priority'],
  ['status', 'Status']
];

function defectOverrides() {
  try { return JSON.parse(localStorage.getItem('compliq_defect_overrides') || '{}'); }
  catch { return {}; }
}

function writeDefectOverrides(map) {
  localStorage.setItem('compliq_defect_overrides', JSON.stringify(map));
}

function visibleReportColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem('compliq_report_columns') || 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch { /* keep the full table */ }
  return REPORT_COLUMNS.map(col => col[0]);
}

function rawFinding(id) {
  return BLADE_FINDINGS.rows.find(row => row.id === id) || null;
}

function findingView(row) {
  const saved = defectOverrides()[row.id];
  if (!saved) return row;
  const cat = Number(saved.cat) || row.cat;
  const finding = (saved.name || '').trim() || row.finding;
  return {
    ...row,
    cat,
    finding,
    rank: cat,
    color: FINDING_COLOR[cat] || FINDING_COLOR[2]
  };
}

function applyReportColumns() {
  const table = document.getElementById('asset-defects-table');
  if (!table) return;
  const on = new Set(visibleReportColumns());
  REPORT_COLUMNS.forEach(([key]) => {
    table.classList.toggle('hide-col-' + key, !on.has(key));
  });
}

function renderColumnPicker(host) {
  if (!host) return;
  const on = new Set(visibleReportColumns());
  host.innerHTML = REPORT_COLUMNS.map(([key, label]) => `
    <label><input type="checkbox" data-col-key="${key}" ${on.has(key) ? 'checked' : ''}> ${label}</label>
  `).join('');
  host.querySelectorAll('input').forEach(input => {
    input.addEventListener('change', () => {
      const next = REPORT_COLUMNS.map(col => col[0]).filter(key => {
        const box = host.querySelector(`input[data-col-key="${key}"]`);
        return box ? box.checked : true;
      });
      if (!next.length) {
        input.checked = true;
        return;
      }
      localStorage.setItem('compliq_report_columns', JSON.stringify(next));
      applyReportColumns();
      const other = document.getElementById(host.id === 'defect-column-picker' ? 'report-column-picker' : 'defect-column-picker');
      if (other && !other.hidden) renderColumnPicker(other);
    });
  });
}

function repaintHotspotColors() {
  const blade = activeBladeLetter();
  document.querySelectorAll('.asset-bp-hotspot').forEach(btn => {
    const rows = findingsForStation(blade, btn.dataset.surface, Number(btn.dataset.point));
    const marked = dotFinding(rows);
    btn.classList.toggle('has-finding', !!marked);
    btn.classList.toggle('critical', !!marked);
    if (marked) btn.style.setProperty('--finding', marked.color);
    else btn.style.removeProperty('--finding');
    const label = marked ? rows.map(row => `${row.finding} · CAT ${row.cat}`).join(' | ') : '';
    if (label) btn.title = btn.title.replace(/ · .*$/, '') + ' · ' + label;
  });
}

function showDefectReviewBar() {
  const bar = document.getElementById('defect-review-bar');
  const raw = rawFinding(STATE.reviewFindingId);
  if (!bar || !raw) {
    if (bar) bar.hidden = true;
    return;
  }
  const view = findingView(raw);
  const point = 'P' + String(raw.index).padStart(2, '0');
  bar.hidden = false;
  const summary = document.getElementById('defect-review-summary');
  if (summary) summary.textContent = `Blade ${raw.blade} · ${raw.surface} ${point} · ${raw.count} mark${raw.count === 1 ? '' : 's'} · recorded as ${raw.finding}`;
  const cat = document.getElementById('defect-review-cat');
  if (cat) cat.value = String(view.cat);
  const name = document.getElementById('defect-review-name');
  if (name && document.activeElement !== name) fillDefectClassSelect(name, view.finding);
}

function openDefectReview(findingId) {
  const raw = rawFinding(findingId);
  if (!raw) return;
  STATE.reviewFindingId = findingId;
  selectAssetPocPoint(raw.surface, raw.index, findingId);
  showDefectReviewBar();
}

function saveDefectOverrideFrom(catValue, nameValue) {
  const raw = rawFinding(STATE.reviewFindingId);
  if (!raw) return;
  const cat = Number(catValue);
  const name = String(nameValue || '').trim();
  const map = defectOverrides();
  const entry = {};
  if (cat >= 1 && cat <= 5 && cat !== raw.cat) entry.cat = cat;
  if (name && name !== raw.finding) entry.name = name;
  if (Object.keys(entry).length) map[raw.id] = entry;
  else delete map[raw.id];
  writeDefectOverrides(map);
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  renderDefectsTable(turbine);
  repaintHotspotColors();
  showDefectReviewBar();
  showToast('Defect override saved', 'success');
}

function saveDefectOverride() {
  saveDefectOverrideFrom(
    document.getElementById('defect-review-cat')?.value,
    document.getElementById('defect-review-name')?.value
  );
}

function saveReportFindingOverride() {
  saveDefectOverrideFrom(
    document.getElementById('report-review-cat')?.value,
    document.getElementById('report-review-name')?.value
  );
  if (STATE.activeDefect?.findingId) openFindingDetails();
}

function resetDefectOverride() {
  const id = STATE.reviewFindingId || STATE.activeDefect?.findingId;
  if (!id) return;
  const map = defectOverrides();
  delete map[id];
  writeDefectOverrides(map);
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  renderDefectsTable(turbine);
  repaintHotspotColors();
  showDefectReviewBar();
  if (STATE.activeDefect?.findingId === id) openFindingDetails();
  showToast('Defect override cleared', 'success');
}

function openFindingDetails() {
  const raw = rawFinding(STATE.reviewFindingId || STATE.activeDefect?.findingId);
  if (!raw) return;
  const view = findingView(raw);
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const span = bladeSpanM(turbine);
  const metres = pointMetres(view.index, span);
  STATE.pocSurface = view.surface;
  STATE.pocPointIndex = view.index;
  const pointLabel = 'P' + String(view.index).padStart(2, '0');
  STATE.reviewFindingId = raw.id;
  const photos = g97StationCandidates(view.blade, view.surface, view.index);
  STATE.selectedPart = 'blade-' + view.blade;
  STATE.selectedBlade = view.blade;
  STATE.activeDefect = {
    id: `${view.blade}-${view.surface}-${pointLabel}`,
    type: view.finding,
    assetId: turbine?.id,
    blade: view.blade,
    location: `${view.surface} · ${pointLabel}`,
    radialPos: `${metres.toFixed(1)} m / ${span} m (${Math.round((metres / span) * 100)}%)`,
    dist: metres.toFixed(1),
    intensity: `CAT ${view.cat}`,
    severity: view.cat,
    size: `${view.count} mark${view.count === 1 ? '' : 's'}`,
    confidence: 1,
    status: 'Open',
    priority: findingPriority(view),
    method: 'Station inspection',
    inspDate: 'Kayathar Gamesa G97',
    notes: `Recorded finding: ${raw.finding}. Shown name: ${view.finding}. Category CAT ${view.cat}.`,
    action: view.cat >= DOT_MIN_CAT ? 'Confirm the category and include this station in the repair scope.' : 'Log the finding and monitor at the next inspection.',
    campaign: 'Kayathar G97',
    gps: turbine?.gps ? `${turbine.gps.lat}°N, ${turbine.gps.lng}°E` : '',
    findingId: raw.id,
    fromFinding: true,
    stationImage: photos[0] || '',
    stationCandidates: photos
  };
  navigateTo('report');
  renderReport();
}

function hideDefectReview() {
  STATE.reviewFindingId = null;
  const bar = document.getElementById('defect-review-bar');
  const picker = document.getElementById('defect-column-picker');
  if (bar) bar.hidden = true;
  if (picker) picker.hidden = true;
}

function initDefectReview() {
  document.getElementById('defect-review-save')?.addEventListener('click', saveDefectOverride);
  document.getElementById('defect-review-reset')?.addEventListener('click', resetDefectOverride);
  document.getElementById('defect-review-details')?.addEventListener('click', openFindingDetails);
  document.getElementById('defect-review-hide')?.addEventListener('click', hideDefectReview);
  document.getElementById('defect-review-columns')?.addEventListener('click', () => {
    const picker = document.getElementById('defect-column-picker');
    if (!picker) return;
    picker.hidden = !picker.hidden;
    if (!picker.hidden) renderColumnPicker(picker);
  });
  document.getElementById('defect-review-cat')?.addEventListener('change', saveDefectOverride);
  document.getElementById('defect-review-name')?.addEventListener('change', saveDefectOverride);
  applyReportColumns();
}

let reportPickerLock = false;

function reportTurbineId() {
  const raw = document.getElementById('report-turbine')?.value;
  const num = Number(raw);
  if (raw !== '' && Number.isFinite(num) && String(num) === String(raw)) return num;
  return raw || STATE.selectedTurbineId;
}

function selectedReportSides() {
  const sides = [...document.querySelectorAll('.side-tab.is-on')].map(btn => btn.dataset.side);
  return sides.length ? sides : ['PS'];
}

function currentReportSide() {
  return selectedReportSides()[0];
}

function ensureReportSide(side) {
  const btn = document.querySelector(`.side-tab[data-side="${side}"]`);
  if (!btn) return;
  btn.classList.add('is-on');
  btn.setAttribute('aria-pressed', 'true');
}

function setReportSide(side) {
  document.querySelectorAll('.side-tab').forEach(btn => {
    const on = btn.dataset.side === side;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function reportFindingOptions() {
  const blade = document.getElementById('report-blade')?.value || STATE.selectedBlade || 'A';
  const turbine = STATE.db?.turbines?.find(t => t.id === reportTurbineId()) || STATE.db?.turbines?.[0];
  if (!turbine) return [];
  if (isG97Turbine(turbine)) {
    const sides = selectedReportSides();
    return findingsForBlade(blade).filter(row => sides.includes(row.surface));
  }
  return (STATE.db.defects || [])
    .filter(d => d.assetId === turbine.id && String(d.blade) === String(blade))
    .map(d => ({ id: d.id, index: 0, cat: d.severity, finding: d.type, demo: true }));
}

function fillReportDefects(selectId) {
  const sel = document.getElementById('report-defect');
  if (!sel) return;
  const rows = reportFindingOptions();
  sel.innerHTML = rows.length
    ? rows.map(row => {
        const station = row.index ? `P${String(row.index).padStart(2, '0')} · ` : '';
        return `<option value="${escHtml(row.id)}">${station}CAT ${row.cat} · ${escHtml(row.finding)}</option>`;
      }).join('')
    : '<option value="">No defects for this selection</option>';
  if (selectId && rows.some(row => row.id === selectId)) sel.value = selectId;
  else if (rows[0]) sel.value = rows[0].id;
}

function sideWithFindings(blade, side) {
  const rows = findingsForBlade(blade);
  if (rows.some(row => row.surface === side)) return side;
  return ['PS', 'SS', 'LE', 'TE'].find(name => rows.some(row => row.surface === name)) || side;
}

function clearReportViewer(blade, side) {
  STATE.activeDefect = null;
  STATE.reviewFindingId = null;
  const title = document.getElementById('report-viewer-title');
  if (title) title.textContent = `${bladeDisplayName(blade)} · ${side}`;
  const rgb = document.getElementById('img-rgb');
  const empty = document.getElementById('viewer-empty');
  const photos = [];
  for (let index = 1; index <= 20; index += 1) {
    const found = g97StationCandidates(blade, side, index);
    [0, 1, 6, 7].forEach(slot => { if (found[slot]) photos.push(found[slot]); });
  }
  if (rgb) {
    rgb.onerror = null;
    if (photos.length) {
      rgb.hidden = false;
      if (empty) empty.hidden = true;
      useFirstExistingImage(rgb, photos, () => {
        rgb.hidden = true;
        rgb.removeAttribute('src');
        if (empty) {
          empty.hidden = false;
          empty.textContent = `No station photo for ${bladeDisplayName(blade)} ${side}.`;
        }
      });
    } else {
      rgb.hidden = true;
      rgb.removeAttribute('src');
      if (empty) {
        empty.hidden = false;
        empty.textContent = `No defects recorded for ${bladeDisplayName(blade)} ${side}.`;
      }
    }
  }
}

function applyReportDefect() {
  const bladeNow = document.getElementById('report-blade')?.value || STATE.selectedBlade || 'A';
  const sides = selectedReportSides();
  const rows = findingsForBlade(bladeNow).filter(row => sides.includes(row.surface));
  const currentId = STATE.reviewFindingId || STATE.activeDefect?.findingId;
  const match = rows.find(row => row.id === currentId) || rows[0];
  STATE.selectedTurbineId = reportTurbineId();
  STATE.selectedBlade = bladeNow;
  STATE.selectedPart = 'blade-' + bladeNow;
  STATE.pocSurface = match?.surface || sides[0] || 'PS';
  if (!match) {
    STATE.reviewFindingId = null;
    STATE.activeDefect = null;
    clearReportViewer(bladeNow, sides.join(' · '));
    syncReportOverride(null);
    return;
  }
  STATE.reviewFindingId = match.id;
  openFindingDetails();
}

function openReportForSelection() {
  const picker = document.getElementById('report-turbine');
  if (!picker?.dataset.bound) {
    if (STATE.activeDefect) renderReport();
    return;
  }
  const blade = document.getElementById('report-blade')?.value || STATE.selectedBlade || 'A';
  const defectBlade = STATE.activeDefect?.blade;
  if (STATE.activeDefect && (!defectBlade || defectBlade === blade)) renderReport();
  else applyReportDefect();
}

function syncReportPicker() {
  const turbineSel = document.getElementById('report-turbine');
  if (!turbineSel || !turbineSel.dataset.bound) return;
  const d = STATE.activeDefect;
  reportPickerLock = true;
  if (d?.assetId) turbineSel.value = String(d.assetId);
  const raw = d?.findingId ? rawFinding(d.findingId) : null;
  const bladeSel = document.getElementById('report-blade');
  if (bladeSel) bladeSel.value = raw?.blade || d?.blade || bladeSel.value;
  if (raw?.surface) ensureReportSide(raw.surface);
  fillReportDefects(raw?.id || d?.id);
  reportPickerLock = false;
}

function initReportPicker() {
  const turbineSel = document.getElementById('report-turbine');
  if (!turbineSel || turbineSel.dataset.bound) return;
  turbineSel.dataset.bound = '1';
  turbineSel.innerHTML = (STATE.db?.turbines || []).map(t =>
    `<option value="${t.id}" ${isDetailedAssetAvailable(t) ? '' : 'disabled'}>${escHtml(turbineLabel(t))}${isDetailedAssetAvailable(t) ? '' : ' — Will be updated soon'}</option>`
  ).join('');
  if (STATE.selectedTurbineId) turbineSel.value = String(STATE.selectedTurbineId);
  refreshBladeMenus(STATE.db?.turbines?.find(item => item.id === reportTurbineId()));
  const bladeSel = document.getElementById('report-blade');
  if (bladeSel && STATE.selectedBlade) bladeSel.value = STATE.selectedBlade;
  setReportSide(STATE.pocSurface || currentReportSide());
  fillDefectClassSelect(document.getElementById('report-review-name'), '');
  fillReportDefects(STATE.activeDefect?.findingId || STATE.activeDefect?.id);
  const onFilter = (keepSide) => {
    if (reportPickerLock) return;
    STATE.selectedTurbineId = reportTurbineId();
    refreshBladeMenus(STATE.db?.turbines?.find(item => item.id === STATE.selectedTurbineId));
    const blade = bladeSel?.value || STATE.selectedBlade || 'A';
    STATE.selectedBlade = blade;
    STATE.selectedPart = 'blade-' + blade;
    if (!keepSide) {
      const sides = selectedReportSides();
      const has = sides.some(side => findingsForBlade(blade).some(row => row.surface === side));
      if (!has) setReportSide(sideWithFindings(blade, sides[0]));
    }
    STATE.pocSurface = currentReportSide();
    fillReportDefects();
    applyReportDefect();
  };
  turbineSel.addEventListener('change', () => {
    const selected = STATE.db?.turbines?.find(item => item.id === Number(turbineSel.value));
    if (!isDetailedAssetAvailable(selected)) {
      showAssetComingSoon(selected);
      turbineSel.value = String(STATE.db?.turbines?.find(isDetailedAssetAvailable)?.id ?? STATE.selectedTurbineId);
      return;
    }
    onFilter(false);
  });
  bladeSel?.addEventListener('change', () => onFilter(false));
  document.querySelectorAll('.side-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (reportPickerLock) return;
      const turningOff = btn.classList.contains('is-on');
      if (turningOff && selectedReportSides().length <= 1) return;
      btn.classList.toggle('is-on');
      btn.setAttribute('aria-pressed', btn.classList.contains('is-on') ? 'true' : 'false');
      onFilter(true);
    });
  });
  document.getElementById('report-defect')?.addEventListener('change', () => {
    if (!reportPickerLock) applyReportDefect();
  });
  if (STATE.activeDefect) syncReportPicker();
  else if (document.getElementById('view-report')?.classList.contains('active')) applyReportDefect();
}

function clearCompareHost() {
  const host = document.getElementById('asset-compare-host');
  if (host) host.replaceChildren();
}

function parkCompareView() {
  const host = document.getElementById('asset-compare-host');
  const compare = document.querySelector('#blade-schematic-default .compare-view');
  if (!host || !compare) return;
  host.replaceChildren(compare);
  updateFindingsSheetMeta();
}

function initSidebarCollapse() {
  document.getElementById('app-wrap')?.classList.remove('sidebar-collapsed');
}

function initProfileMenu() {
  const menu = document.getElementById('profile-menu');
  const btn = document.getElementById('profile-trigger');
  const panel = document.getElementById('profile-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', (event) => {
    if (menu && !menu.contains(event.target)) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function initAssetSheet() {
  const sheet = document.getElementById('asset-bottom-sheet');
  const btn = document.getElementById('asset-sheet-toggle');
  if (!sheet || !btn) return;
  const heightInput = document.getElementById('asset-sheet-height');
  const heightOutput = document.getElementById('asset-sheet-height-value');
  const applyHeight = value => {
    const height = Math.max(32, Math.min(78, Math.round(Number(value) || 58)));
    sheet.style.setProperty('--asset-findings-height', `${height}vh`);
    if (heightInput) heightInput.value = String(height);
    if (heightOutput) heightOutput.value = `${height}%`;
  };
  let savedHeight = 58;
  try { savedHeight = localStorage.getItem('compliq_findings_height') || savedHeight; } catch (_) { /* storage can be disabled */ }
  applyHeight(savedHeight);
  heightInput?.addEventListener('input', () => {
    applyHeight(heightInput.value);
    try { localStorage.setItem('compliq_findings_height', heightInput.value); } catch (_) { /* keep the current session usable */ }
  });
  btn.addEventListener('click', () => {
    const open = sheet.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    updateFindingsSheetMeta();
  });
  document.addEventListener('pointerdown', event => {
    if (!sheet.classList.contains('is-open') || sheet.contains(event.target)) return;
    sheet.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    updateFindingsSheetMeta();
  });
  updateFindingsSheetMeta();
}

function findingsForStation(blade, surface, index) {
  return findingsForBlade(blade).filter(row => row.surface === surface && row.index === index);
}

function worstFinding(rows) {
  return rows.slice().sort(compareFindings)[0] || null;
}

function dotFinding(rows) {
  return rows.slice().sort(compareFindings)[0] || null;
}

function findingPriority(row) {
  if (row.cat >= DOT_MIN_CAT) return 'Critical';
  return 'Low';
}

function focusCriticalFinding(blade) {
  if (STATE.criticalOpenedFor === blade) return;
  const pool = findingsForBlade(blade);
  const critical = pool.filter(row => row.cat >= DOT_MIN_CAT);
  const top = (critical.length ? critical : pool).slice().sort(compareFindings)[0];
  if (top) {
    STATE.pocSurface = top.surface;
    STATE.pocPointIndex = top.index;
    STATE.pocSelectedDefectId = top.id;
  }
  STATE.criticalOpenedFor = blade;
}

function bindFindingTable(tbody) {
  if (!tbody || tbody.dataset.findingBound) return;
  tbody.addEventListener('click', event => {
    const tr = event.target.closest('tr[data-surface]');
    if (!tr || !tbody.contains(tr)) return;
    if (event.target.closest('.review-btn')) {
      openDefectReview(tr.dataset.findingId);
      return;
    }
    selectAssetPocPoint(tr.dataset.surface, Number(tr.dataset.point), tr.dataset.findingId);
  });
  tbody.dataset.findingBound = '1';
}

function buildPocPoints(turbine) {
  const span = bladeSpanM(turbine);
  const blade = activeBladeLetter();
  const points = [];
  POC_SURFACES.forEach(surface => {
    for (let i = 1; i <= 20; i++) {
      const metres = +pointMetres(i, span).toFixed(2);
      const pctVal = Math.round((metres / span) * 100);
      const legacy = blade === 'A' && surface === 'PS' ? POC_STATION_MEDIA[i] : null;
      const stationFindings = findingsForStation(blade, surface, i);
      const marked = dotFinding(stationFindings);
      const worst = worstFinding(stationFindings);
      const stationCandidates = g97StationCandidates(blade, surface, i);
      const stationImage = stationCandidates[0] || null;
      points.push({
        key: surface + '-' + i,
        blade,
        surface,
        pointIndex: i,
        point: 'P' + String(i).padStart(2, '0'),
        metres,
        span,
        pct: pctVal + '%',
        x: surfaceXPct(surface),
        y: +pointYPct(i, span).toFixed(2),
        flagged: !!marked,
        critical: !!marked,
        severity: marked?.cat || 0,
        color: marked?.color || 'transparent',
        defectLabel: worst ? stationFindings.map(row => `${row.finding} · CAT ${row.cat}`).join(' | ') : '',
        short: legacy?.short || (surface + ' station'),
        station: legacy?.station || (pctVal + '% ' + surface + ' · root/hub → tip'),
        stationImage,
        stationCandidates,
        annotated: stationImage || legacy?.annotated || null,
        legacyAnnotated: legacy?.annotated || null,
        annotationImage: legacy?.annotationImage || null
      });
    }
  });
  return points;
}

function getSelectedPocPoint(turbine) {
  const points = buildPocPoints(turbine);
  return points.find(p => p.surface === STATE.pocSurface && p.pointIndex === STATE.pocPointIndex)
    || points.find(p => p.surface === 'PS' && p.pointIndex === 5)
    || points[0];
}

function formatRadial(pt, turbine) {
  const span = bladeSpanM(turbine);
  return pt.metres.toFixed(1) + ' m / ' + span + ' m (' + pt.pct + ')';
}

function defectSizeFromBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length < 4) return '—';
  const w = Math.abs(bbox[2] - bbox[0]);
  const h = Math.abs(bbox[3] - bbox[1]);
  const area = w * h * 100;
  return Math.round(w * 100) + '×' + Math.round(h * 100) + '% frame (~' + area.toFixed(1) + '% area)';
}

async function loadBladePocAnnotations() {
  if (BLADE_POC.ready) return BLADE_POC.annotations;
  try {
    const res = await fetch('Annotated%20Images/defect_annotations.json');
    if (!res.ok) throw new Error('Failed to load annotations');
    BLADE_POC.annotations = await res.json();
  } catch (err) {
    console.warn('Blade POC annotations unavailable:', err);
    BLADE_POC.annotations = [];
  }
  BLADE_POC.ready = true;
  return BLADE_POC.annotations;
}

function defectsForPocPoint(pt) {
  if (!pt?.annotationImage) return [];
  return BLADE_POC.annotations.filter(d => d.image === pt.annotationImage);
}

async function renderBladeAPocProfile(epoch = STATE.assetEpoch) {
  await loadBladePocAnnotations();
  await loadBladeFindings();
  if (STATE.activeTab !== 'asset' || epoch !== STATE.assetEpoch) return;
  const container = document.getElementById('blade-schematic');
  if (!container) return;
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const span = bladeSpanM(turbine);
  focusCriticalFinding(activeBladeLetter());
  const points = buildPocPoints(turbine);
  const showLegend = points.some(p => p.flagged);

  container.innerHTML = `
    <div class="asset-bp-wrap">
      <div class="asset-bp-meta">Gamesa G97 2 MW · <strong>${span} m</strong> · ${escHtml(bladeDisplayName(activeBladeLetter()))} · P1 root/hub → P20 tip · SS / LE / PS / TE</div>
      <div class="asset-bp-profile" id="asset-bp-profile">
        <div class="asset-bp-stage">
          <img src="${BLADE_POC.profileSrc}" alt="Blade profile ${span} m after annotation">
          <div class="asset-bp-hotspots">
            ${points.map(p => `
              <button type="button" class="asset-bp-hotspot ${p.flagged ? 'has-finding' : ''} ${p.critical ? 'critical' : ''} ${p.surface === STATE.pocSurface && p.pointIndex === STATE.pocPointIndex ? 'active' : ''}"
                data-surface="${p.surface}" data-point="${p.pointIndex}"
                aria-label="${p.surface} ${p.point}${p.defectLabel ? ' ' + p.defectLabel : ''}"
                title="${p.surface} ${p.point} · ${formatRadial(p, turbine)}${p.defectLabel ? ' · ' + p.defectLabel : ''}"
                style="left:${p.x}%;top:${p.y}%;${p.flagged ? '--finding:' + p.color + ';' : ''}"></button>
            `).join('')}
          </div>
        </div>
        ${showLegend ? `
          <div class="finding-legend">
            <span><i style="background:${FINDING_COLOR[1]}"></i>CAT 1</span>
            <span><i style="background:${FINDING_COLOR[2]}"></i>CAT 2</span>
            <span><i style="background:${FINDING_COLOR[3]}"></i>CAT 3+</span>
          </div>` : ''}
      </div>
    </div>
  `;

  const spanLabel = document.getElementById('asset-poc-span-label');
  if (spanLabel) spanLabel.textContent = span + ' m';

  container.querySelectorAll('.asset-bp-hotspot').forEach(btn => {
    btn.addEventListener('click', () => selectAssetPocPoint(btn.dataset.surface, Number(btn.dataset.point)));
  });

  bindProfileStageFit(container);
  bindAnnotatedViewerControls();
  selectAssetPocPoint(STATE.pocSurface, STATE.pocPointIndex, STATE.pocSelectedDefectId);
}

function bindProfileStageFit(root) {
  disconnectProfileFit();
  const box = root.querySelector('.asset-bp-profile');
  const stage = root.querySelector('.asset-bp-stage');
  const img = stage?.querySelector('img');
  const panel = box?.closest('.asset-poc-profile-panel');
  const workspace = panel?.closest('.asset-poc-workspace');
  if (!box || !stage || !img) return;

  const fit = () => {
    if (STATE.activeTab !== 'asset' || !img.isConnected) return;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const ar = img.naturalWidth / img.naturalHeight;
    stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;

    if (panel) {
      const view = document.getElementById('view-asset');
      const hostW = view?.clientWidth || workspace?.clientWidth || 0;
      const imageH = Math.max(140, box.clientHeight - 8);
      let colW = Math.round(imageH * ar) + 8;
      const share = hostW < 760 ? 0.46 : 0.38;
      const maxW = Math.max(120, Math.floor(hostW * share));
      if (colW > maxW) colW = maxW;
      const next = colW + 'px';
      if (panel.style.width !== next) panel.style.width = next;
    }

    const bw = box.clientWidth;
    const bh = box.clientHeight;
    if (!bw || !bh) return;
    let w = bw;
    let h = Math.round(w / ar);
    if (h > bh) {
      h = bh;
      w = Math.round(h * ar);
    }
    if (w > bw) w = bw;
    if (h > bh) h = bh;
    const nextW = w + 'px';
    const nextH = h + 'px';
    if (stage.style.width !== nextW) stage.style.width = nextW;
    if (stage.style.height !== nextH) stage.style.height = nextH;
  };

  const scheduleFit = () => {
    if (_profileFitRaf) return;
    _profileFitRaf = requestAnimationFrame(() => {
      _profileFitRaf = 0;
      fit();
    });
  };

  if (img.complete && img.naturalWidth) scheduleFit();
  else img.addEventListener('load', scheduleFit, { once: true });

  if (typeof ResizeObserver !== 'undefined') {
    // Observe only the profile box — observing view/workspace while fit()
    // mutates panel width caused resize loops that froze navigation.
    _profileFitRO = new ResizeObserver(scheduleFit);
    _profileFitRO.observe(box);
  } else {
    window.addEventListener('resize', scheduleFit);
  }
}

function selectAssetPocPoint(surface, pointIndex, findingId) {
  STATE.pocSurface = surface || 'PS';
  STATE.pocPointIndex = pointIndex || 5;
  STATE.pocMode = true;
  STATE.pocSelectedDefectId = findingId || null;

  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const pt = getSelectedPocPoint(turbine);

  document.querySelectorAll('.asset-bp-hotspot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.surface === pt.surface && Number(btn.dataset.point) === pt.pointIndex);
  });

  const annotated = document.getElementById('asset-poc-annotated');
  const label = document.getElementById('asset-poc-station-label');
  const viewport = document.getElementById('asset-poc-viewport');
  const src = pt.stationImage || pt.legacyAnnotated || pt.annotated;

  if (src) {
    if (viewport) viewport.classList.remove('empty');
    if (annotated) {
      annotated.style.display = '';
      annotated.dataset.fallback = '0';
      annotated.onload = () => {
        fitAnnotatedImage();
        renderPocBboxOverlay(pt, turbine);
      };
      const candidates = (pt.stationCandidates && pt.stationCandidates.length)
        ? pt.stationCandidates.slice()
        : [src];
      let candidateIndex = 0;
      annotated.onerror = () => {
        candidateIndex += 1;
        if (candidateIndex < candidates.length) {
          annotated.src = encodeURI(candidates[candidateIndex]);
          return;
        }
        if (pt.legacyAnnotated && annotated.dataset.fallback !== '1' && !candidates.includes(pt.legacyAnnotated)) {
          annotated.dataset.fallback = '1';
          annotated.src = encodeURI(pt.legacyAnnotated);
          return;
        }
        annotated.style.display = 'none';
        if (viewport) viewport.classList.add('empty');
        if (label) label.textContent = pt.surface + ' ' + pt.point + ' · ' + formatRadial(pt, turbine) + ' — station image missing';
        clearPocBboxOverlay();
      };
      annotated.src = encodeURI(candidates[0]);
      annotated.alt = pt.surface + ' ' + pt.point + ' ' + pt.station;
      if (annotated.complete && annotated.naturalWidth) {
        fitAnnotatedImage();
        renderPocBboxOverlay(pt, turbine);
      }
    }
    if (label) label.textContent = pt.blade + ' · ' + pt.surface + ' ' + pt.point + ' · ' + formatRadial(pt, turbine);
  } else {
    if (annotated) {
      annotated.removeAttribute('src');
      annotated.style.display = 'none';
    }
    if (viewport) viewport.classList.add('empty');
    if (label) label.textContent = pt.surface + ' ' + pt.point + ' · ' + formatRadial(pt, turbine) + ' — no station image yet';
    clearPocBboxOverlay();
  }

  renderDefectsTable(turbine);
}

function clearPocBboxOverlay() {
  const svg = document.getElementById('asset-poc-bbox-overlay');
  const callout = document.getElementById('asset-poc-defect-callout');
  if (svg) {
    svg.innerHTML = '';
    svg.classList.remove('isolating');
  }
  if (callout) {
    callout.hidden = true;
    callout.innerHTML = '';
  }
}

function renderPocBboxOverlay(pt, turbine) {
  const svg = document.getElementById('asset-poc-bbox-overlay');
  const callout = document.getElementById('asset-poc-defect-callout');
  const img = document.getElementById('asset-poc-annotated');
  const stage = document.getElementById('asset-poc-stage');
  if (!svg || !img || !img.naturalWidth) return;
  if (!/Annotated(?:%20|\s)Images/i.test(img.src || '')) {
    clearPocBboxOverlay();
    return;
  }

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  if (stage) {
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
  }

  const selectedId = STATE.pocSelectedDefectId;
  const defects = defectsForPocPoint(pt);

  if (!selectedId) {
    // Overview: light outlines for all defects (pinpoint without hiding baked boxes)
    svg.classList.remove('isolating');
    svg.innerHTML = defects.map(d => {
      if (!Array.isArray(d.bbox_norm) || d.bbox_norm.length < 4) return '';
      const [x1, y1, x2, y2] = d.bbox_norm.map(Number);
      const X = x1 * w, Y = y1 * h, WW = (x2 - x1) * w, HH = (y2 - y1) * h;
      const col = DEFECT_SEV_COLOR[d.severity] || '#0FA4AF';
      const geo = defectRadialMetrics(pt, d, turbine);
      return `
        <g class="bbox-all" data-id="${d.id}" style="cursor:pointer" onclick="selectPocDefect('${d.id}')">
          <rect x="${X}" y="${Y}" width="${WW}" height="${HH}" fill="transparent"
            stroke="${col}" stroke-width="${Math.max(2, w * 0.0025)}" opacity="0.85"/>
          <circle cx="${geo.pin.cx * w}" cy="${geo.pin.cy * h}" r="${Math.max(4, w * 0.006)}"
            fill="${col}" stroke="#041018" stroke-width="1.5"/>
        </g>`;
    }).join('');
    if (callout) { callout.hidden = true; callout.innerHTML = ''; }
    return;
  }

  const d = defects.find(x => x.id === selectedId);
  if (!d || !Array.isArray(d.bbox_norm)) {
    clearPocBboxOverlay();
    return;
  }

  const [x1, y1, x2, y2] = d.bbox_norm.map(Number);
  const X = x1 * w, Y = y1 * h, X2 = x2 * w, Y2 = y2 * h;
  const pad = Math.max(6, w * 0.008);
  const col = DEFECT_SEV_COLOR[d.severity] || '#0FA4AF';
  const geo = defectRadialMetrics(pt, d, turbine);
  const stroke = Math.max(3, w * 0.0035);

  svg.classList.add('isolating');
  // Dim whole frame except selected cutout — hides other baked boxes
  svg.innerHTML = `
    <path class="bbox-dim" fill="rgba(4,12,16,0.78)" fill-rule="evenodd"
      d="M0 0 H${w} V${h} H0 Z
         M${X - pad} ${Y - pad} H${X2 + pad} V${Y2 + pad} H${X - pad} Z"/>
    <rect x="${X}" y="${Y}" width="${X2 - X}" height="${Y2 - Y}"
      fill="none" stroke="${col}" stroke-width="${stroke}" class="bbox-focus"/>
    <circle cx="${geo.pin.cx * w}" cy="${geo.pin.cy * h}" r="${Math.max(6, w * 0.008)}"
      fill="${col}" stroke="#fff" stroke-width="2">
      <animate attributeName="r" values="${Math.max(5, w * 0.007)};${Math.max(9, w * 0.012)};${Math.max(5, w * 0.007)}"
        dur="1.4s" repeatCount="indefinite"/>
    </circle>
    <text x="${X}" y="${Math.max(16, Y - 10)}" fill="${col}" font-family="JetBrains Mono,monospace"
      font-size="${Math.max(12, w * 0.018)}" font-weight="700">${pt.point}-${d.id} · ${geo.distRoot}</text>
  `;

  if (callout) {
    callout.hidden = false;
    callout.innerHTML = `
      <strong>${pt.point}-${d.id}</strong>
      <span>${d.defect_class}</span>
      <span>S${d.severity} · ${d.severity_label || priorityFromSeverity(d.severity)}</span>
      <span>${geo.radial}</span>
      <span>${geo.location}</span>
      <button type="button" class="callout-clear" onclick="selectPocDefect('${d.id}')">Show all</button>
    `;
  }
}

function focusPocDefectInView(pt, turbine) {
  const img = document.getElementById('asset-poc-annotated');
  const viewport = document.getElementById('asset-poc-viewport');
  const d = defectsForPocPoint(pt).find(x => x.id === STATE.pocSelectedDefectId);
  if (!d || !img?.naturalWidth || !viewport) {
    renderPocBboxOverlay(pt, turbine);
    return;
  }
  const geo = defectRadialMetrics(pt, d, turbine);
  const [x1, y1, x2, y2] = d.bbox_norm.map(Number);
  const bw = Math.max(0.04, x2 - x1);
  const bh = Math.max(0.04, y2 - y1);
  const fit = Math.min(
    (viewport.clientWidth * 0.7) / (bw * img.naturalWidth),
    (viewport.clientHeight * 0.7) / (bh * img.naturalHeight),
    ANNO_VIEW.max
  );
  ANNO_VIEW.scale = Math.max(ANNO_VIEW.min, Math.min(ANNO_VIEW.max, fit));
  // Stage is centered; translate so defect center moves toward viewport center
  const dx = (0.5 - geo.pin.cx) * img.naturalWidth * ANNO_VIEW.scale;
  const dy = (0.5 - geo.pin.cy) * img.naturalHeight * ANNO_VIEW.scale;
  ANNO_VIEW.tx = dx;
  ANNO_VIEW.ty = dy;
  if (window._applyAnnoZoom) window._applyAnnoZoom();
  renderPocBboxOverlay(pt, turbine);
}

function reviewPocDefect(surface, pointIndex, defectId) {
  STATE.pocSurface = surface || 'PS';
  STATE.pocPointIndex = Number(pointIndex) || 5;
  STATE.pocSelectedDefectId = defectId;
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const pt = getSelectedPocPoint(turbine);
  // Ensure station image is showing
  const annotated = document.getElementById('asset-poc-annotated');
  if (pt.annotated && annotated && !annotated.src.includes(encodeURI(pt.annotated).replace(/^\.\//, ''))) {
    selectAssetPocPoint(surface, pointIndex);
    STATE.pocSelectedDefectId = defectId;
  }
  renderDefectsTable(turbine);
  focusPocDefectInView(pt, turbine);
  const d = defectsForPocPoint(pt).find(x => x.id === defectId);
  if (d) {
    const geo = defectRadialMetrics(pt, d, turbine);
    showToast(`${pt.point}-${d.id}: ${d.defect_class} · ${geo.distRoot} from root · ${geo.location}`, 'success');
  }
}

function openBladeLightbox(src) {
  if (!src) return;
  const lightbox = document.getElementById('bp-lightbox');
  const img = document.getElementById('bp-lightbox-img');
  if (!lightbox || !img) return;
  img.src = src;
  lightbox.classList.add('open');
  if (!lightbox.dataset.bound) {
    const closeBtn = document.getElementById('bp-lightbox-close');
    closeBtn?.addEventListener('click', () => lightbox.classList.remove('open'));
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) lightbox.classList.remove('open');
    });
    lightbox.dataset.bound = '1';
  }
}

const ANNO_VIEW = { scale: 1, min: 0.25, max: 5, tx: 0, ty: 0, dragging: false, lx: 0, ly: 0, userZoom: false, pan: true };

function stepAssetPocPoint(delta) {
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const surface = STATE.pocSurface || 'PS';
  const points = buildPocPoints(turbine).filter(p => p.surface === surface && (p.stationImage || p.annotated));
  if (!points.length) return;
  let idx = points.findIndex(p => p.pointIndex === STATE.pocPointIndex);
  if (idx < 0) idx = delta > 0 ? 0 : points.length - 1;
  else idx = (idx + delta + points.length) % points.length;
  selectAssetPocPoint(points[idx].surface, points[idx].pointIndex);
}

function bindAnnotatedViewerControls() {
  const viewport = document.getElementById('asset-poc-viewport');
  const stage = document.getElementById('asset-poc-stage');
  const img = document.getElementById('asset-poc-annotated');
  if (!viewport || !img || viewport.dataset.bound) return;

  const apply = () => {
    const target = stage || img;
    target.style.transform = `translate(${ANNO_VIEW.tx}px, ${ANNO_VIEW.ty}px) scale(${ANNO_VIEW.scale})`;
    const lvl = document.getElementById('asset-zoom-level');
    if (lvl) lvl.textContent = `${Math.round(ANNO_VIEW.scale * 100)}%`;
  };

  window._applyAnnoZoom = apply;

  document.getElementById('asset-zoom-in')?.addEventListener('click', () => {
    ANNO_VIEW.userZoom = true;
    ANNO_VIEW.scale = Math.min(ANNO_VIEW.max, ANNO_VIEW.scale * 1.25);
    apply();
  });
  document.getElementById('asset-zoom-out')?.addEventListener('click', () => {
    ANNO_VIEW.userZoom = true;
    ANNO_VIEW.scale = Math.max(ANNO_VIEW.min, ANNO_VIEW.scale / 1.25);
    apply();
  });
  document.getElementById('asset-zoom-fit')?.addEventListener('click', () => fitAnnotatedImage());
  document.getElementById('asset-zoom-100')?.addEventListener('click', () => {
    ANNO_VIEW.userZoom = true;
    ANNO_VIEW.scale = 1;
    ANNO_VIEW.tx = 0;
    ANNO_VIEW.ty = 0;
    apply();
  });
  document.getElementById('asset-image-full')?.addEventListener('click', () => {
    const panel = document.querySelector('.asset-poc-preview-panel');
    const btn = document.getElementById('asset-image-full');
    if (!panel) return;
    const on = panel.classList.toggle('is-full');
    if (btn) {
      btn.textContent = on ? 'Exit' : 'Full';
      btn.title = on ? 'Exit full screen' : 'Full screen';
    }
    if (on) {
      const req = panel.requestFullscreen?.();
      if (req && typeof req.catch === 'function') req.catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
    requestAnimationFrame(() => fitAnnotatedImage());
  });

  document.getElementById('asset-poc-prev')?.addEventListener('click', () => stepAssetPocPoint(-1));
  document.getElementById('asset-poc-next')?.addEventListener('click', () => stepAssetPocPoint(1));

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    ANNO_VIEW.userZoom = true;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    ANNO_VIEW.scale = Math.min(ANNO_VIEW.max, Math.max(ANNO_VIEW.min, ANNO_VIEW.scale * factor));
    apply();
  }, { passive: false });

  viewport.classList.add('pan-on');
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !ANNO_VIEW.pan) return;
    if (e.target.closest('button, a, input, select, .asset-poc-defect-callout')) return;
    ANNO_VIEW.dragging = true;
    ANNO_VIEW.userZoom = true;
    ANNO_VIEW.lx = e.clientX;
    ANNO_VIEW.ly = e.clientY;
    try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
    viewport.classList.add('panning');
    e.preventDefault();
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!ANNO_VIEW.dragging) return;
    ANNO_VIEW.tx += e.clientX - ANNO_VIEW.lx;
    ANNO_VIEW.ty += e.clientY - ANNO_VIEW.ly;
    ANNO_VIEW.lx = e.clientX;
    ANNO_VIEW.ly = e.clientY;
    apply();
  });
  const endPan = (e) => {
    ANNO_VIEW.dragging = false;
    viewport.classList.remove('panning');
    try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
  };
  viewport.addEventListener('pointerup', endPan);
  viewport.addEventListener('pointercancel', endPan);

  img.addEventListener('dblclick', () => openBladeLightbox(img.src));

  viewport.dataset.bound = '1';
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!ANNO_VIEW.userZoom) fitAnnotatedImage();
    });
    ro.observe(viewport);
  }
  apply();
}

function fitAnnotatedImage() {
  const viewport = document.getElementById('asset-poc-viewport');
  const img = document.getElementById('asset-poc-annotated');
  if (!viewport || !img || !img.naturalWidth) {
    ANNO_VIEW.scale = 1;
    ANNO_VIEW.tx = 0;
    ANNO_VIEW.ty = 0;
    if (window._applyAnnoZoom) window._applyAnnoZoom();
    return;
  }
  const pad = 2;
  const availW = Math.max(40, viewport.clientWidth - pad);
  const availH = Math.max(40, viewport.clientHeight - pad);
  const fit = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
  ANNO_VIEW.userZoom = false;
  ANNO_VIEW.scale = fit;
  ANNO_VIEW.tx = 0;
  ANNO_VIEW.ty = 0;
  if (window._applyAnnoZoom) window._applyAnnoZoom();
}

// ══════════════════════════════════════════════════
// 19. MAIN INIT
// ══════════════════════════════════════════════════
function initApp() {
  STATE.db = loadDB();
  initBgCanvas();
  setupNav();
  document.getElementById('asset-back-overview')?.addEventListener('click', () => openAssetOverview());
  renderMetrics();
  renderFleetGrid();
  renderAssetList();
  renderNotifications();
  loadBladePocAnnotations();
  initSidebarCollapse();
  initProfileMenu();
  initAssetSheet();
  initDefectReview();

  // Start MQTT simulation
  loadBladeFindings().then(() => initReportPicker());
  setInterval(() => {
    // Randomly fluctuate wind speeds
    STATE.db.turbines.forEach(t => {
      t.windSpeed = Math.max(5, Math.min(20, t.windSpeed + (Math.random() - 0.5) * 0.5));
      t.windSpeed = parseFloat(t.windSpeed.toFixed(1));
    });
    renderMetrics();
  }, 8000);
}

// ── BOOT ──────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initTheme();
  bindSeverityAction('ig-sev', 'ig-action');
  bindSeverityAction('md-sev', 'md-action');
});

// ── CSV / EXCEL BULK UPLOAD ────────────────────
function handleCSVUpload(input, context) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const rows = text.split('\n').filter(r => r.trim());
    if (rows.length < 2) { showToast('CSV must have a header row + at least one data row', 'error'); return; }
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g,'_'));
    const data = rows.slice(1).map(row => {
      const vals = row.split(',');
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i]||'').trim().replace(/^"|"$/g,''); });
      return obj;
    }).filter(r => Object.values(r).some(v => v));

    if (context === 'ingest' && data.length > 0) {
      const first = data[0];
      if (first.turbine_id || first.turbine) {
        const sel = document.getElementById('ig-turbine');
        const match = STATE.db?.turbines?.find(t => t.assetId.toLowerCase() === (first.turbine_id||first.turbine||'').toLowerCase());
        if (match && sel) sel.value = match.id;
      }
      if (first.defect_type || first.type) {
        const defectSel = document.getElementById('ig-defect');
        const rawType = first.defect_type || first.type || '';
        if (defectSel) defectSel.value = matchDefectClass(rawType)?.name || rawType;
      }
      if (first.severity) document.getElementById('ig-sev') && (document.getElementById('ig-sev').value = first.severity||3);
      if (first.confidence) document.getElementById('ig-conf') && (document.getElementById('ig-conf').value = parseInt(first.confidence)||85);
      if (first.dist || first.distance) document.getElementById('ig-dist') && (document.getElementById('ig-dist').value = first.dist||first.distance||34);
      if (first.action) document.getElementById('ig-action') && (document.getElementById('ig-action').value = first.action||'');
      if (first.blade) document.getElementById('ig-blade') && (document.getElementById('ig-blade').value = first.blade||'A');
      const preview = document.getElementById('csv-preview');
      if (preview) preview.textContent = `✅ ${data.length} row(s) loaded from CSV. First row auto-filled above.`;
      showToast(`CSV loaded — ${data.length} records. First row auto-filled.`, 'success');
    }
    if (context === 'manual-turbine' && data.length > 0) {
      data.forEach(row => {
        const gps = (row.gps||row.location||'0,0').split(',');
        document.getElementById('mt-id') && (document.getElementById('mt-id').value = row.turbine_id||row.id||'');
        document.getElementById('mt-site') && (document.getElementById('mt-site').value = row.site||row.wind_farm||'');
        document.getElementById('mt-gps') && (document.getElementById('mt-gps').value = row.gps||`${gps[0]},${gps[1]}`||'');
        document.getElementById('mt-rotor') && (document.getElementById('mt-rotor').value = row.rotor_dia||row.rotor||126);
        document.getElementById('mt-hub') && (document.getElementById('mt-hub').value = row.hub_height||row.hub||90);
        if (document.getElementById('mt-blade-count')) {
          document.getElementById('mt-blade-count').value = row.blade_count || row.blades_count || row.number_of_blades || 3;
          syncBladeNumberFields();
          const listed = String(row.blade_numbers || row.blades || '').split(/[|;]/).map(part => part.trim()).filter(Boolean);
          ['a', 'b', 'c', 'd', 'e', 'f'].forEach((letter, index) => {
            const input = document.getElementById(`mt-blade-${index + 1}`);
            if (!input) return;
            input.value = row[`blade_${letter}`] || row[`blade_${letter}_number`] || listed[index] || '';
          });
        }
        document.getElementById('mt-power') && (document.getElementById('mt-power').value = row.rated_power||row.power||2.5);
        document.getElementById('mt-mfr') && (document.getElementById('mt-mfr').value = row.manufacturer||row.mfr||'Vestas');
        document.getElementById('mt-model') && (document.getElementById('mt-model').value = row.model||'');
        document.getElementById('mt-year') && (document.getElementById('mt-year').value = row.year||row.commission_year||2022);
        document.getElementById('mt-wind') && (document.getElementById('mt-wind').value = row.wind_speed||12);
        document.getElementById('mt-rpm') && (document.getElementById('mt-rpm').value = row.rpm||14.5);
        document.getElementById('mt-health') && (document.getElementById('mt-health').value = row.health||97);
      });
      showToast(`CSV loaded — ${data.length} turbine record(s). First row auto-filled.`, 'success');
    }
  };
  // Handle both CSV (text) and basic XLSX detection
  if (file.name.endsWith('.csv')) {
    reader.readAsText(file);
  } else {
    showToast('For Excel files, please save as CSV first (File → Save As → CSV), then upload.', 'error');
    input.value = '';
  }
}

// ── THEME TOGGLE ──────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('site_theme') || 'dark';
  applyDashTheme(saved);

  const updateToggleLabels = (theme) => {
    const light = theme === 'light';
    const menuButton = document.getElementById('theme-toggle-dash');
    const visibleButton = document.getElementById('theme-toggle-visible');
    if (menuButton) {
      menuButton.textContent = light ? 'Dark mode' : 'Light mode';
      menuButton.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      menuButton.title = light ? 'Dark mode' : 'Light mode';
    }
    if (visibleButton) {
      visibleButton.innerHTML = `<span aria-hidden="true">${light ? '☾' : '☼'}</span>`;
      visibleButton.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      visibleButton.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    }
  };
  updateToggleLabels(saved);

  const toggleTheme = () => {
    const current = localStorage.getItem('site_theme') || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    localStorage.setItem('site_theme', next);
    applyDashTheme(next);
    updateToggleLabels(next);
  };
  [document.getElementById('theme-toggle-dash'), document.getElementById('theme-toggle-visible')]
    .filter(Boolean)
    .forEach(btn => btn.addEventListener('click', toggleTheme));
  window.addEventListener('storage', event => {
    if (event.key !== 'site_theme') return;
    const next = event.newValue === 'light' ? 'light' : 'dark';
    applyDashTheme(next);
    updateToggleLabels(next);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const analytics = document.getElementById('view-analytics');
      if (analytics?.classList.contains('active')) renderCharts();
    }, 180);
  });
}

function applyDashTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  if (TURBINE_3D?.scene && TURBINE_3D.THREE) {
    TURBINE_3D.scene.background.set(theme === 'light' ? 0xf2f6fb : 0x0b1d32);
  }
  // Refresh charts so tick/legend colours match the active theme
  const analytics = document.getElementById('view-analytics');
  if (analytics?.classList.contains('active') || (CHARTS.health || CHARTS.defects)) {
    renderCharts();
  }
}

function goHome() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) { const user = JSON.parse(raw); user.sector = user.sector || 'wind'; localStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
  } catch(e) {}
  window.location.href = 'index.html';
}

function switchDashboard(targetSector) {
  const raw = localStorage.getItem('compliq_session');
  if (!raw) { window.location.href = 'auth.html'; return; }
  const session = JSON.parse(raw);
  const targetKey = targetSector === 'solar' ? 'compliq_solar_session' : 'compliq_wind_session';
  const targetSession = localStorage.getItem(targetKey);
  if (targetSession) {
    // Already registered and logged in for this sector — switch directly
    const targetUser = JSON.parse(targetSession);
    localStorage.setItem('compliq_session', JSON.stringify({...targetUser, sector: targetSector}));
    window.location.href = targetSector === 'solar' ? 'solar-dashboard.html' : 'dashboard.html';
  } else {
    // Not registered for this sector yet
    showToast(`Register for the ${targetSector === 'solar' ? 'Solar Farm' : 'Wind Turbine'} dashboard first`, 'error');
    setTimeout(() => {
      window.location.href = `auth.html?tab=register&sector=${targetSector}`;
    }, 1800);
  }
}
