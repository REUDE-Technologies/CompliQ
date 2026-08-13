/* 
 * REUDE Wind Turbine Blade Inspection Platform
 * Application Core Logic, Simulated Database Store, & AI Chatbot
 */

// ----------------------------------------------------
// STATE / SIMULATED DATABASE STORE
// ----------------------------------------------------
const appStore = {
  turbines: [
    { id: 1, name: "WTG-001", location: "Sector Alpha-1", age: "4.2 yrs", power: "2.1 MW", windSpeed: 12.4, rpm: 14.5, health: 96 },
    { id: 2, name: "WTG-002", location: "Sector Alpha-3", age: "4.2 yrs", power: "1.6 MW", windSpeed: 10.1, rpm: 11.2, health: 84 },
    { id: 3, name: "WTG-003", location: "Sector Beta-2", age: "1.8 yrs", power: "2.4 MW", windSpeed: 14.0, rpm: 16.1, health: 98 },
    { id: 4, name: "WTG-004", location: "Sector Beta-5", age: "3.5 yrs", power: "2.0 MW", windSpeed: 11.8, rpm: 13.8, health: 89 },
    { id: 5, name: "WTG-005", location: "Sector Gamma-1", age: "0.8 yrs", power: "2.3 MW", windSpeed: 13.2, rpm: 15.3, health: 99 },
    { id: 6, name: "WTG-006", location: "Sector Gamma-4", age: "5.1 yrs", power: "1.4 MW", windSpeed: 9.5, rpm: 10.0, health: 76 }
  ],
  anomalies: [
    { id: "DEF-001", turbineId: 2, blade: "B", type: "Crack", distance: 42, severity: 4, confidence: 92, action: "Schedule localized composite reinforcement injection", status: "pending", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 340, y: 78 }, details: "Spanwise crack starting at 42m from root. Depth estimated at 4.2mm. Dynamic load strain suggests micro-expansion." },
    { id: "DEF-002", turbineId: 2, blade: "A", type: "Erosion", distance: 15, severity: 2, confidence: 87, action: "Monitor during next routine quarterly schedule", status: "resolved", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 120, y: 68 }, details: "Leading edge surface gelcoat erosion due to rain impact. Surface roughening present. No fiber laminate damage." },
    { id: "DEF-003", turbineId: 1, blade: "C", type: "Delamination", distance: 58, severity: 3, confidence: 89, action: "Sanding and carbon-patch overlay in next dry window", status: "dispatched", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 480, y: 84 }, details: "Internal core-to-skin bond debonding detected by thermal phase thermography. Area is approx 240 sq cm." },
    { id: "DEF-004", turbineId: 4, blade: "A", type: "Erosion", distance: 22, severity: 3, confidence: 84, action: "Apply protective leading edge tape coating", status: "pending", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 210, y: 74 }, details: "Moderate surface pitting. Exceeding 10% surface area on blade segment. Standard drag coefficient affected." },
    { id: "DEF-005", turbineId: 6, blade: "B", type: "Crack", distance: 68, severity: 5, confidence: 96, action: "Immediate turbine aerodynamic brake, schedule blade replace", status: "pending", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 550, y: 86 }, details: "Critical transverse crack near blade tip. High risk of tip separation under gusts above 15 m/s. Structural integrity compromised." },
    { id: "DEF-006", turbineId: 6, blade: "B", type: "Erosion", distance: 12, severity: 1, confidence: 90, action: "No engineering action, cosmetic variance only", status: "resolved", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 90, y: 72 }, details: "Minor bug debris and micro-scratches. Non-consequential." },
    { id: "DEF-007", turbineId: 6, blade: "C", type: "Delamination", distance: 36, severity: 4, confidence: 91, action: "Schedule repair crew within 30 days", status: "dispatched", image: "images/turbine_inspect_rgb.png", thermal: "images/turbine_inspect_thermal.png", coords: { x: 290, y: 80 }, details: "Core shear delamination. Detected by acoustics and validated with thermal drone imagery. Defect area: 340 sq cm." }
  ],
  notifs: [
    { id: 1, type: "crit", text: "Turbine WTG-006: Severity-5 Crack detected near Tip", time: "5 mins ago" },
    { id: 2, type: "info", text: "MQTT stream connected to Gateway sector G-4", time: "15 mins ago" },
    { id: 3, type: "warn", text: "Turbine WTG-002: Confidence threshold alert (84% Health)", time: "1 hr ago" }
  ],
  activeTurbineId: 2,
  activeBlade: "B",
  activeReportId: "DEF-001"
};

// ----------------------------------------------------
// SOUND UTILITY (Web Audio API Synth Bleep)
// ----------------------------------------------------
function playNotificationSound(type = 'success') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    if (type === 'success') {
      // Modern high-tech double synth beep
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      
      osc.frequency.setValueAtTime(1320, audioCtx.currentTime + 0.08); // E6
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime + 0.08);
      
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'critical') {
      // Warning alarm synth blip
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.start();
      
      osc.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn("Audio Context block or unsupported browser: ", e);
  }
}

