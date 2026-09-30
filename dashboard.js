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

function checkAuth() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) {
    document.getElementById('auth-gate').style.display = 'flex';
    document.getElementById('app-wrap').style.display = 'none';
  } else {
    document.getElementById('auth-gate').style.display = 'none';
    document.getElementById('app-wrap').style.display = 'flex';
    const user = JSON.parse(session);
    const initials = `${user.firstName?.[0] || 'O'}${user.lastName?.[0] || 'P'}`;
    document.getElementById('user-av').textContent = initials;
    document.getElementById('user-display-name').textContent = `${user.firstName || 'Operator'} ${user.lastName || ''}`.trim();
    document.getElementById('user-display-role').textContent = user.role || 'Fleet Operator';
    
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

function handleLogout() {
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
  
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

// ══════════════════════════════════════════════════
// 2. DATABASE / STATE STORE
// ══════════════════════════════════════════════════
const DB_KEY = 'reude_fleet_db';

const DEFAULT_TURBINES = [
  {
    id: 1, assetId: 'WTG-001', name: 'Gamesa G97 — Blade 5297',
    site: 'Muppandal Wind Farm', state: 'Tamil Nadu',
    gps: { lat: 8.3833, lng: 77.3292 }, location: 'Muppandal, Kanyakumari District, Tamil Nadu',
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
}

function migrateFleetDb(db) {
  if (!db?.turbines?.length) return;
  const t1 = db.turbines.find(t => t.id === 1);
  const template = DEFAULT_TURBINES[0];
  if (t1 && (t1.model !== template.model || t1.bladeLength !== template.bladeLength || t1.name !== template.name)) {
    Object.assign(t1, {
      name: template.name,
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
  selectedPart: 'blade-A',
  activeDefect: null,
  zoomLevel: 1,
  filterMode: 'all',
  manualRecords: [],
  pocStationId: 1,
  pocMode: false,
  pocSurface: 'PS',
  pocPointIndex: 5,
  pocSelectedDefectId: null
};

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

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById(`view-${tab}`).classList.add('active');
      const [title, sub] = PAGE_TITLES[tab] || ['Dashboard', ''];
      document.getElementById('page-title').textContent = title;
      document.getElementById('page-sub').textContent = sub;
      if (tab === 'analytics') renderCharts();
      if (tab === 'asset') renderAssetView();
      if (tab === 'manual') populateManualSelects();
      if (tab === 'ingest') populateIngestSelects();
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
  const highConf = db.defects.filter(d => d.confidence >= 0.85).length;
  const avgConf = db.defects.reduce((s,d) => s + d.confidence, 0) / Math.max(db.defects.length, 1);

  animateNumber('m-health', avgHealth.toFixed(1) + '%');
  document.getElementById('m-health-sub').textContent = `${db.turbines.filter(t=>t.status==='normal').length} nominal, ${db.turbines.filter(t=>t.status!=='normal').length} flagged`;
  animateNumber('m-anomalies', totalAnomalies);
  document.getElementById('m-anomalies-sub').textContent = `${db.defects.filter(d=>d.severity>=4).length} critical / high severity`;
  animateNumber('m-coverage', avgCoverage.toFixed(0) + '%');
  document.getElementById('m-cov-sub').textContent = `${db.turbines.length} assets monitored`;
  animateNumber('m-conf', (avgConf * 100).toFixed(0) + '%');
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
function renderFleetGrid() {
  const grid = document.getElementById('fleet-grid');
  grid.innerHTML = '';
  STATE.db.turbines.forEach(t => {
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
      STATE.selectedTurbineId = t.id;
      document.querySelectorAll('.turbine-node').forEach(n => n.classList.remove('active'));
      card.classList.add('active');
      navigateTo('asset');
    });
    grid.appendChild(card);
  });
}

function navigateTo(tab) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${tab}`).classList.add('active');
  const [title, sub] = PAGE_TITLES[tab] || ['Dashboard', ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-sub').textContent = sub;
  if (tab === 'asset') renderAssetView();
  if (tab === 'analytics') renderCharts();
  if (tab === 'manual') populateManualSelects();
  if (tab === 'ingest') populateIngestSelects();
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
      <div class="asset-thumb"><img src="images/turbine_teal.jpg" alt="${t.assetId}"></div>
      <div class="asset-name">
        <h4>${t.assetId} — ${t.name}</h4>
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
      <div style="font-size:0.7rem;color:var(--c-muted)">Last: ${t.lastInspection}<br>Cov: ${t.inspCoverage}%</div>
      <button class="view-btn" data-id="${t.id}">View Detail →</button>
    `;
    row.querySelector('.view-btn').addEventListener('click', () => {
      STATE.selectedTurbineId = t.id;
      navigateTo('asset');
    });
    row.addEventListener('click', (e) => {
      if (e.target.classList.contains('view-btn')) return;
      STATE.selectedTurbineId = t.id;
      navigateTo('asset');
    });
    list.appendChild(row);
  });
}

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
function renderAssetView() {
  populateTurbineSelector();
  const t = STATE.db.turbines.find(x => x.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  bindPartSelector(t);
  renderTurbineInfo(t);
  renderPartSchematic(t, STATE.selectedPart);
  renderDefectsTable(t);
}

function populateTurbineSelector() {
  const sel = document.getElementById('turbine-selector');
  sel.innerHTML = STATE.db.turbines.map(t =>
    `<option value="${t.id}" ${t.id === STATE.selectedTurbineId ? 'selected' : ''}>${t.assetId} — ${t.name} (${t.state})</option>`
  ).join('');
  sel.onchange = () => {
    STATE.selectedTurbineId = parseInt(sel.value);
    renderAssetView();
  };
}

function bindPartSelector(turbine) {
  const sel = document.getElementById('part-selector');
  if (!sel) return;
  sel.value = STATE.selectedPart;
  sel.onchange = () => {
    STATE.selectedPart = sel.value;
    if (sel.value.startsWith('blade-')) {
      STATE.selectedBlade = sel.value.replace('blade-', '');
    }
    renderPartSchematic(turbine, STATE.selectedPart);
    renderDefectsTable(turbine);
  };
}

function renderTurbineInfo(t) {
  const panel = document.getElementById('turbine-info-panel');
  const extra = document.getElementById('turbine-details-extra');
  const toggle = document.getElementById('turbine-details-toggle');
  const hClass = t.health >= 85 ? '#2ECC71' : t.health >= 65 ? '#F2C94C' : '#EB5757';

  const maker = (t.manufacturer || '').trim();
  const model = (t.model || '').trim();
  const modelText = maker && model.toLowerCase().includes(maker.split(' ').pop().toLowerCase())
    ? model
    : [maker, model].filter(Boolean).join(' ');

  panel.innerHTML = `
    <div class="turbine-basic-chip name">
      <small>Asset</small>
      <strong><span class="turbine-status-dot" style="background:${hClass};box-shadow:0 0 8px ${hClass}"></span>${t.assetId}</strong>
      <span>${t.name}</span>
    </div>
    <div class="turbine-basic-chip"><small>Site</small><strong>${t.site}</strong></div>
    <div class="turbine-basic-chip"><small>Model</small><strong>${modelText}</strong></div>
    <div class="turbine-basic-chip"><small>Rotor / Blade</small><strong>${t.rotorDia} m / ${t.bladeLength || (t.rotorDia/2).toFixed(1)} m</strong></div>
    <div class="turbine-basic-chip"><small>Power</small><strong>${t.power} MW</strong></div>
    <div class="turbine-basic-chip"><small>Health</small><strong style="color:${hClass}">${t.health}%</strong></div>
  `;

  if (extra) {
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
  }

  if (toggle && !toggle.dataset.bound) {
    toggle.addEventListener('click', () => {
      const open = extra && !extra.hidden;
      if (extra) extra.hidden = open;
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      toggle.textContent = open ? 'More details' : 'Hide details';
    });
    toggle.dataset.bound = '1';
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
  if (pdfBtn) {
    pdfBtn.textContent = '⬇ AI inspection report (PDF)';
  }
  STATE.pocMode = !!show;
}

async function renderPartSchematic(turbine, part) {
  const title = document.getElementById('schematic-title');
  const titleDefault = document.getElementById('schematic-title-default');
  const hint = document.getElementById('schematic-hint');
  const bladeLetter = part.startsWith('blade-') ? part.replace('blade-', '') : '';

  if (bladeLetter === 'A' || bladeLetter === 'B' || bladeLetter === 'C') {
    if (title) title.textContent = `Blade ${bladeLetter} — Profile (Gamesa G97 2 MW)`;
    if (hint) hint.textContent = 'Colored dots follow the defect category. Click a critical dot or a table row to open that station.';
    setPocEvidenceVisible(true);
    await renderBladeAPocProfile();
    return;
  }

  setPocEvidenceVisible(false);
  const container = document.getElementById('blade-schematic-default');
  if (part === 'full') {
    if (titleDefault) titleDefault.textContent = 'Full Turbine Overview';
    if (hint) hint.textContent = 'Click Blade A, B, or C on the rotor to open its 20-point profile';
    renderFullTurbineOverview(container);
    return;
  }

  if (part.startsWith('blade-')) {
    const blade = part.replace('blade-', '');
    if (titleDefault) titleDefault.textContent = `Blade ${blade} Schematic`;
    if (hint) hint.textContent = 'Click hotspots → Report Viewer';
    renderBlade(turbine, blade, container);
    return;
  }

  if (titleDefault) titleDefault.textContent = 'Component Schematic';
  if (hint) hint.textContent = 'Select a blade for inspection evidence';
  if (container) {
    container.innerHTML = `
      <div class="asset-part-placeholder">
        <strong>${part.replace(/-/g, ' ').toUpperCase()}</strong>
        <p>Select <em>Full Turbine Overview</em> or a blade to inspect the Gamesa G97 profile.</p>
      </div>`;
  }
}

function renderFullTurbineOverview(container) {
  if (!container) return;
  const hub = { x: 180, y: 168 };
  const bladePath = 'M180 168 C174 118 168 72 180 28 C192 72 186 118 180 168 Z';
  /* Letter Y: Blade A straight down, Blade B upper left, Blade C upper right. */
  const blades = [
    { id: 'A', rot: 180, color: '#0FA4AF', lx: 180, ly: 318 },
    { id: 'B', rot: 300, color: '#E08A3C', lx: 45, ly: 84 },
    { id: 'C', rot: 60, color: '#7EB6FF', lx: 315, ly: 84 }
  ];
  container.innerHTML = `
    <div class="turbine-overview">
      <p class="turbine-overview-lead">Gamesa G97 2 MW · Kayathar. All three blades are on this rotor. Click a blade to open its tapered 20-point profile (P1 root/hub to P20 tip) on SS, LE, PS, and TE.</p>
      <div class="turbine-single-card">
        <svg class="turbine-svg turbine-svg-single" viewBox="0 0 360 400" role="img" aria-label="Gamesa G97 rotor with Blade A, Blade B, and Blade C">
          <line x1="180" y1="180" x2="180" y2="372" stroke="#5a7882" stroke-width="10" stroke-linecap="round"/>
          <path d="M148 158 h64 l-10 26 h-44 z" fill="#123038" stroke="#0FA4AF" stroke-width="1.4"/>
          ${blades.map(b => `
            <g class="turbine-blade-hit" data-blade="${b.id}" tabindex="0" role="button" aria-label="Open Blade ${b.id}">
              <g transform="rotate(${b.rot} ${hub.x} ${hub.y})">
                <path class="blade-fill" d="${bladePath}" fill="${b.color}" stroke="${b.color}"/>
              </g>
              <circle cx="${b.lx}" cy="${b.ly + 6}" r="13" fill="${b.color}"/>
              <text class="turbine-blade-label" x="${b.lx}" y="${b.ly + 11}" text-anchor="middle">${b.id}</text>
            </g>`).join('')}
          <circle cx="${hub.x}" cy="${hub.y}" r="14" fill="#0e2430" stroke="#d7eef2" stroke-width="3" pointer-events="none"/>
        </svg>
      </div>
      <div class="blade-compare-wrap">
        <h4>Blade comparison</h4>
        <p>Two captures for each surface on Blade A, Blade B, and Blade C. Click an image to open that station on the profile. To update a station, put <strong>GAMESA_…_PS-01_annotated.jpg</strong> in that folder, or replace the <strong>.png</strong> with a <strong>.jpg</strong> of the same name. Short names <strong>P01_annotated.jpg</strong>, <strong>P01_corrected.png</strong>, and <strong>P01.jpg</strong> work too. Refresh the page after you save the file.</p>
        <div class="blade-compare-scroll">
          <table class="blade-compare">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Blade A</th>
                <th>Blade B</th>
                <th>Blade C</th>
              </tr>
            </thead>
            <tbody>
              ${POC_SURFACES.map(surface => `
                <tr>
                  <th>${surface}</th>
                  ${['A', 'B', 'C'].map(blade => `
                    <td>
                      <div class="blade-compare-shots">
                        ${COMPARE_SLOTS.map(slot => compareShotMarkup(blade, surface, slot)).join('')}
                      </div>
                    </td>`).join('')}
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
  const open = (letter) => selectOverviewBlade(letter);
  container.querySelectorAll('.turbine-blade-hit').forEach(node => {
    node.addEventListener('click', () => open(node.dataset.blade));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(node.dataset.blade);
      }
    });
  });
  container.querySelectorAll('.blade-compare-shot').forEach(btn => {
    btn.addEventListener('click', () => openCompareShot(btn.dataset.blade, btn.dataset.surface, btn.dataset.point));
    const img = btn.querySelector('img');
    if (!img) return;
    const candidates = g97StationCandidates(btn.dataset.blade, btn.dataset.surface, Number(btn.dataset.point));
    useFirstExistingImage(img, candidates, () => {
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'compare-pending', textContent: 'Add image' }));
    });
  });
}

