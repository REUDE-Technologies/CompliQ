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
    id: 1, assetId: 'WTG-001', name: 'Tamil Nadu Alpha',
    site: 'Muppandal Wind Farm', state: 'Tamil Nadu',
    gps: { lat: 8.3833, lng: 77.3292 }, location: 'Muppandal, Kanyakumari District, Tamil Nadu',
    status: 'normal', health: 92, rotorDia: 126, hubHeight: 90, power: 2.5,
    manufacturer: 'Vestas', model: 'V126-3.45 MW', commYear: 2021,
    windSpeed: 11.2, rpm: 14.5, inspCoverage: 98,
    lastInspection: '2026-04-12', campaign: 'INSP-2026-Q1',
    anomalies: 1, defects: ['DEF-001']
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
  { id: 'DEF-001', assetId: 1, blade: 'A', dist: 34, type: 'Crack', confidence: 0.91, severity: 3, priority: 'MEDIUM', action: 'Schedule visual re-inspection within 30 days', status: 'Pending', method: 'Drone RGB', gps: '8.3833, 77.3294', campaign: 'INSP-2026-Q1', inspDate: '2026-04-12', notes: 'Surface crack approx 14cm, shallow depth. Monitor progression.' },
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
  if (stored) {
    try { return JSON.parse(stored); }
    catch(e) {}
  }
  const db = { turbines: [...DEFAULT_TURBINES], defects: [...DEFAULT_DEFECTS], manualRecords: [], inspectionLogs: [] };
  saveDB(db);
  return db;
}
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