// ----------------------------------------------------
// UI ROUTER & CONTROLS
// ----------------------------------------------------
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  // Navigation button states
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  // Tab container states
  document.querySelectorAll('.tab-view').forEach(view => view.classList.remove('active-view'));
  const targetView = document.getElementById(`${tabName}-view`);
  if (targetView) targetView.classList.add('active-view');
  
  // Title update
  const titles = {
    "fleet-overview": { title: "Fleet Overview", subtitle: "Real-time status of all assets and anomalies" },
    "asset-detail": { title: "Asset Detail Analysis", subtitle: "Detailed blade structural diagrams & telemetry logs" },
    "report-viewer": { title: "Decision Report Viewer", subtitle: "Defect details, neural segmentation overlays, and engineering dispatches" },
    "ingestion-portal": { title: "Ingestion Portal API", subtitle: "Real-time edge gateway simulation & data uploads" }
  };
  
  if (titles[tabName]) {
    document.getElementById('view-title').innerText = titles[tabName].title;
    document.getElementById('view-subtitle').innerText = titles[tabName].subtitle;
  }
}

// ----------------------------------------------------
// FLEET OVERVIEW RENDERERS
// ----------------------------------------------------
function renderFleetOverview() {
  // Metrics calculation
  const totalTurbines = appStore.turbines.length;
  const healthSum = appStore.turbines.reduce((acc, t) => acc + t.health, 0);
  const avgHealth = (healthSum / totalTurbines).toFixed(1);
  
  const activeAnoms = appStore.anomalies.filter(a => a.status !== 'resolved').length;
  const avgConfidence = (appStore.anomalies.reduce((acc, a) => acc + a.confidence, 0) / appStore.anomalies.length).toFixed(1);

  document.getElementById('metric-health-index').innerText = `${avgHealth}%`;
  document.getElementById('metric-anomalies-count').innerText = activeAnoms;
  document.getElementById('metric-cv-confidence').innerText = `${avgConfidence}%`;
  
  // Interactive Fleet Grid Map
  const gridContainer = document.getElementById('wind-farm-grid-container');
  gridContainer.innerHTML = '';
  
  appStore.turbines.forEach(turbine => {
    let healthClass = "good";
    if (turbine.health < 80) healthClass = "critical";
    else if (turbine.health < 90) healthClass = "warning";
    
    // Windmill speed based on windSpeed
    const spinDuration = (30 / turbine.windSpeed).toFixed(2); // Faster wind = lower spin duration (faster spin)
    
    const node = document.createElement('div');
    node.className = `turbine-grid-node ${turbine.id === appStore.activeTurbineId ? 'active-node' : ''}`;
    node.innerHTML = `
      <div class="turbine-status-badge ${healthClass}"></div>
      <div class="turbine-graphic">
        <div class="windmill-mast"></div>
        <div class="windmill-blades" style="animation: spin-windmill ${spinDuration}s linear infinite">
          <div class="windmill-blade"></div>
          <div class="windmill-blade"></div>
          <div class="windmill-blade"></div>
        </div>
      </div>
      <div class="turbine-meta">
        <h4>${turbine.name}</h4>
        <span>Health: ${turbine.health}%</span>
      </div>
    `;
    
    node.addEventListener('click', () => {
      appStore.activeTurbineId = turbine.id;
      // Re-render overview and detail views
      renderFleetOverview();
      renderAssetDetail();
      // Auto routing to details
      switchTab('asset-detail');
      // Set dropdown selection
      document.getElementById('turbine-select-dropdown').value = turbine.id;
    });
    
    gridContainer.appendChild(node);
  });
  
  // Registry List (List with preview and icon template)
  const registryList = document.getElementById('asset-registry-list');
  registryList.innerHTML = '';
  
  // Apply current filters
  const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
  const filteredTurbines = appStore.turbines.filter(t => {
    if (activeFilter === 'warning') return t.health < 90;
    if (activeFilter === 'good') return t.health >= 90;
    return true;
  });
  
  filteredTurbines.forEach(t => {
    let healthClass = "good";
    if (t.health < 80) healthClass = "critical";
    else if (t.health < 90) healthClass = "warning";
    
    const turbineAnoms = appStore.anomalies.filter(a => a.turbineId === t.id && a.status !== 'resolved');
    const warningCount = turbineAnoms.filter(a => a.severity >= 4).length;
    
    const item = document.createElement('div');
    item.className = "asset-list-item";
    item.innerHTML = `
      <div class="asset-thumbnail">
        <img src="images/wind_farm_hero.png" alt="Turbine ${t.name}">
      </div>
      <div class="asset-desc">
        <h4>${t.name}</h4>
        <p>${t.location} • Age: ${t.age}</p>
      </div>
      <div class="asset-health-stat">
        <span>Health Index: <strong>${t.health}%</strong></span>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${healthClass}" style="width: ${t.health}%"></div>
        </div>
      </div>
      <div class="asset-anomaly-metric">
        <div class="icon-badge ${warningCount > 0 ? 'crit' : (turbineAnoms.length > 0 ? 'warn' : 'ok')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
        </div>
        <div class="asset-anom-info">
          <h5>${turbineAnoms.length} Active Defects</h5>
          <span>${warningCount} Critical (Sev 4+)</span>
        </div>
      </div>
      <div class="asset-specs">
        <span>Wind: <strong>${t.windSpeed} m/s</strong></span>
        <span>Power: <strong>${t.power}</strong></span>
      </div>
      <button class="asset-action-btn" data-id="${t.id}">Analyze Asset</button>
    `;
    
    item.querySelector('.asset-action-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      appStore.activeTurbineId = t.id;
      renderFleetOverview();
      renderAssetDetail();
      switchTab('asset-detail');
      document.getElementById('turbine-select-dropdown').value = t.id;
    });
    
    registryList.appendChild(item);
  });
}