function compareShotMarkup(blade, surface, slot) {
  const candidates = g97StationCandidates(blade, surface, slot.pointIndex);
  const defect = stationDefect(blade, surface, slot.pointIndex);
  const finding = defect ? `<em>${defect.label}</em>` : '';
  const media = candidates.length
    ? `<img alt="Blade ${blade} ${surface} ${slot.label}">`
    : `<span class="compare-pending">Add image</span>`;
  return `
    <button type="button" class="blade-compare-shot" data-blade="${blade}" data-surface="${surface}" data-point="${slot.pointIndex}">
      ${media}
      <span class="compare-caption"><strong>${slot.label}</strong>${finding}</span>
    </button>`;
}

function openCompareShot(blade, surface, pointIndex) {
  STATE.pocSurface = surface;
  STATE.pocPointIndex = Number(pointIndex);
  selectOverviewBlade(blade);
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
    const findings = findingsForBlade(blade);
    if (!BLADE_FINDINGS.ready) {
      fill(tbody, `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">Loading defect categories…</td></tr>`);
      loadBladeFindings().then(() => {
        if (STATE.pocMode) renderDefectsTable(turbine);
      });
      return;
    }
    if (findings.length) {
      const pt = getSelectedPocPoint(turbine);
      const span = bladeSpanM(turbine);
      const html = findings.map(d => {
        const metres = pointMetres(d.index, span);
        const pct = Math.round((metres / span) * 100);
        const prio = findingPriority(d);
        const onStation = d.surface === pt.surface && d.index === pt.pointIndex;
        const isSel = STATE.pocSelectedDefectId ? STATE.pocSelectedDefectId === d.id : onStation;
        const point = 'P' + String(d.index).padStart(2, '0');
        const code = (d.finding.match(/^C\d+/) || [point])[0];
        return `
        <tr class="defect-row ${d.cat >= DOT_MIN_CAT ? 'is-critical' : ''} ${isSel ? 'is-selected' : ''}"
          data-surface="${d.surface}" data-point="${d.index}" data-finding-id="${escHtml(d.id)}" tabindex="0">
          <td data-col="id"><span style="font-family:var(--font-mono);font-size:0.73rem;color:${d.color}">${escHtml(d.surface)}-${point}-${escHtml(code)}</span></td>
          <td data-col="surface">${escHtml(d.surface)}</td>
          <td data-col="radial"><span style="font-family:var(--font-mono);font-size:0.72rem">${metres.toFixed(1)} m / ${span} m (${pct}%)</span></td>
          <td data-col="dist"><span style="font-family:var(--font-mono);font-size:0.72rem">${metres.toFixed(1)} m</span></td>
          <td data-col="location" style="font-size:0.75rem">${escHtml(d.surface)} · ${point}</td>
          <td data-col="type"><span class="radial-swatch" style="background:${d.color}"></span> ${escHtml(d.finding)}</td>
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
      return;
    }
    const pt = getSelectedPocPoint(turbine);
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
        <td><span style="font-family:var(--font-mono);font-size:0.72rem">${geo.radial}</span></td>
        <td><span style="font-family:var(--font-mono);font-size:0.72rem">${geo.distRoot}</span></td>
        <td style="font-size:0.75rem">${geo.location}</td>
        <td>${d.defect_class}</td>
        <td><span class="sev-pill sev-${d.severity}">${intensity}</span></td>
        <td style="font-size:0.72rem;max-width:160px;">${size}</td>
        <td><span class="prio-pill prio-${prio.toLowerCase()}">${prio}</span></td>
        <td><span class="stat-dot-pill pending">Pending</span></td>
        <td><button class="review-btn" onclick="event.stopPropagation();reviewPocDefect('${pt.surface}',${pt.pointIndex},'${d.id}')">Review</button></td>
      </tr>`;
    }).join('') || `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">${pt.stationImage ? `Station ${pt.surface} ${pt.point} is linked (${formatRadial(pt, turbine)}). No boxed defects on this capture.` : `No station image for ${pt.surface} ${pt.point} (${formatRadial(pt, turbine)}).`}</td></tr>`;
    fill(tbody, html);
    renderPocBboxOverlay(pt, turbine);
    return;
  }

  const defects = turbine
    ? STATE.db.defects.filter(d => d.assetId === turbine.id && d.blade === STATE.selectedBlade)
    : STATE.db.defects;
  const html = defects.map(d => `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:0.73rem;color:var(--c-teal)">${d.id}</span></td>
      <td>Blade ${d.blade}</td>
      <td><span style="font-family:var(--font-mono);font-size:0.72rem">${d.radialPos || (d.dist + ' m')}</span></td>
      <td><span style="font-family:var(--font-mono);font-size:0.72rem">${d.dist} m</span></td>
      <td style="font-size:0.75rem">${d.location || ('Blade ' + d.blade)}</td>
      <td>${d.type}</td>
      <td><span class="sev-pill sev-${d.severity}">${d.intensity || ('SEV-' + d.severity)}</span></td>
      <td style="font-size:0.72rem">${d.size || '—'}</td>
      <td><span class="prio-pill prio-${d.priority.toLowerCase()}">${d.priority}</span></td>
      <td><span class="stat-dot-pill ${d.status.toLowerCase()}">${d.status}</span></td>
      <td><button class="review-btn" onclick="openReport('${d.id}')">Review</button></td>
    </tr>
  `).join('') || `<tr><td colspan="11" style="text-align:center;padding:14px;color:var(--c-muted)">No defects recorded for Blade ${STATE.selectedBlade}</td></tr>`;
  fill(tbodyAlt, html);
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
  document.getElementById('report-viewer-title').textContent = `${d.id} — ${d.type} on ${turbine?.assetId} Blade ${d.blade}`;
  document.getElementById('provenance-tag').textContent = `Campaign: ${d.campaign} | ${d.method} | ${turbine?.manufacturer} ${turbine?.model}`;

  const rgb = document.getElementById('img-rgb');
  if (rgb && d.stationImage) rgb.src = d.stationImage;

  const badge = document.getElementById('report-priority-badge');
  badge.textContent = d.priority;
  badge.className = `priority-badge ${d.priority}`;

  // Draw bounding box overlay
  const svg = document.getElementById('overlay-svg');
  svg.innerHTML = `
    <rect x="15%" y="20%" width="50%" height="60%" fill="none"
      stroke="${d.severity >= 4 ? '#EB5757' : d.severity >= 3 ? '#F2C94C' : '#0FA4AF'}"
      stroke-width="2.5" stroke-dasharray="8,4" opacity="0.85"/>
    <text x="16%" y="19%" font-family="JetBrains Mono,monospace" font-size="11"
      fill="${d.severity >= 4 ? '#EB5757' : '#F2C94C'}">${d.type} | SEV-${d.severity} | ${(d.confidence*100).toFixed(0)}%</text>
    <circle cx="38%" cy="50%" r="6" fill="rgba(235,87,87,0.6)" opacity="0.8">
      <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite"/>
    </circle>
  `;

  const editor = d.findingId ? `
    <div class="assess-section defect-report-editor">
      <h4>Manual override</h4>
      <label>Category
        <select id="report-review-cat" class="styled-select">
          ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${Number(d.severity) === n ? 'selected' : ''}>CAT ${n}</option>`).join('')}
        </select>
      </label>
      <label>Defect name
        <input id="report-review-name" class="styled-input" type="text" maxlength="120" value="${escHtml(d.type)}">
      </label>
      <div class="defect-review-actions" style="margin-top:8px">
        <button type="button" class="teal-btn" onclick="saveReportFindingOverride()">Save override</button>
        <button type="button" class="review-btn" onclick="resetDefectOverride()">Reset</button>
      </div>
      <h4 style="margin-top:14px">Report table columns</h4>
      <div id="report-column-picker" class="defect-column-picker"></div>
    </div>` : '';

  // Decision body
  const body = document.getElementById('report-decision-body');
  body.innerHTML = editor + `
    <div class="assess-section">
      <h4>Asset & Location</h4>
      <p><strong>${turbine?.assetId}</strong> — ${turbine?.name}<br>
      ${turbine?.location}<br>
      GPS: ${d.gps || `${turbine?.gps.lat}°N, ${turbine?.gps.lng}°E`}<br>
      Model: ${turbine?.manufacturer || ''} ${turbine?.model || ''}<br>
      Blade length: ${turbine?.bladeLength || (turbine?.rotorDia ? turbine.rotorDia/2 : '—')} m<br>
      Location: <strong>${d.location || ('Blade ' + d.blade)}</strong><br>
      Radial position: <strong>${d.radialPos || (d.dist + ' m from root')}</strong></p>
    </div>
    <div class="assess-section">
      <h4>Detection Details</h4>
      <p>Type: <strong>${d.type}</strong><br>
      Crack / defect intensity: <strong>${d.intensity || ('SEV-' + d.severity)}</strong><br>
      Severity: <strong>Level ${d.severity}/5</strong><br>
      Length / size: <strong>${d.size || 'See observations'}</strong><br>
      Model Confidence: <strong>${(d.confidence*100).toFixed(0)}%</strong><br>
      Status: <strong style="color:${d.status === 'Dispatched' ? '#F2C94C' : d.status === 'Resolved' ? '#2ECC71' : '#EB5757'}">${d.status}</strong><br>
      Method: ${d.method}<br>
      Detected: ${d.inspDate}</p>
    </div>
    <div class="assess-section">
      <h4>Observations</h4>
      <p>${d.notes}</p>
    </div>
    <div class="assess-section">
      <h4>Recommended Action</h4>
      <ul class="rules-list">
        <li class="rule-li">🔧 ${d.action}</li>
        ${d.severity >= 4 ? '<li class="rule-li">⚠️ Escalate to Site Manager within 24h</li>' : ''}
        ${d.severity >= 5 ? '<li class="rule-li" style="color:#EB5757">🛑 CONSIDER HALTING TURBINE OPERATION</li>' : ''}
      </ul>
    </div>
    <div class="assess-section">
      <h4>Integrity Assessment</h4>
      <p>IEC 61400-22 ${d.severity >= 4 ? 'FAIL — Mandatory maintenance action' : d.severity >= 3 ? 'ADVISORY — Schedule remediation' : 'PASS — Monitor and log'}</p>
    </div>
  `;
  if (d.findingId) renderColumnPicker(document.getElementById('report-column-picker'));
  syncReportPicker();

  // Update dispatch button style/status dynamically
  const btn = document.getElementById('dispatch-btn');
  if (btn) {
    if (d.status === 'Dispatched') {
      btn.disabled = true;
      btn.textContent = '✓ Dispatch Order Approved';
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    } else if (d.status === 'Resolved') {
      btn.disabled = true;
      btn.textContent = '✓ Defect Resolved';
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.disabled = false;
      btn.textContent = 'Approve Dispatch Order';
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }
}

// Thermal slider
document.getElementById('therm-slider')?.addEventListener('input', function() {
  const v = this.value / 100;
  document.getElementById('img-therm').style.opacity = v;
  document.getElementById('img-rgb').style.opacity = 1 - v;
});

// Mask toggle
document.getElementById('mask-toggle')?.addEventListener('change', function() {
  document.getElementById('overlay-svg').style.opacity = this.checked ? 1 : 0;
});

// Zoom controls
function zoomIn() {
  STATE.zoomLevel = Math.min(STATE.zoomLevel + 0.25, 3);
  applyZoom();
}
function zoomOut() {
  STATE.zoomLevel = Math.max(STATE.zoomLevel - 0.25, 0.5);
  applyZoom();
}
function resetZoom() {
  STATE.zoomLevel = 1;
  applyZoom();
}
function applyZoom() {
  const frame = document.getElementById('img-frame');
  frame.querySelectorAll('img').forEach(img => {
    img.style.transform = `scale(${STATE.zoomLevel})`;
    img.style.transformOrigin = 'center center';
  });
  document.getElementById('zoom-badge').textContent = `Zoom: ${Math.round(STATE.zoomLevel * 100)}%`;
}

// Approve dispatch
function approveDispatch() {
  if (STATE.activeDefect) {
    STATE.activeDefect.status = 'Dispatched';
    saveDB(STATE.db);
    showToast(`Dispatch order approved for ${STATE.activeDefect.id}`, 'success');
    renderReport();
    addNotification(`Dispatch approved: ${STATE.activeDefect.id}`, 'info');
  }
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
async function generatePDFReport() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { showToast('PDF library not loaded. Check CDN connection.', 'error'); return; }

  showToast('Generating AI inspection report…', 'success');
  try { await loadBladeFindings(); } catch (_) {}

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const turbine = STATE.db.turbines.find(t => t.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  const catalog = reportFindings();
  const seenPhotos = new Set();
  const now = new Date().toLocaleString();
  const W = 210;
  let y = 20;

  const ensure = (mm) => {
    if (y + mm > 272) { doc.addPage(); y = 16; }
  };
  const sectionBar = (title) => {
    ensure(16);
    doc.setFillColor(2, 73, 80);
    doc.rect(10, y - 6, W - 20, 8, 'F');
    doc.setFontSize(10);
    doc.setTextColor(15, 164, 175);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, y);
    y += 10;
  };

  // ── Header ───────────────────────────────────
  doc.setFillColor(0, 49, 53);
  doc.rect(0, 0, W, 38, 'F');
  doc.setFontSize(18);
  doc.setTextColor(15, 164, 175);
  doc.setFont('helvetica', 'bold');
  doc.text('REUDE Technologies', 15, 14);
  doc.setFontSize(9);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'normal');
  doc.text('AI-Powered Wind Turbine Blade Inspection Platform', 15, 20);
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(`AI Inspection Report — ${turbine.assetId}`, 15, 30);
  doc.setFontSize(8);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${now}  |  Campaign: ${turbine.campaign}  |  CONFIDENTIAL`, 15, 36);

  y = 50;

  // ── Turbine Details ───────────────────────────
  doc.setFillColor(2, 73, 80);
  doc.rect(10, y - 6, W - 20, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 164, 175);
  doc.setFont('helvetica', 'bold');
  doc.text('1. TURBINE OVERVIEW', 14, y);
  y += 10;

  const assetFields = [
    ['Turbine ID', turbine.assetId], ['Name', turbine.name], ['Site', turbine.site],
    ['Location', turbine.location], ['GPS Coordinates', `${turbine.gps.lat}°N, ${turbine.gps.lng}°E`],
    ['State', turbine.state], ['Manufacturer', turbine.manufacturer], ['Model', turbine.model],
    ['Rated Power', `${turbine.power} MW`], ['Rotor Diameter', `${turbine.rotorDia} m`],
    ['Hub Height', `${turbine.hubHeight} m`], ['Commissioning Year', turbine.commYear],
    ['Health Index', `${turbine.health}%`], ['Status', turbine.status.toUpperCase()],
    ['Last Inspection', turbine.lastInspection], ['Coverage', `${turbine.inspCoverage}%`]
  ];

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let col = 0;
  assetFields.forEach(([label, value], i) => {
    const xOff = col === 0 ? 14 : 115;
    doc.setTextColor(150, 71, 52);
    doc.setFont('helvetica', 'bold');
    doc.text(label + ':', xOff, y);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), xOff + 48, y);
    col++;
    if (col === 2) { col = 0; y += 7; }
    if (y > 270) { doc.addPage(); y = 20; }
  });

  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  const sideCounts = REPORT_SIDES.map(([code, label]) => {
    const allSide = rowsForSide(catalog, code);
    const majorRows = allSide.filter(row => row.cat >= DOT_MIN_CAT);
    const minorRows = allSide.filter(row => row.cat < DOT_MIN_CAT);
    const rows = majorRows.length >= 4 ? majorRows : majorRows.concat(minorRows.slice(0, Math.max(0, 4 - majorRows.length)));
    const dominant = (majorRows[0] ? majorRows.slice() : rows.slice()).sort((a, b) => b.count - a.count)[0];
    return { code, label, rows, allSide, majorCount: majorRows.length, dominant };
  });
  const intro = doc.splitTextToSize('Each side lists major findings. A side with fewer than four major findings also lists minor ones. Photographs are different captures; a repeated file is left out.', W - 28);
  doc.text(intro, 14, y);
  y += intro.length * 4 + 4;

  sectionBar('Side summary');
  const sumCols = [14, 70, 110, 140];
  doc.setFillColor(0, 49, 53);
  doc.rect(10, y - 5, W - 20, 8, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'bold');
  ['Side', 'Major findings', 'Stations', 'Dominant condition'].forEach((h, i) => doc.text(h, sumCols[i], y));
  y += 9;
  sideCounts.forEach((side, idx) => {
    ensure(10);
    doc.setFillColor(...(idx % 2 === 0 ? [248, 252, 253] : [240, 248, 250]));
    doc.rect(10, y - 5, W - 20, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(60, 60, 60);
    doc.text(side.code, sumCols[0], y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(side.majorCount), sumCols[1], y);
    doc.text(String(new Set(side.rows.map(r => r.blade + '-' + r.index)).size), sumCols[2], y);
    const dominant = side.dominant ? doc.splitTextToSize(side.dominant.finding, 60)[0] : 'None at this category';
    doc.text(dominant, sumCols[3], y);
    y += 9;
  });
  y += 6;

  let sectionNo = 2;
  for (const side of sideCounts) {
    sectionBar(`${sectionNo}. ${side.label}`);
    sectionNo += 1;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    if (!side.rows.length) {
      doc.text('No findings recorded on this side.', 14, y);
      y += 10;
      continue;
    }
    const minorNote = side.majorCount < 4 && side.rows.length > side.majorCount
      ? ' Minor findings are included because major findings are few.'
      : '';
    doc.text(`${side.majorCount} major finding${side.majorCount === 1 ? '' : 's'} on ${side.label}.${minorNote}`, 14, y);
    y += 8;

    ensure(16);
    const cols = [14, 32, 52, 78, 98];
    doc.setFillColor(0, 49, 53);
    doc.rect(10, y - 5, W - 20, 8, 'F');
    doc.setFontSize(7.5);
    doc.setTextColor(175, 221, 229);
    doc.setFont('helvetica', 'bold');
    ['Blade', 'Station', 'Category', 'Marks', 'Finding'].forEach((h, i) => doc.text(h, cols[i], y));
    y += 9;
    side.rows.forEach((d, idx) => {
      ensure(10);
      doc.setFillColor(...(idx % 2 === 0 ? [248, 252, 253] : [240, 248, 250]));
      doc.rect(10, y - 5, W - 20, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(String(d.blade), cols[0], y);
      doc.setFont('helvetica', 'normal');
      doc.text(d.index ? ('P' + String(d.index).padStart(2, '0')) : '—', cols[1], y);
      doc.text('CAT ' + d.cat, cols[2], y);
      doc.text(String(d.count), cols[3], y);
      doc.text(doc.splitTextToSize(d.finding, 95)[0], cols[4], y);
      y += 8;
    });
    y += 4;

    const shots = await loadSideImages(side.allSide, 2, seenPhotos);
    if (!shots.length) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('No station photograph is available for this side.', 14, y);
      y += 8;
      continue;
    }
    let photoCol = 0;
    let rowH = 0;
    shots.forEach(shot => {
      let boxW = 88;
      let boxH = boxW * shot.height / Math.max(shot.width, 1);
      if (boxH > 78) {
        boxH = 78;
        boxW = boxH * shot.width / Math.max(shot.height, 1);
      }
      if (photoCol === 0) ensure(boxH + 16);
      const x = photoCol === 0 ? 14 : 110;
      doc.addImage(shot.data, 'JPEG', x, y, boxW, boxH);
      doc.setFontSize(7);
      doc.setTextColor(40, 40, 40);
      doc.text(doc.splitTextToSize(shot.caption, boxW)[0], x, y + boxH + 4);
      rowH = Math.max(rowH, boxH + 10);
      if (photoCol === 1) { y += rowH; photoCol = 0; rowH = 0; }
      else photoCol = 1;
    });
    if (photoCol === 1) y += rowH;
    y += 4;
  }

  ensure(28);
  y += 4;
  doc.setFillColor(0, 49, 53);
  doc.rect(0, y, W, 28, 'F');
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'normal');
  doc.text('PREPARED BY: REUDE CompliQ AI Inspection', 14, y); y += 6;
  doc.text(`REPORT DATE: ${now}`, 14, y); y += 6;
  doc.setTextColor(150, 71, 52);
  doc.text('Indications from visual RGB review. Validate CAT 2 and above by close-up or NDT before repair.', 14, y);

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120, 140, 145);
    doc.setFont('helvetica', 'normal');
    doc.text('REUDE Technologies  |  CompliQ  |  AI Inspection Report', 14, 292);
    doc.text(`Page ${i} of ${pageCount}`, W - 14, 292, { align: 'right' });
  }

  const filename = `AI_Inspection_Report_${turbine.assetId}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  showToast(`AI inspection report saved: ${filename}`, 'success');
}

// ══════════════════════════════════════════════════
// 10. INGEST DATA
// ══════════════════════════════════════════════════
function populateIngestSelects() {
  const sel = document.getElementById('ig-turbine');
  if (!sel) return;
  sel.innerHTML = STATE.db.turbines.map(t => `<option value="${t.id}">${t.assetId} — ${t.name}</option>`).join('');
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
      `<option value="${t.id}">${t.assetId} — ${t.name}</option>`).join('');
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

function handleAddTurbine(e) {
  e.preventDefault();
  const gps = document.getElementById('mt-gps').value.split(',');
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
    anomalies: 0, defects: []
  };
  STATE.db.turbines.push(newT);
  saveDB(STATE.db);
  addManualRecord('turbine', `${newT.assetId}`, `${newT.site} | ${newT.location}`);
  renderMetrics();
  renderFleetGrid();
  renderAssetList();
  populateManualSelects();
  populateTurbineSelector();
  showToast(`Turbine ${newT.assetId} added to fleet!`, 'success');
  e.target.reset();
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
  severity: null,
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
    tick: light ? '#28666E' : 'rgba(175, 221, 229, 0.75)',
    legend: light ? '#063235' : 'rgba(232, 244, 245, 0.9)',
    grid: light ? 'rgba(6, 50, 53, 0.1)' : 'rgba(15, 164, 175, 0.14)',
    tipBg: light ? '#ffffff' : '#024950',
    tipTitle: light ? '#063235' : '#AFDDE5',
    tipBody: light ? '#28666E' : '#AFDDE5',
    tipBorder: '#0FA4AF',
    pieBorder: light ? '#ffffff' : '#003135',
    line: '#0FA4AF',
    fill: light ? 'rgba(15, 164, 175, 0.12)' : 'rgba(15, 164, 175, 0.18)',
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
  renderAnalyticsSummary();
  renderHealthChart();
  renderDefectPieChart();
  renderSeverityChart();
  renderTimelineChart();
}

function renderAnalyticsSummary() {
  const el = document.getElementById('analytics-summary');
  if (!el) return;
  const turbines = STATE.db.turbines || [];
  const defects = getAnalyticsDefects();
  const avgHealth = turbines.length
    ? Math.round(turbines.reduce((s, t) => s + (Number(t.health) || 0), 0) / turbines.length)
    : 0;
  const crit = defects.filter(d => Number(d.severity) >= 4).length;
  const warn = turbines.filter(t => t.status === 'warning' || t.status === 'critical').length;
  el.innerHTML = `
    <div class="analytics-kpi"><small>Turbines</small><strong>${turbines.length}</strong></div>
    <div class="analytics-kpi"><small>Avg Health</small><strong>${avgHealth}%</strong></div>
    <div class="analytics-kpi"><small>Findings</small><strong>${defects.length}</strong></div>
    <div class="analytics-kpi"><small>Critical / High</small><strong class="${crit ? 'kpi-crit' : ''}">${crit}</strong></div>
    <div class="analytics-kpi"><small>Assets Attention</small><strong class="${warn ? 'kpi-warn' : ''}">${warn}</strong></div>
  `;
}

function renderHealthChart() {
  const canvas = document.getElementById('chart-health');
  if (!canvas) return;
  if (CHARTS.health) CHARTS.health.destroy();

  const theme = getChartTheme();
  const turbines = STATE.db.turbines || [];
  const labels = turbines.map(t => t.assetId);
  const data = turbines.map(t => Number(t.health) || 0);
  const backgroundColors = turbines.map(t => {
    const h = Number(t.health) || 0;
    return h >= 85 ? '#2ECC71' : h >= 65 ? '#F2C94C' : '#EB5757';
  });

  CHARTS.health = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Health Index (%)',
        data,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        borderRadius: 5,
        barPercentage: 0.62
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
            afterLabel: (ctx) => {
              const t = turbines[ctx.dataIndex];
              return t ? `${t.site || ''} · ${t.status || ''}`.trim() : '';
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { color: theme.grid },
          ticks: {
            color: theme.tick,
            font: { family: 'JetBrains Mono', size: theme.font.tick },
            callback: (v) => v + '%'
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

  const palette = {
    Crack: '#EB5757',
    Delamination: '#F2C94C',
    Erosion: '#0FA4AF',
    Lightning: '#BB86FC',
    Corrosion: '#E15A5F',
    'Oil Leakage': '#F0A03C',
    Surface: '#B9D896',
    'Localized Damage': '#FACD96',
    Other: '#7EB8C0'
  };
  const fallback = ['#0FA4AF', '#AFDDE5', '#964734', '#2ECC71', '#F2C94C', '#EB5757', '#BB86FC', '#28666E'];
  const labels = Object.keys(types).sort((a, b) => types[b] - types[a]);
  const data = labels.map(t => types[t]);
  const backgroundColors = labels.map((t, i) => palette[t] || fallback[i % fallback.length]);

  CHARTS.defects = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: backgroundColors,
        borderWidth: 2,
        borderColor: theme.pieBorder,
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
                strokeStyle: theme.pieBorder,
                lineWidth: 1,
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

function renderSeverityChart() {
  const canvas = document.getElementById('chart-severity');
  if (!canvas) return;
  if (CHARTS.severity) CHARTS.severity.destroy();

  const theme = getChartTheme();
  const sevCounts = [0, 0, 0, 0, 0];
  getAnalyticsDefects().forEach(d => {
    const s = Number(d.severity);
    if (s >= 1 && s <= 5) sevCounts[s - 1]++;
  });
  const sevColors = ['#B9D896', '#FACD96', '#F0A03C', '#E15A5F', '#AF373C'];

  CHARTS.severity = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['S1 Low', 'S2 Minor', 'S3 Moderate', 'S4 Major', 'S5 Critical'],
      datasets: [{
        label: 'Defects',
        data: sevCounts,
        backgroundColor: sevColors,
        borderWidth: 0,
        borderRadius: 5,
        barPercentage: 0.65
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: chartTooltipOpts(theme)
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: theme.tick,
            font: { family: 'JetBrains Mono', size: theme.font.tick },
            precision: 0
          },
          grid: { color: theme.grid }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: theme.tick,
            font: { family: 'Outfit', size: theme.font.tick, weight: '600' },
            maxRotation: window.innerWidth < 720 ? 35 : 0
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
    return `Lowest health: <strong>${worst.assetId} — ${worst.name}</strong><br>Health: ${worst.health}% | Status: ${worst.status.toUpperCase()}<br>Anomalies: ${worst.anomalies}<br>Location: ${worst.location}`;
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
    return `<strong>${matchedT.assetId} — ${matchedT.name}</strong><br>
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
document.getElementById('nl-btn')?.addEventListener('click', () => {
  const q = document.getElementById('nl-input').value.trim();
  if (!q) return;
  document.getElementById('ai-chat-box').classList.add('open');
  document.getElementById('ai-input').value = q;
  document.getElementById('nl-input').value = '';
  setTimeout(sendAIMessage, 100);
});
document.getElementById('nl-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('nl-btn').click();
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
  /* Blade C SS files in INPUT are named BLADE2, not BLADE3. */
  const primary = (blade === 'C' && surface === 'SS') ? '2' : G97_BLADE_NUM[blade];
  return [primary, ...['1', '2', '3'].filter(n => n !== primary)];
}