let STATE = {
  db: null,
  selectedTurbineId: 1,
  selectedBlade: 'A',
  selectedPart: 'blade-A',
  activeDefect: null,
  zoomLevel: 1,
  filterMode: 'all',
  manualRecords: []
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
      <div class="asset-thumb"><img src="images/turbine_teal.png" alt="${t.assetId}"></div>
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

function renderTurbineInfo(t) {
  const panel = document.getElementById('turbine-info-panel');
  const hClass = t.health >= 85 ? '#2ECC71' : t.health >= 65 ? '#F2C94C' : '#EB5757';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
      <div style="width:10px;height:10px;border-radius:50%;background:${hClass};box-shadow:0 0 8px ${hClass};"></div>
      <span style="font-size:1.1rem;font-weight:800;color:#fff">${t.assetId} — ${t.name}</span>
    </div>
    ${stat('Location', t.location)}
    ${stat('GPS Coordinates', `${t.gps.lat}°N, ${t.gps.lng}°E`)}
    ${stat('Site', t.site)}
    ${stat('State', t.state)}
    ${stat('Manufacturer', t.manufacturer)}
    ${stat('Model', t.model)}
    ${stat('Rated Power', t.power + ' MW')}
    ${stat('Rotor Diameter', t.rotorDia + ' m')}
    ${stat('Hub Height', t.hubHeight + ' m')}
    ${stat('Commission Year', t.commYear)}
    ${stat('Wind Speed', t.windSpeed + ' m/s')}
    ${stat('RPM', t.rpm)}
    ${stat('Health Index', t.health + '%')}
    ${stat('Anomalies', t.anomalies)}
    ${stat('Last Inspection', t.lastInspection)}
    ${stat('Campaign', t.campaign)}
  `;
}

function stat(label, value) {
  return `<div class="info-stat"><span>${label}</span><strong>${value}</strong></div>`;
}

// ── BLADE SCHEMATIC ────────────────────────────
function renderBlade(turbine, blade) {
  const container = document.getElementById('blade-schematic');
  const defects = STATE.db.defects.filter(d => d.assetId === turbine.id && d.blade === blade);
  const maxDist = turbine.rotorDia / 2;

  const colors = { Crack: '#EB5757', Delamination: '#F2C94C', Erosion: '#0FA4AF', Lightning: '#BB86FC' };

  const W = container.offsetWidth || 600;
  const H = 180;

  container.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="display:block;">
      <!-- Blade outline -->
      <defs>
        <linearGradient id="bladeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#AFDDE5" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#AFDDE5" stop-opacity="0.1"/>
        </linearGradient>
      </defs>
      <path d="M 40 90 Q ${W*0.3} 60 ${W-20} 30 L ${W-20} 50 Q ${W*0.3} 80 40 110 Z"
        fill="url(#bladeGrad)" stroke="#0FA4AF" stroke-width="1.5" opacity="0.5"/>
      <!-- Root -->
      <ellipse cx="40" cy="90" rx="22" ry="24" fill="rgba(15,164,175,0.2)" stroke="#0FA4AF" stroke-width="1.5"/>
      <!-- Tip marker -->
      <circle cx="${W-20}" cy="40" r="5" fill="#AFDDE5" opacity="0.5"/>
      <!-- Section labels -->
      <text x="40" y="${H-10}" font-family="JetBrains Mono,monospace" font-size="10" fill="rgba(175,221,229,0.5)">Root</text>
      <text x="${W-40}" y="${H-10}" font-family="JetBrains Mono,monospace" font-size="10" fill="rgba(175,221,229,0.5)">Tip</text>
      <!-- Distance markers -->
      ${[0.25, 0.5, 0.75].map(frac => `
        <line x1="${40 + frac*(W-60)}" y1="20" x2="${40 + frac*(W-60)}" y2="${H-20}" stroke="rgba(15,164,175,0.1)" stroke-dasharray="3,3"/>
        <text x="${40 + frac*(W-60)}" y="16" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" fill="rgba(175,221,229,0.35)">${Math.round(frac * maxDist)}m</text>
      `).join('')}
      <!-- Defect hotspots -->
      ${defects.map((d, i) => {
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

// ── BLADE TABS ────────────────────────────────
document.querySelectorAll('.btab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    STATE.selectedBlade = btn.dataset.blade;
    const t = STATE.db.turbines.find(x => x.id === STATE.selectedTurbineId);
    if (t) renderBlade(t, STATE.selectedBlade);
    renderDefectsTable(STATE.db.turbines.find(x => x.id === STATE.selectedTurbineId));
  });
});

// ── DEFECTS TABLE ─────────────────────────────
function renderDefectsTable(turbine) {
  const tbody = document.getElementById('defects-tbody');
  const defects = turbine
    ? STATE.db.defects.filter(d => d.assetId === turbine.id && d.blade === STATE.selectedBlade)
    : STATE.db.defects;
  tbody.innerHTML = defects.map(d => `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:0.73rem;color:var(--c-teal)">${d.id}</span></td>
      <td>${d.blade}</td>
      <td><span style="font-family:var(--font-mono);font-size:0.72rem">${d.dist}m from root</span></td>
      <td>${d.type}</td>
      <td><span style="font-family:var(--font-mono);color:${d.confidence>=0.9?'#2ECC71':'#F2C94C'}">${(d.confidence*100).toFixed(0)}%</span></td>
      <td><span class="sev-pill sev-${d.severity}">SEV-${d.severity}</span></td>
      <td style="font-size:0.72rem;max-width:200px;">${d.action}</td>
      <td><span class="prio-pill prio-${d.priority.toLowerCase()}">${d.priority}</span></td>
      <td><span class="stat-dot-pill ${d.status.toLowerCase()}">${d.status}</span></td>
      <td><button class="review-btn" onclick="openReport('${d.id}')">Review</button></td>
    </tr>
  `).join('') || `<tr><td colspan="10" style="text-align:center;padding:20px;color:var(--c-muted)">No defects recorded for Blade ${STATE.selectedBlade}</td></tr>`;
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

  // Decision body
  const body = document.getElementById('report-decision-body');
  body.innerHTML = `
    <div class="assess-section">
      <h4>Asset & Location</h4>
      <p><strong>${turbine?.assetId}</strong> — ${turbine?.name}<br>
      ${turbine?.location}<br>
      GPS: ${d.gps || `${turbine?.gps.lat}°N, ${turbine?.gps.lng}°E`}<br>
      Blade ${d.blade} at ${d.dist}m from root</p>
    </div>
    <div class="assess-section">
      <h4>Detection Details</h4>
      <p>Type: <strong>${d.type}</strong><br>
      Severity: <strong>Level ${d.severity}/5</strong><br>
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

// ══════════════════════════════════════════════════
// 9. PDF REPORT GENERATION
// ══════════════════════════════════════════════════
function generatePDFReport() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { showToast('PDF library not loaded. Check CDN connection.', 'error'); return; }

  showToast('Generating PDF report…', 'success');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const turbine = STATE.db.turbines.find(t => t.id === STATE.selectedTurbineId) || STATE.db.turbines[0];
  const defects = STATE.db.defects.filter(d => d.assetId === turbine.id);
  const now = new Date().toLocaleString();
  const W = 210; // A4 width
  let y = 20;

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
  doc.text(`Engineering Inspection Report — ${turbine.assetId}`, 15, 30);
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
  doc.text('1. ASSET INFORMATION', 14, y);
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

  y += 12;

  // ── Fleet Summary ─────────────────────────────
  doc.setFillColor(2, 73, 80);
  doc.rect(10, y - 6, W - 20, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 164, 175);
  doc.setFont('helvetica', 'bold');
  doc.text('2. CONDITION SUMMARY', 14, y);
  y += 10;
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');

  const critCount = defects.filter(d => d.severity >= 4).length;
  const summary = [
    `Total anomalies detected: ${turbine.anomalies}`,
    `Critical / High severity: ${critCount}`,
    `Active defects requiring action: ${defects.filter(d => d.status === 'Pending').length}`,
    `Dispatched for repair: ${defects.filter(d => d.status === 'Dispatched').length}`,
    `Resolved: ${defects.filter(d => d.status === 'Resolved').length}`,
    `IEC 61400-22 Compliance: ${critCount > 0 ? 'ADVISORY / ACTION REQUIRED' : 'PASS'}`,
  ];
  summary.forEach(line => { doc.text(line, 14, y); y += 7; });
  y += 8;

  // ── Defects Table ─────────────────────────────
  if (y > 230) { doc.addPage(); y = 20; }
  doc.setFillColor(2, 73, 80);
  doc.rect(10, y - 6, W - 20, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 164, 175);
  doc.setFont('helvetica', 'bold');
  doc.text('3. DETECTED DEFECTS REGISTER', 14, y);
  y += 10;

  // Table header
  const cols = [14, 34, 48, 68, 90, 104, 118, 165];
  const heads = ['ID', 'Blade', 'Dist', 'Type', 'Conf', 'Sev', 'Priority', 'Action'];
  doc.setFillColor(0, 49, 53);
  doc.rect(10, y - 5, W - 20, 8, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'bold');
  heads.forEach((h, i) => doc.text(h, cols[i], y));
  y += 9;

  defects.forEach((d, idx) => {
    if (y > 270) { doc.addPage(); y = 20; }
    const bg = idx % 2 === 0 ? [248, 252, 253] : [240, 248, 250];
    doc.setFillColor(...bg);
    doc.rect(10, y - 5, W - 20, 8, 'F');

    if (d.severity >= 4) doc.setTextColor(235, 87, 87);
    else if (d.severity === 3) doc.setTextColor(150, 71, 52);
    else doc.setTextColor(60, 60, 60);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(d.id, cols[0], y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(d.blade, cols[1], y);
    doc.text(`${d.dist}m`, cols[2], y);
    doc.text(d.type, cols[3], y);
    doc.text(`${(d.confidence*100).toFixed(0)}%`, cols[4], y);
    doc.text(`${d.severity}/5`, cols[5], y);
    doc.setFont('helvetica', 'bold');
    doc.text(d.priority, cols[6], y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const actionLines = doc.splitTextToSize(d.action, 40);
    doc.text(actionLines[0], cols[7], y);
    y += 9;
  });

  y += 8;

  // ── Detailed Findings ──────────────────────────
  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFillColor(2, 73, 80);
  doc.rect(10, y - 6, W - 20, 8, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 164, 175);
  doc.setFont('helvetica', 'bold');
  doc.text('4. DETAILED FINDINGS', 14, y);
  y += 12;

  defects.forEach(d => {
    if (y > 250) { doc.addPage(); y = 20; }
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(150, 71, 52);
    doc.text(`${d.id} — ${d.type} | Blade ${d.blade} | ${d.dist}m | SEV-${d.severity}`, 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(8);
    const noteLines = doc.splitTextToSize(d.notes, W - 30);
    doc.text(noteLines, 14, y);
    y += noteLines.length * 5 + 3;
    doc.setTextColor(15, 164, 175);
    const actionLines = doc.splitTextToSize(`Action: ${d.action}`, W - 30);
    doc.text(actionLines, 14, y);
    y += actionLines.length * 5 + 4;
    doc.setDrawColor(15, 164, 175);
    doc.setLineWidth(0.1);
    doc.line(14, y, W - 14, y);
    y += 6;
  });

  // ── Signature Footer ───────────────────────────
  if (defects.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('No defects recorded for this asset.', 14, y);
    y += 10;
  }

  if (y > 240) { doc.addPage(); y = 20; }
  y += 6;
  doc.setFillColor(0, 49, 53);
  doc.rect(0, y, W, 40, 'F');
  y += 10;
  doc.setFontSize(8);
  doc.setTextColor(175, 221, 229);
  doc.setFont('helvetica', 'normal');
  doc.text('PREPARED BY: REUDE Autonomous Inspection System', 14, y); y += 7;
  doc.text(`REPORT DATE: ${now}`, 14, y); y += 7;
  doc.setTextColor(150, 71, 52);
  doc.text('DISCLAIMER: This report is generated by AI-assisted analysis. All findings should be validated by a certified structural engineer.', 14, y);

  // Save
  const filename = `REUDE_Report_${turbine.assetId}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
  showToast(`✓ PDF saved: ${filename}`, 'success');
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
// 12. ANALYTICS CHARTS (Canvas API — no external lib)
// ══════════════════════════════════════════════════
let CHARTS = {
  health: null,
  defects: null,
  severity: null,
  timeline: null
};

// ══════════════════════════════════════════════════
// 12. ANALYTICS CHARTS (CHART.JS)
// ══════════════════════════════════════════════════
function renderCharts() {
  renderHealthChart();
  renderDefectPieChart();
  renderSeverityChart();
  renderTimelineChart();
}

function renderHealthChart() {
  const canvas = document.getElementById('chart-health');
  if (!canvas) return;

  if (CHARTS.health) {
    CHARTS.health.destroy();
  }

  const turbines = STATE.db.turbines;
  const labels = turbines.map(t => t.assetId);
  const data = turbines.map(t => t.health);
  const backgroundColors = turbines.map(t => 
    t.health >= 85 ? '#2ECC71' : t.health >= 65 ? '#F2C94C' : '#EB5757'
  );

  const ctx = canvas.getContext('2d');
  CHARTS.health = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Health Index (%)',
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#024950',
          titleFont: { family: 'Outfit', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          borderColor: '#0FA4AF',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          grid: { color: 'rgba(15, 164, 175, 0.1)' },
          ticks: {
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 },
            callback: (value) => value + '%'
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 }
          }
        }
      },
      onClick: (e, activeEl) => {
        if (activeEl && activeEl.length > 0) {
          const index = activeEl[0].index;
          const turbine = turbines[index];
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

  if (CHARTS.defects) {
    CHARTS.defects.destroy();
  }

  const types = {};
  STATE.db.defects.forEach(d => { types[d.type] = (types[d.type] || 0) + 1; });
  const colors = { Crack: '#EB5757', Delamination: '#F2C94C', Erosion: '#0FA4AF', Lightning: '#BB86FC' };

  const labels = Object.keys(types);
  const data = Object.values(types);
  const backgroundColors = labels.map(t => colors[t] || '#AFDDE5');

  const ctx = canvas.getContext('2d');
  CHARTS.defects = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: backgroundColors,
        borderWidth: 1,
        borderColor: '#003135'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: 'rgba(175, 221, 229, 0.8)',
            font: { family: 'Outfit', size: 10 }
          }
        },
        tooltip: {
          backgroundColor: '#024950',
          titleFont: { family: 'Outfit', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          borderColor: '#0FA4AF',
          borderWidth: 1
        }
      }
    }
  });
}

function renderSeverityChart() {
  const canvas = document.getElementById('chart-severity');
  if (!canvas) return;

  if (CHARTS.severity) {
    CHARTS.severity.destroy();
  }

  const sevCounts = [0,0,0,0,0];
  STATE.db.defects.forEach(d => {
    if (d.severity >= 1 && d.severity <= 5) {
      sevCounts[d.severity - 1]++;
    }
  });
  const sevColors = ['rgba(175,221,229,0.6)','#2ECC71','#F2C94C','#EB5757','rgba(235,87,87,0.8)'];

  const ctx = canvas.getContext('2d');
  CHARTS.severity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4', 'SEV-5'],
      datasets: [{
        label: 'Count',
        data: sevCounts,
        backgroundColor: sevColors,
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#024950',
          titleFont: { family: 'Outfit', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          borderColor: '#0FA4AF',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 }
          },
          grid: { color: 'rgba(15, 164, 175, 0.1)' }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 }
          }
        }
      }
    }
  });
}

function renderTimelineChart() {
  const canvas = document.getElementById('chart-timeline');
  if (!canvas) return;

  if (CHARTS.timeline) {
    CHARTS.timeline.destroy();
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun'];
  // Keep original static trend or aggregate defect inspection dates
  const data = [2, 5, 3, 7, 6, 4];

  const ctx = canvas.getContext('2d');
  CHARTS.timeline = new Chart(ctx, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Inspections Logged',
        data: data,
        borderColor: '#0FA4AF',
        backgroundColor: 'rgba(15, 164, 175, 0.15)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#0FA4AF',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#024950',
          titleFont: { family: 'Outfit', size: 12 },
          bodyFont: { family: 'JetBrains Mono', size: 11 },
          borderColor: '#0FA4AF',
          borderWidth: 1
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(15, 164, 175, 0.1)' },
          ticks: {
            stepSize: 2,
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: 'rgba(175, 221, 229, 0.6)',
            font: { family: 'JetBrains Mono', size: 9 }
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

  // Start MQTT simulation
  setInterval(addMQTTLog, 2800);
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
    btn.addEventListener('click', () => {
      const current = localStorage.getItem('site_theme') || 'light';
      const next = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('site_theme', next);
      applyDashTheme(next);
      btn.textContent = next === 'light' ? '🌙' : '☀️';
    });
  }
}

function applyDashTheme(theme) {
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
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