// ----------------------------------------------------
// REGISTRY LIST FILTERS
// ----------------------------------------------------
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFleetOverview();
  });
});

// ----------------------------------------------------
// ASSET DETAIL RENDERERS
// ----------------------------------------------------
function renderAssetDetail() {
  const t = appStore.turbines.find(x => x.id === appStore.activeTurbineId);
  if (!t) return;
  
  // Fill dropdown selector
  const dropdown = document.getElementById('turbine-select-dropdown');
  dropdown.innerHTML = appStore.turbines.map(x => `
    <option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${x.name} - ${x.location}</option>
  `).join('');
  
  // Dynamic info sheet
  const activeAnoms = appStore.anomalies.filter(a => a.turbineId === t.id && a.status !== 'resolved');
  document.getElementById('turbine-info-sheet').innerHTML = `
    <div class="info-row-stat"><span>Fleet Status</span><strong class="${t.health < 80 ? 'text-critical' : (t.health < 90 ? 'text-warning' : 'text-ok')}">${t.health < 80 ? 'CRITICAL RISK' : (t.health < 90 ? 'ATTENTION REQUIRED' : 'NOMINAL HEALTH')}</strong></div>
    <div class="info-row-stat"><span>Age / Commissioned</span><strong>${t.age} / 2022</strong></div>
    <div class="info-row-stat"><span>Power Generation</span><strong>${t.power} (Max 2.5 MW)</strong></div>
    <div class="info-row-stat"><span>Rotor Diameter</span><strong>126 meters</strong></div>
    <div class="info-row-stat"><span>Current Wind Speed</span><strong>${t.windSpeed} m/s</strong></div>
    <div class="info-row-stat"><span>Rotor Rotation Speed</span><strong>${t.rpm} RPM</strong></div>
    <div class="info-row-stat"><span>Active Anomalies</span><strong>${activeAnoms.length} detected</strong></div>
    <div class="info-row-stat"><span>Last Inspection</span><strong>June 12, 2026</strong></div>
  `;
  
  // Render interactive SVG blade
  renderBladeSchematic();
  
  // Render anomalies table
  renderAnomaliesTable(t.id);
}

// Dropdown change listener
document.getElementById('turbine-select-dropdown').addEventListener('change', (e) => {
  appStore.activeTurbineId = parseInt(e.target.value);
  renderAssetDetail();
});

// Blade tab switcher
document.querySelectorAll('.blade-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.blade-tab').forEach(b => b.classList.remove('active'));
    tab.classList.add('active');
    appStore.activeBlade = tab.getAttribute('data-blade');
    renderBladeSchematic();
  });
});