function useFirstExistingImage(img, candidates, onMiss) {
  let index = 0;
  const tryNext = () => {
    if (!img.isConnected) return;
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
  return paths;
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
  { blade: 'B', surface: 'PS', url: 'INPUT/Kayathar_Gamesa_G97/Blade_B/PS/findings_per_frame_B2_PS.csv' }
];
const BLADE_FINDINGS = { ready: false, loading: null, rows: [] };

function escHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function parseFindingCsv(text, src) {
  const lines = text.trim().split(/\r?\n/).slice(1);
  const out = [];
  lines.forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(',');
    if (parts.length < 4) return;
    const frame = parts[0].trim();
    const count = Number(parts[parts.length - 1].trim()) || 1;
    const cat = Number(parts[parts.length - 2].trim());
    const finding = parts.slice(1, -2).join(',').trim();
    if (!Number.isFinite(cat) || cat < 1 || /no defect/i.test(finding)) return;
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
      try {
        const res = await fetch(encodeURI(src.url));
        if (!res.ok) continue;
        rows.push(...parseFindingCsv(await res.text(), src));
      } catch (err) {
        console.warn('Station findings unavailable:', src.url, err);
      }
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
  ['radial', 'Radial Pos.'],
  ['dist', 'Dist. from Root'],
  ['location', 'Location'],
  ['type', 'Defect Type'],
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
  if (name && document.activeElement !== name) {
    name.value = view.finding;
    name.placeholder = raw.finding;
  }
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
  const point = getSelectedPocPoint(turbine);
  const pointLabel = 'P' + String(view.index).padStart(2, '0');
  STATE.reviewFindingId = raw.id;
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
    stationImage: (point.stationCandidates && point.stationCandidates[0]) || point.stationImage || ''
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

function reportFindingOptions() {
  const blade = document.getElementById('report-blade')?.value || STATE.selectedBlade || 'A';
  const side = document.getElementById('report-side')?.value || STATE.pocSurface || 'SS';
  const turbine = STATE.db?.turbines?.find(t => t.id === reportTurbineId()) || STATE.db?.turbines?.[0];
  if (!turbine) return [];
  if (isG97Turbine(turbine)) {
    return findingsForBlade(blade).filter(row => row.surface === side);
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
}

function applyReportDefect() {
  const id = document.getElementById('report-defect')?.value;
  if (!id) return;
  const raw = rawFinding(id);
  if (raw) {
    STATE.selectedTurbineId = reportTurbineId();
    STATE.selectedBlade = raw.blade;
    STATE.pocSurface = raw.surface;
    STATE.reviewFindingId = raw.id;
    openFindingDetails();
    return;
  }
  const demo = STATE.db.defects.find(d => d.id === id);
  if (!demo) return;
  STATE.selectedTurbineId = demo.assetId;
  STATE.selectedBlade = demo.blade;
  STATE.reviewFindingId = null;
  STATE.activeDefect = demo;
  navigateTo('report');
  renderReport();
}

function syncReportPicker() {
  const turbineSel = document.getElementById('report-turbine');
  if (!turbineSel || !turbineSel.dataset.bound) return;
  const d = STATE.activeDefect;
  reportPickerLock = true;
  if (d?.assetId) turbineSel.value = String(d.assetId);
  const raw = d?.findingId ? rawFinding(d.findingId) : null;
  const bladeSel = document.getElementById('report-blade');
  const sideSel = document.getElementById('report-side');
  if (bladeSel) bladeSel.value = raw?.blade || d?.blade || bladeSel.value;
  if (sideSel && raw?.surface) sideSel.value = raw.surface;
  fillReportDefects(raw?.id || d?.id);
  reportPickerLock = false;
}

function initReportPicker() {
  const turbineSel = document.getElementById('report-turbine');
  if (!turbineSel || turbineSel.dataset.bound) return;
  turbineSel.dataset.bound = '1';
  turbineSel.innerHTML = (STATE.db?.turbines || []).map(t =>
    `<option value="${t.id}">${escHtml(t.assetId)} — ${escHtml(t.name)}</option>`
  ).join('');
  if (STATE.selectedTurbineId) turbineSel.value = String(STATE.selectedTurbineId);
  const bladeSel = document.getElementById('report-blade');
  const sideSel = document.getElementById('report-side');
  if (bladeSel && STATE.selectedBlade) bladeSel.value = STATE.selectedBlade;
  if (sideSel && STATE.pocSurface) sideSel.value = STATE.pocSurface;
  fillReportDefects(STATE.activeDefect?.findingId || STATE.activeDefect?.id);
  const onFilter = () => {
    if (reportPickerLock) return;
    STATE.selectedTurbineId = reportTurbineId();
    STATE.selectedBlade = bladeSel?.value || STATE.selectedBlade;
    STATE.pocSurface = sideSel?.value || STATE.pocSurface;
    fillReportDefects();
    applyReportDefect();
  };
  turbineSel.addEventListener('change', onFilter);
  bladeSel?.addEventListener('change', onFilter);
  sideSel?.addEventListener('change', onFilter);
  document.getElementById('report-defect')?.addEventListener('change', () => {
    if (!reportPickerLock) applyReportDefect();
  });
  if (STATE.activeDefect) syncReportPicker();
}

function initSidebarCollapse() {
  const btn = document.getElementById('sidebar-collapse');
  const wrap = document.getElementById('app-wrap');
  if (!btn || !wrap) return;
  const apply = (collapsed) => {
    wrap.classList.toggle('sidebar-collapsed', collapsed);
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    localStorage.setItem('compliq_sidebar_collapsed', collapsed ? '1' : '0');
  };
  apply(localStorage.getItem('compliq_sidebar_collapsed') === '1');
  document.querySelectorAll('.sidebar .nav-item').forEach(item => {
    const label = item.querySelector('span');
    if (label && !item.title) item.title = label.textContent.trim();
  });
  btn.addEventListener('click', () => apply(!wrap.classList.contains('sidebar-collapsed')));
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

async function renderBladeAPocProfile() {
  await loadBladePocAnnotations();
  await loadBladeFindings();
  const container = document.getElementById('blade-schematic');
  if (!container) return;
  const turbine = STATE.db?.turbines?.find(x => x.id === STATE.selectedTurbineId) || STATE.db?.turbines?.[0];
  const span = bladeSpanM(turbine);
  focusCriticalFinding(activeBladeLetter());
  const points = buildPocPoints(turbine);
  const showLegend = points.some(p => p.flagged);

  container.innerHTML = `
    <div class="asset-bp-wrap">
      <div class="asset-bp-meta">Gamesa G97 2 MW · <strong>${span} m</strong> · Blade ${activeBladeLetter()} · P1 root/hub → P20 tip · SS / LE / PS / TE</div>
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
  const box = root.querySelector('.asset-bp-profile');
  const stage = root.querySelector('.asset-bp-stage');
  const img = stage?.querySelector('img');
  const panel = box?.closest('.asset-poc-profile-panel');
  const workspace = panel?.closest('.asset-poc-workspace');
  if (!box || !stage || !img) return;

  const fit = () => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const ar = img.naturalWidth / img.naturalHeight;
    stage.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;

    if (panel && window.innerWidth > 980) {
      const view = document.getElementById('view-asset');
      const hostW = (workspace && workspace.clientWidth > 40)
        ? workspace.clientWidth
        : (view?.clientWidth || 0);
      const imageH = Math.max(220, box.clientHeight - 22);
      let colW = Math.round(imageH * ar) + 8;
      const share = window.innerWidth >= 1200 ? 0.4 : 0.42;
      const maxW = Math.max(200, Math.floor(hostW * share));
      if (colW > maxW) colW = maxW;
      const next = colW + 'px';
      if (panel.style.width !== next) panel.style.width = next;
    } else if (panel) {
      panel.style.width = '';
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
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
  };

  if (img.complete && img.naturalWidth) fit();
  else img.addEventListener('load', fit, { once: true });

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fit());
    ro.observe(box);
    const view = document.getElementById('view-asset');
    if (view) ro.observe(view);
    if (workspace) ro.observe(workspace);
  } else {
    window.addEventListener('resize', fit);
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
  document.getElementById('asset-pan')?.addEventListener('click', () => {
    ANNO_VIEW.pan = !ANNO_VIEW.pan;
    document.getElementById('asset-pan')?.classList.toggle('is-on', ANNO_VIEW.pan);
    viewport.classList.toggle('pan-on', ANNO_VIEW.pan);
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
  document.getElementById('asset-image-min')?.addEventListener('click', () => {
    const ws = document.getElementById('asset-poc-workspace');
    const btn = document.getElementById('asset-image-min');
    if (!ws) return;
    ws.classList.toggle('image-min');
    const min = ws.classList.contains('image-min');
    if (btn) {
      btn.textContent = min ? 'Show' : 'Min';
      btn.title = min ? 'Show image' : 'Minimize image';
    }
  });

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
  renderMetrics();
  renderFleetGrid();
  renderAssetList();
  renderNotifications();
  loadBladePocAnnotations();
  initSidebarCollapse();
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
      if (first.defect_type || first.type) document.getElementById('ig-defect') && (document.getElementById('ig-defect').value = first.defect_type||first.type||'');
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
  const saved = localStorage.getItem('site_theme') || 'light';
  applyDashTheme(saved);

  const btn = document.getElementById('theme-toggle-dash');
  if (btn) {
    btn.textContent = saved === 'light' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', saved === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    btn.title = saved === 'light' ? 'Dark mode' : 'Light mode';
    btn.addEventListener('click', () => {
      const current = localStorage.getItem('site_theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('site_theme', next);
      applyDashTheme(next);
      btn.textContent = next === 'light' ? '🌙' : '☀️';
      btn.setAttribute('aria-label', next === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
      btn.title = next === 'light' ? 'Dark mode' : 'Light mode';
    });
  }

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