function renderBladeSchematic() {
  const wrapper = document.getElementById('blade-svg-wrapper');
  wrapper.innerHTML = '';
  
  // Dynamic filters based on active selection
  const activeAnoms = appStore.anomalies.filter(a => 
    a.turbineId === appStore.activeTurbineId && 
    a.blade === appStore.activeBlade
  );
  
  // Create dynamic SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 600 150");
  svg.setAttribute("class", "blade-svg");
  
  // Blade Shape outline (Aesthetic aerofoil curve stretching left to right)
  const bladePath = `
    M 40,75 
    C 50,55 90,45 150,42
    C 280,36 480,55 560,70
    C 570,72 580,74 580,75
    C 580,76 570,78 560,80
    C 480,95 280,114 150,108
    C 90,105 50,95 40,75 Z
  `;
  
  const pathElem = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathElem.setAttribute("d", bladePath);
  pathElem.setAttribute("class", "blade-outline");
  svg.appendChild(pathElem);
  
  // Grid reference marks (Distance indicators)
  for (let m = 100; m < 550; m += 100) {
    const mark = document.createElementNS("http://www.w3.org/2000/svg", "line");
    mark.setAttribute("x1", m);
    mark.setAttribute("y1", 60);
    mark.setAttribute("x2", m);
    mark.setAttribute("y2", 90);
    mark.setAttribute("stroke", "rgba(255,255,255,0.06)");
    mark.setAttribute("stroke-width", "1");
    svg.appendChild(mark);
    
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", m - 10);
    txt.setAttribute("y", 102);
    txt.setAttribute("fill", "rgba(255,255,255,0.2)");
    txt.setAttribute("font-size", "8");
    txt.setAttribute("font-family", "JetBrains Mono");
    txt.textContent = `${Math.round(m / 7)}m`;
    svg.appendChild(txt);
  }
  
  // Plot defect hotspots
  activeAnoms.forEach(anom => {
    let color = "#00F2FE"; // Erosion / Cyan
    if (anom.type === 'Crack') color = "#FF3366"; // Red
    else if (anom.type === 'Delamination') color = "#F2C94C"; // Yellow
    
    // Group for nodes
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "hotspot-group");
    
    // Inner pulse ring
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", anom.coords.x);
    ring.setAttribute("cy", anom.coords.y);
    ring.setAttribute("r", 8);
    ring.setAttribute("stroke", color);
    ring.setAttribute("class", "hotspot-ring");
    group.appendChild(ring);
    
    // Main dot node
    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", anom.coords.x);
    node.setAttribute("cy", anom.coords.y);
    node.setAttribute("r", 6);
    node.setAttribute("fill", color);
    node.setAttribute("class", "hotspot-node");
    node.style.color = color;
    
    // Click handles routing to Report Viewer
    node.addEventListener('click', () => {
      appStore.activeReportId = anom.id;
      renderReportViewer();
      switchTab('report-viewer');
    });
    
    group.appendChild(node);
    
    // Tooltip hover elements
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${anom.id}: ${anom.type} (Sev ${anom.severity}) at ${anom.distance}m`;
    node.appendChild(title);
    
    svg.appendChild(group);
  });
  
  wrapper.appendChild(svg);
}

function renderAnomaliesTable(turbineId) {
  const tbody = document.getElementById('anomaly-table-body');
  tbody.innerHTML = '';
  
  const list = appStore.anomalies.filter(a => a.turbineId === turbineId);
  
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: hsl(var(--text-muted));">No defects detected on this asset. Clean status index.</td></tr>`;
    return;
  }
  
  list.forEach(a => {
    let actionPriority = "p-medium";
    if (a.severity === 5) actionPriority = "p-critical";
    else if (a.severity === 4) actionPriority = "p-high";
    else if (a.severity <= 2) actionPriority = "p-low";
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 700;">${a.id}</td>
      <td style="font-weight: 600;">Blade ${a.blade}</td>
      <td><strong>${a.type}</strong> <span style="color: hsl(var(--text-muted));">(${a.distance}m)</span></td>
      <td style="font-family: var(--font-mono);">${a.confidence}%</td>
      <td><span class="severity-pill sev-${a.severity}">SEV ${a.severity}</span></td>
      <td>${a.action}</td>
      <td><span class="priority-tag ${actionPriority}">${actionPriority.replace('p-', '').toUpperCase()}</span></td>
      <td><span class="status-badge ${a.status}">${a.status.toUpperCase()}</span></td>
      <td><button class="btn btn-secondary btn-sm" data-report-id="${a.id}">Review</button></td>
    `;
    
    tr.querySelector('button').addEventListener('click', () => {
      appStore.activeReportId = a.id;
      renderReportViewer();
      switchTab('report-viewer');
    });
    
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// REPORT VIEWER RENDERERS
// ----------------------------------------------------
let zoomScale = 1;
let transX = 0;
let transY = 0;
let isDragging = false;
let startX, startY;

function renderReportViewer() {
  const anom = appStore.anomalies.find(a => a.id === appStore.activeReportId);
  if (!anom) return;
  
  // Set title
  document.getElementById('visualizer-title').innerText = `CV Inspection Viewer: ${anom.id}`;
  
  // Load images
  const rgbImg = document.getElementById('view-img-rgb');
  const thermalImg = document.getElementById('view-img-thermal');
  
  // If user uploaded custom media, show it
  rgbImg.src = anom.image;
  thermalImg.src = anom.thermal;
  
  // Reset zoom styles
  zoomScale = 1;
  transX = 0;
  transY = 0;
  applyImageTransforms();
  
  // Reset opacity blending slider
  document.getElementById('rgb-thermal-slider').value = 0;
  thermalImg.style.opacity = 0;
  
  // Draw SVG masks overlay based on defect type
  const svgOverlay = document.getElementById('canvas-overlay');
  svgOverlay.innerHTML = '';
  
  // Make overlays responsive
  if (document.getElementById('mask-toggle').checked) {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    let color = "rgba(0, 242, 254, 0.4)";
    let strokeColor = "#00F2FE";
    let points = "280,240 310,210 390,260 380,310 320,290"; // default mock polygon coordinates
    
    if (anom.type === 'Crack') {
      color = "rgba(255, 51, 102, 0.3)";
      strokeColor = "#FF3366";
      points = "350,180 355,182 370,240 365,280 340,320 338,318 360,250 348,190"; // Crack lines
    } else if (anom.type === 'Delamination') {
      color = "rgba(242, 201, 76, 0.3)";
      strokeColor = "#F2C94C";
      points = "220,150 300,120 420,180 380,260 260,240"; // Delamination patch
    }
    
    polygon.setAttribute("points", points);
    polygon.setAttribute("fill", color);
    polygon.setAttribute("stroke", strokeColor);
    polygon.setAttribute("stroke-width", "3");
    polygon.setAttribute("stroke-linejoin", "round");
    polygon.setAttribute("filter", "drop-shadow(0 0 6px " + strokeColor + ")");
    svgOverlay.appendChild(polygon);
    
    // Add text label overlay
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", parseInt(points.split(' ')[0].split(',')[0]) + 10);
    text.setAttribute("y", parseInt(points.split(' ')[0].split(',')[1]) - 10);
    text.setAttribute("fill", strokeColor);
    text.setAttribute("font-size", "14");
    text.setAttribute("font-family", "Outfit");
    text.setAttribute("font-weight", "bold");
    text.textContent = `${anom.type} (${anom.confidence}% CV confidence)`;
    svgOverlay.appendChild(text);
  }
  
  // Update details panel
  let priority = "MEDIUM";
  let priClass = "p-medium";
  if (anom.severity === 5) { priority = "CRITICAL"; priClass = "p-critical"; }
  else if (anom.severity === 4) { priority = "HIGH"; priClass = "p-high"; }
  else if (anom.severity <= 2) { priority = "LOW"; priClass = "p-low"; }
  
  const priorityBadge = document.getElementById('report-priority');
  priorityBadge.innerText = priority;
  priorityBadge.className = `priority-tag ${priClass}`;
  
  const turbine = appStore.turbines.find(t => t.id === anom.turbineId);
  document.getElementById('report-details-panel').innerHTML = `
    <div class="assessment-section">
      <h4>Classification details</h4>
      <p><strong>Anomaly ID:</strong> ${anom.id}</p>
      <p><strong>Target Asset:</strong> ${turbine ? turbine.name : 'Unknown'} (${turbine ? turbine.location : 'Unknown'})</p>
      <p><strong>Blade Segment:</strong> Blade ${anom.blade} (Location: ${anom.distance} meters from root)</p>
      <p><strong>Defect Class:</strong> ${anom.type}</p>
    </div>
    
    <div class="assessment-section mt-3">
      <h4>Telemetry Lineage & Provenance</h4>
      <p>${anom.details}</p>
    </div>
    
    <div class="assessment-section mt-3">
      <h4>Active Decision Rules Triggered</h4>
      <ul class="rules-fired-list">
        <li class="rule-item">
          <span class="rule-icon">⚠️</span>
          <span>Rule [ST-294]: Critical crack structural threshold exceeded</span>
        </li>
        <li class="rule-item">
          <span class="rule-icon">⚠️</span>
          <span>Rule [TL-105]: Temporal progression analysis indicates growth of 14% vs. Q1</span>
        </li>
      </ul>
    </div>
    
    <div class="assessment-section mt-3">
      <h4>Recommended Engineering Action</h4>
      <p style="color: #00F2FE; font-weight: 600;">${anom.action}</p>
    </div>
  `;
}

// RGB/Thermal crossfade blender slider
document.getElementById('rgb-thermal-slider').addEventListener('input', (e) => {
  const val = e.target.value / 100;
  document.getElementById('view-img-thermal').style.opacity = val;
});

// Mask toggle checkbox listener
document.getElementById('mask-toggle').addEventListener('change', () => {
  renderReportViewer();
});

// Zoom controller
document.getElementById('zoom-in').addEventListener('click', () => {
  zoomScale += 0.25;
  if (zoomScale > 4) zoomScale = 4;
  applyImageTransforms();
});

document.getElementById('zoom-out').addEventListener('click', () => {
  zoomScale -= 0.25;
  if (zoomScale < 0.75) zoomScale = 0.75;
  applyImageTransforms();
});

document.getElementById('reset-zoom').addEventListener('click', () => {
  zoomScale = 1;
  transX = 0;
  transY = 0;
  applyImageTransforms();
});

function applyImageTransforms() {
  const rgbImg = document.getElementById('view-img-rgb');
  const thermalImg = document.getElementById('view-img-thermal');
  const svgOverlay = document.getElementById('canvas-overlay');
  
  const transformStyle = `scale(${zoomScale}) translate(${transX}px, ${transY}px)`;
  rgbImg.style.transform = transformStyle;
  thermalImg.style.transform = transformStyle;
  svgOverlay.style.transform = transformStyle;
  
  document.getElementById('lens-indicator').innerText = `Zoom: ${Math.round(zoomScale * 100)}%`;
}

// Drag navigation in visualizer frame
const frame = document.getElementById('visualizer-frame');
frame.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX - transX;
  startY = e.clientY - transY;
  frame.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
  isDragging = false;
  frame.style.cursor = 'default';
});

frame.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  transX = (e.clientX - startX);
  transY = (e.clientY - startY);
  applyImageTransforms();
});

// Dispatch Order Action Button simulation
document.getElementById('btn-approve-action').addEventListener('click', () => {
  const anom = appStore.anomalies.find(a => a.id === appStore.activeReportId);
  if (!anom) return;
  
  if (anom.status === 'pending') {
    anom.status = 'dispatched';
    playNotificationSound('success');
    alert(`DISPATCH ORDER CONFIRMED: Work order has been issued to Field Operations for Turbine: ${anom.turbineId === 2 ? 'WTG-002' : 'Asset'}.`);
    renderAssetDetail();
    renderReportViewer();
  } else {
    alert("This work order is already approved/dispatched.");
  }
});

// Export PDF Button simulation
document.getElementById('btn-export-pdf').addEventListener('click', () => {
  playNotificationSound('success');
  alert("PDF generated and downloaded. Check your local reports directory.");
});

// ----------------------------------------------------
// REAL-TIME INGESTION PORTAL LOGIC
// ----------------------------------------------------
const dragZone = document.getElementById('drag-drop-zone');
const fileInput = document.getElementById('ingest-file-input');
let uploadedFileUrl = "images/turbine_inspect_rgb.png"; // Default image path if none uploaded
let uploadedFileName = "";
let uploadedFileSize = "";
let uploadedFileType = "image";

// Drag and drop events
dragZone.addEventListener('click', () => fileInput.click());

dragZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dragZone.classList.add('drag-over');
});

dragZone.addEventListener('dragleave', () => {
  dragZone.classList.remove('drag-over');
});

dragZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', () => {
  if (fileInput.files.length > 0) {
    handleFile(fileInput.files[0]);
  }
});

function handleFile(file) {
  uploadedFileName = file.name;
  uploadedFileSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";
  uploadedFileType = file.type.startsWith('video/') ? 'video' : 'image';
  
  // Create object URL for local display
  uploadedFileUrl = URL.createObjectURL(file);
  
  // Show preview
  document.getElementById('preview-file-name').innerText = uploadedFileName;
  document.getElementById('preview-file-size').innerText = uploadedFileSize;
  
  const holder = document.getElementById('preview-media-holder');
  holder.innerHTML = '';
  
  if (uploadedFileType === 'video') {
    const video = document.createElement('video');
    video.src = uploadedFileUrl;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    holder.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = uploadedFileUrl;
    holder.appendChild(img);
  }
  
  dragZone.style.display = 'none';
  document.getElementById('upload-preview-container').style.display = 'block';
}

document.getElementById('btn-remove-preview').addEventListener('click', () => {
  uploadedFileUrl = "images/turbine_inspect_rgb.png";
  dragZone.style.display = 'flex';
  document.getElementById('upload-preview-container').style.display = 'none';
  fileInput.value = '';
});

// Form Submission (Adding to database store & MQTT alerts)
document.getElementById('ingest-form').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const btnSpinner = document.getElementById('btn-spinner');
  const submitBtn = document.getElementById('btn-submit-ingest');
  
  // Show loading spinner (Simulates P95 latency ingest under 500ms)
  btnSpinner.style.display = 'inline-block';
  submitBtn.disabled = true;
  
  setTimeout(() => {
    // Ingest data extraction
    const targetAssetId = parseInt(document.getElementById('ingest-asset-id').value);
    const blade = document.getElementById('ingest-blade').value;
    const defectClass = document.getElementById('ingest-defect-class').value;
    const severity = parseInt(document.getElementById('ingest-severity').value);
    const confidence = parseInt(document.getElementById('ingest-confidence').value);
    const dist = parseInt(document.getElementById('ingest-dist').value);
    const action = document.getElementById('ingest-action').value;
    
    // Generate new defect ID
    const newId = `DEF-00${appStore.anomalies.length + 1}`;
    
    // Custom plotted coordinates logic
    const xCoord = Math.min(Math.max(dist * 7, 50), 550);
    const yCoord = 70 + Math.floor(Math.random() * 20) - 10;
    
    const newAnomaly = {
      id: newId,
      turbineId: targetAssetId,
      blade: blade,
      type: defectClass,
      distance: dist,
      severity: severity,
      confidence: confidence,
      action: action,
      status: "pending",
      image: uploadedFileUrl,
      thermal: uploadedFileUrl === "images/turbine_inspect_rgb.png" ? "images/turbine_inspect_thermal.png" : uploadedFileUrl, // if custom uploaded, map to both modes
      coords: { x: xCoord, y: yCoord },
      details: `In-situ real-time telemetry uploaded via Ingestion Portal. Located at ${dist}m on Blade ${blade}. Confidence rating is ${confidence}% relative to neural classifier.`
    };
    
    // Add anomaly to store
    appStore.anomalies.unshift(newAnomaly);
    
    // Recalculate Turbine Health
    const turbine = appStore.turbines.find(t => t.id === targetAssetId);
    if (turbine) {
      // Health decreases by severity factor
      const deduc = severity * 6;
      turbine.health = Math.max(10, turbine.health - deduc);
    }
    
    // Create MQTT live log alert
    const newAlert = {
      id: appStore.notifs.length + 1,
      type: severity >= 4 ? 'crit' : 'warn',
      text: `${turbine ? turbine.name : 'Asset'}: Severity-${severity} ${defectClass} ingested at ${dist}m.`,
      time: "Just now"
    };
    appStore.notifs.unshift(newAlert);
    
    // Trigger success notification / alert sound
    if (severity >= 4) {
      playNotificationSound('critical');
    } else {
      playNotificationSound('success');
    }
    
    // Re-render components
    renderFleetOverview();
    renderAssetDetail();
    updateNotifications();
    addMQTTLiveLogEntry(newAnomaly, turbine ? turbine.name : 'Asset');
    
    // Reset form states
    btnSpinner.style.display = 'none';
    submitBtn.disabled = false;
    document.getElementById('ingest-form').reset();
    document.getElementById('btn-remove-preview').click();
    
    // Highlight notification bell
    const notifBtn = document.getElementById('notif-btn');
    notifBtn.style.animation = 'pulse-ring 1s';
    setTimeout(() => notifBtn.style.animation = '', 1000);
    
    alert(`DATA INGESTION SUCCESS: CV Payload added with database identifier [${newId}]. Metrics synchronized.`);
    
    // Auto switch to Fleet Overview to see results
    switchTab('fleet-overview');
  }, 450); // Simulate network roundtrip latency <500ms
});

function addMQTTLiveLogEntry(anom, turbineName) {
  const telemetriesList = document.getElementById('telemetries-list');
  const entry = document.createElement('div');
  entry.className = `log-entry ${anom.severity >= 4 ? 'crit' : 'warn'}`;
  
  entry.innerHTML = `
    <div class="log-header">
      <span class="log-title">[MQTT RECEIVED] rotrix/${turbineName}/anomaly</span>
      <span class="log-time">Just Now</span>
    </div>
    <div class="log-payload">
      payload: {"id":"${anom.id}","blade":"${anom.blade}","type":"${anom.type}","severity":${anom.severity},"confidence":${anom.confidence/100}}
    </div>
  `;
  
  telemetriesList.insertBefore(entry, telemetriesList.firstChild);
  if (telemetriesList.children.length > 5) {
    telemetriesList.removeChild(telemetriesList.lastChild);
  }
}

// ----------------------------------------------------
// MQTT LOG SEED DATA POPULATOR
// ----------------------------------------------------
function seedMQTTLog() {
  const telemetriesList = document.getElementById('telemetries-list');
  telemetriesList.innerHTML = '';
  
  const mockMQTT = [
    { name: "WTG-006", id: "DEF-005", blade: "B", type: "Crack", severity: 5, confidence: 0.96 },
    { name: "WTG-002", id: "DEF-001", blade: "B", type: "Crack", severity: 4, confidence: 0.92 },
    { name: "WTG-001", id: "DEF-003", blade: "C", type: "Delamination", severity: 3, confidence: 0.89 },
    { name: "WTG-004", id: "DEF-004", blade: "A", type: "Erosion", severity: 3, confidence: 0.84 }
  ];
  
  mockMQTT.forEach(m => {
    const entry = document.createElement('div');
    entry.className = `log-entry ${m.severity >= 4 ? 'crit' : 'warn'}`;
    entry.innerHTML = `
      <div class="log-header">
        <span class="log-title">[MQTT RECEIVED] rotrix/${m.name}/anomaly</span>
        <span class="log-time">Active Stream</span>
      </div>
      <div class="log-payload">
        payload: {"id":"${m.id}","blade":"${m.blade}","type":"${m.type}","severity":${m.severity},"confidence":${m.confidence}}
      </div>
    `;
    telemetriesList.appendChild(entry);
  });
}

// ----------------------------------------------------
// NOTIFICATION SYSTEM
// ----------------------------------------------------
document.getElementById('notif-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('notif-dropdown').classList.toggle('show');
});

window.addEventListener('click', () => {
  document.getElementById('notif-dropdown').classList.remove('show');
});

document.getElementById('notif-dropdown').addEventListener('click', (e) => {
  e.stopPropagation();
});

document.getElementById('clear-notifs-btn').addEventListener('click', () => {
  appStore.notifs = [];
  updateNotifications();
});

function updateNotifications() {
  const count = document.getElementById('notif-count');
  count.innerText = appStore.notifs.length;
  count.style.display = appStore.notifs.length === 0 ? 'none' : 'flex';
  
  const list = document.getElementById('notif-list');
  list.innerHTML = '';
  
  if (appStore.notifs.length === 0) {
    list.innerHTML = `<p style="padding: 12px; font-size: 0.8rem; text-align: center; color: hsl(var(--text-muted));">No new stream alerts</p>`;
    return;
  }
  
  appStore.notifs.forEach(n => {
    const div = document.createElement('div');
    div.className = `notif-item ${n.type}`;
    div.innerHTML = `
      <p>${n.text}</p>
      <span class="notif-time">${n.time}</span>
    `;
    list.appendChild(div);
  });
}

// ----------------------------------------------------
// LOCAL AI ASSISTANT / CHATBOT ENGINE
// ----------------------------------------------------
const chatbotTrigger = document.getElementById('ai-trigger');
const chatbotWindow = document.getElementById('ai-chat-window');
const chatClose = document.getElementById('close-chat-btn');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('send-chat-btn');
const messagesContainer = document.getElementById('chat-messages-container');

chatbotTrigger.addEventListener('click', () => {
  chatbotWindow.classList.toggle('show');
});

chatClose.addEventListener('click', () => {
  chatbotWindow.classList.remove('show');
});

chatSend.addEventListener('click', handleChatSubmit);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleChatSubmit();
});

// Suggestions queries handler
document.querySelectorAll('.suggestion-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const query = btn.getAttribute('data-query');
    chatInput.value = query;
    handleChatSubmit();
  });
});

function handleChatSubmit() {
  const query = chatInput.value.trim();
  if (!query) return;
  
  // Clear input
  chatInput.value = '';
  
  // Append user bubble
  appendChatBubble(query, 'user');
  
  // Display typing state bubble
  const typingBubble = appendChatBubble(`<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`, 'assistant typing');
  
  // Process response (simulated logic delay)
  setTimeout(() => {
    typingBubble.remove(); // remove typing bubble
    const answer = parseQueryAndCalculateAnswer(query);
    appendChatBubble(answer, 'assistant');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }, 650);
}

function appendChatBubble(content, type) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${type}`;
  bubble.innerHTML = content;
  messagesContainer.appendChild(bubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  return bubble;
}

function parseQueryAndCalculateAnswer(query) {
  const lower = query.toLowerCase();
  
  // Check 1: "Show critical cracks" or "severity 4 and 5 defects"
  if (lower.includes('severity 4') || lower.includes('severity 5') || lower.includes('critical') || lower.includes('cracks')) {
    const criticals = appStore.anomalies.filter(a => a.severity >= 4);
    if (criticals.length === 0) {
      return "There are currently no severity 4 or 5 defects detected in the active fleet registry database.";
    }
    
    let response = "I found <strong>" + criticals.length + " critical anomalies</strong> (Severity 4-5) requiring structural attention:<br><ul>";
    criticals.forEach(c => {
      const t = appStore.turbines.find(x => x.id === c.turbineId);
      response += `<li><strong>${c.id} (${c.type}):</strong> on <strong>${t ? t.name : 'Unknown'}</strong> (Blade ${c.blade}, distance ${c.distance}m) with confidence ${c.confidence}%. Action: <span style="color:#00F2FE;">${c.action}</span></li>`;
    });
    response += "</ul>";
    return response;
  }
  
  // Check 2: "What is the health status of Turbine X?"
  const turbineMatch = lower.match(/turbine\s*(\d+)/) || lower.match(/wtg-00(\d+)/);
  if (turbineMatch) {
    const id = parseInt(turbineMatch[1]);
    const t = appStore.turbines.find(x => x.id === id);
    if (!t) {
      return `I could not locate Turbine WTG-00${id} in Sector Database registry files. Valid identifiers are WTG-001 through WTG-006.`;
    }
    
    const defects = appStore.anomalies.filter(a => a.turbineId === t.id && a.status !== 'resolved');
    let response = `<strong>${t.name} (Location: ${t.location}) Telemetry:</strong><br>`;
    response += `• <strong>Health Index:</strong> ${t.health}%<br>`;
    response += `• <strong>Power Output:</strong> ${t.power}<br>`;
    response += `• <strong>Wind Speed:</strong> ${t.windSpeed} m/s @ ${t.rpm} RPM<br>`;
    response += `• <strong>Active Defects:</strong> ${defects.length} detected.<br>`;
    
    if (defects.length > 0) {
      response += `<ul>`;
      defects.forEach(d => {
        response += `<li>Blade ${d.blade}: Sev-${d.severity} ${d.type} at ${d.distance}m (${d.status})</li>`;
      });
      response += `</ul>`;
    } else {
      response += `• Status is normal. No structural anomalies registered.`;
    }
    return response;
  }
  
  // Check 3: "highest risk index" or "lowest health"
  if (lower.includes('highest risk') || lower.includes('lowest health') || lower.includes('dangerous') || lower.includes('worst turbine')) {
    const sorted = [...appStore.turbines].sort((a, b) => a.health - b.health);
    const worst = sorted[0];
    const defects = appStore.anomalies.filter(a => a.turbineId === worst.id && a.status !== 'resolved');
    
    return `The turbine with the **highest risk index** is <strong>${worst.name}</strong> at <strong>${worst.health}% Health</strong> in ${worst.location}. It has ${defects.length} active defects. The most critical is a Severity-${Math.max(...defects.map(d=>d.severity))} anomaly. Immediate maintenance dispatch recommended.`;
  }
  
  // Check 4: "actions for Turbine X"
  if (lower.includes('recommended actions') || lower.includes('actions for')) {
    const activeT = appStore.turbines.find(t => lower.includes(t.name.toLowerCase()) || lower.includes(`turbine ${t.id}`));
    const searchId = activeT ? activeT.id : appStore.activeTurbineId;
    const targetT = appStore.turbines.find(x => x.id === searchId);
    
    const defects = appStore.anomalies.filter(a => a.turbineId === searchId && a.status !== 'resolved');
    if (defects.length === 0) {
      return `There are no active recommended actions for **${targetT.name}** since its status is healthy.`;
    }
    
    let response = `Recommended engineering dispatches for <strong>${targetT.name}</strong>:<br><ul>`;
    defects.forEach(d => {
      response += `<li><strong>Blade ${d.blade} (${d.type}):</strong> ${d.action}</li>`;
    });
    response += `</ul>`;
    return response;
  }
  
  // Check 5: REUDE details
  if (lower.includes('reude') || lower.includes('who are you')) {
    return "REUDE Technologies is an AI-driven hardware-software leader specializing in autonomous UAV systems, drone-based industrial inspections, and edge intelligence. This platform is the operator's digital cockpit, translating cv detection metadata into structured engineering maintenance decisions.";
  }
  
  // Check 6: "defect types" or "classes"
  if (lower.includes('defect') || lower.includes('classes') || lower.includes('categories')) {
    return "Our CV inspection model classifies defects into four primary classes:<br>1. **Structural Crack**: Fractures in structural laminate skins. Critical safety risks.<br>2. **Delamination**: Debonding between skin fibers and shear core composites.<br>3. **Surface Erosion**: Paint/gelcoat pitting caused by rain drop impacts.<br>4. **Lightning Strike**: High-voltage burns resulting in delaminated composite arcs.";
  }
  
  // Fallback assistant response
  return "I understand your query. As your wind inspection copilot, I can process fleet status questions. Try asking: <em>'Show critical cracks on the turbines'</em> or <em>'Compare health metrics for WTG-002'</em>.";
}

// ----------------------------------------------------
// NATIONAL LANGUAGE HEADER SEARCH BAR BAR ENGINE
// ----------------------------------------------------
const nlInput = document.getElementById('nl-query-input');
const nlBtn = document.getElementById('nl-query-btn');

nlBtn.addEventListener('click', executeNLSearch);
nlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') executeNLSearch();
});

function executeNLSearch() {
  const val = nlInput.value.trim();
  if (!val) return;
  
  // Clear input
  nlInput.value = '';
  
  // Open chatbot assistant and feed it
  chatbotWindow.classList.add('show');
  chatInput.value = val;
  handleChatSubmit();
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  renderFleetOverview();
  renderAssetDetail();
  renderReportViewer();
  updateNotifications();
  seedMQTTLog();
  
  // Quick startup beep
  setTimeout(() => playNotificationSound('success'), 800);
});
