'use strict';
/*
 * Inspections tab: the ML inspections the team publishes from CompliQ Inspection Studio straight into D1 + R2.
 * Reads them through the Worker's existing routes (organization-scoped, read-only roles see published only):
 *   GET /api/turbines, /api/turbines/:id/inspections, /api/inspections/:id/points, /api/points/:id/image,
 *   GET /api/classes, /api/severity-levels; reviewers can PATCH /api/detections/:id (confirm, reject, set CAT).
 * Also merges turbines added in the Inspection Studio into the dashboard's fleet list (mergeIntoFleet).
 */
(() => {
  const SIDES = ['SS', 'LE', 'PS', 'TE'];
  const SIDE_NAMES = { SS: 'Suction side', LE: 'Leading edge', PS: 'Pressure side', TE: 'Trailing edge' };
  const LETTER = { 1: 'A', 2: 'B', 3: 'C' };
  const CAT_FALLBACK = {
    1: { name: 'Cosmetic', colour: '#2F6FB3' }, 2: { name: 'Minor', colour: '#2E9D58' }, 3: { name: 'Moderate', colour: '#C99A06' },
    4: { name: 'Serious', colour: '#E07B2E' }, 5: { name: 'Critical', colour: '#D03B3B' }
  };
  const REVIEW_ROLES = ['Administrator', 'Fleet Operator', 'Maintenance Engineer'];
  const S = {
    ready: false, turbines: [], org: '', turbineId: null, inspections: [], inspectionId: null, data: null,
    points: new Map(), byCode: new Map(), dets: new Map(), pointId: null, classes: {}, levels: { ...CAT_FALLBACK },
    images: new Map(), filter: 'all', showBoxes: true
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const api = (route, options) => window.CompliQApi.request(route, options);
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '—');
  const user = () => { try { return JSON.parse(localStorage.getItem('compliq_session') || 'null'); } catch (_) { return null; } };
  const canReview = () => { const u = user(); return !!(u && (u.globalAdmin || REVIEW_ROLES.includes(u.role))); };
  const catOf = (d) => d.severity ?? d.severity_suggested;
  const catColour = (c) => (S.levels[c] || CAT_FALLBACK[c] || {}).colour || '#888';
  const catName = (c) => (S.levels[c] || CAT_FALLBACK[c] || {}).name || '';
  const label = (code) => S.classes[code]?.label || code;
  const live = (d) => d.review_status !== 'rejected';
  const toast = (msg, kind) => (typeof window.showToast === 'function' ? window.showToast(msg, kind) : console.log(msg));

  function describe(p) {
    if (!p) return '';
    if (p.component && p.component !== 'blade') return `${p.component === 'nacelle' ? 'Nacelle / rotor' : 'Tower'} · photo ${p.point}`;
    const serial = S.data?.blades?.find((b) => b.blade === p.blade)?.serial;
    return `Blade ${LETTER[p.blade]}${serial ? ` (${esc(serial)})` : ''} · ${SIDE_NAMES[p.side]} · P${String(p.point).padStart(2, '0')}${p.distance_m != null ? ` · ${Number(p.distance_m).toFixed(1)} m from root` : ''}`;
  }
  const catBadge = (c, suggested) => (c ? `<span class="insp-cat" style="background:${catColour(c)}" title="CAT ${c} ${esc(catName(c))}${suggested ? ' (suggested by the model)' : ''}">CAT ${c}${suggested ? '<i>s</i>' : ''}</span>` : '');

  // ---------------------------------------------------------------- shell
  function shell(root) {
    root.innerHTML = `<div class="insp-shell">
      <aside class="panel insp-turbines">
        <div class="panel-header"><div><h3>Turbines</h3><p id="insp-count">Loading…</p></div>
          <button class="view-btn" id="insp-refresh" type="button">Refresh</button></div>
        <div class="insp-orgfilter" id="insp-orgwrap" hidden><select id="insp-org" class="insp-select" aria-label="Organization"></select></div>
        <div class="panel-body insp-tlist" id="insp-tlist"></div>
      </aside>
      <div class="insp-main" id="insp-main"><div class="panel insp-empty"><p>Loading inspections…</p></div></div>
    </div>`;
    $('#insp-refresh').addEventListener('click', () => loadTurbines(true));
    $('#insp-org').addEventListener('change', (e) => { S.org = e.target.value; renderTurbineList(); });
  }

  async function loadReference() {
    try {
      const [cls, lv] = await Promise.all([api('/classes'), api('/severity-levels')]);
      S.classes = Object.fromEntries((cls.classes || []).map((c) => [c.code, c]));
      (lv.levels || []).forEach((l) => { S.levels[l.cat] = l; });
    } catch (_) { /* labels fall back to codes */ }
  }

  async function open() {
    const root = document.getElementById('insp-root');
    if (!root) return;
    if (!S.ready) { shell(root); S.ready = true; await loadReference(); }
    await loadTurbines(false);
  }

  // ---------------------------------------------------------------- turbines
  async function loadTurbines(force) {
    let turbines = [];
    try { turbines = (await api('/turbines')).turbines || []; }
    catch (e) { $('#insp-main').innerHTML = `<div class="panel insp-empty"><p>Could not load inspections: ${esc(e.message)}</p></div>`; return; }
    S.turbines = turbines;
    const orgs = [...new Map(turbines.map((t) => [t.org_id, t.org_name])).entries()];
    const wrap = $('#insp-orgwrap');
    wrap.hidden = orgs.length < 2;
    if (orgs.length > 1) {
      $('#insp-org').innerHTML = `<option value="">All organizations</option>` + orgs.map(([id, n]) => `<option value="${esc(id)}" ${id === S.org ? 'selected' : ''}>${esc(n)}</option>`).join('');
    }
    renderTurbineList();
    const keep = turbines.find((t) => t.id === S.turbineId);
    const first = keep || turbines.find((t) => t.latest_inspection_id) || turbines[0];
    if (!first) {
      $('#insp-main').innerHTML = `<div class="panel insp-empty"><h3>No inspections yet</h3><p>When the ML team publishes an inspection from CompliQ Inspection Studio, the turbine and its blade findings appear here.</p></div>`;
      return;
    }
    if (force || !keep) await selectTurbine(first.id);
    else await selectTurbine(first.id, S.inspectionId);
  }

  function renderTurbineList() {
    const list = S.turbines.filter((t) => !S.org || t.org_id === S.org);
    const many = new Set(S.turbines.map((t) => t.org_id)).size > 1;
    $('#insp-count').textContent = `${list.length} turbine${list.length === 1 ? '' : 's'} with inspection data`;
    $('#insp-tlist').innerHTML = list.map((t) => `<button type="button" class="insp-titem ${t.id === S.turbineId ? 'active' : ''}" data-tid="${esc(t.id)}">
        <span class="insp-tcode">${esc(t.code)}${t.worst_cat ? catBadge(t.worst_cat) : ''}</span>
        <span class="insp-tname">${esc(t.name && t.name !== t.code ? t.name : (t.site || ''))}</span>
        <span class="insp-tmeta">${t.latest_inspection_date ? `Last inspected ${day(t.latest_inspection_date)} · ${t.defects || 0} finding${t.defects === 1 ? '' : 's'}` : 'No published inspection'}${many ? ` · ${esc(t.org_name)}` : ''}</span>
      </button>`).join('') || '<p class="insp-muted">No turbines.</p>';
    $$('#insp-tlist [data-tid]').forEach((b) => b.addEventListener('click', () => selectTurbine(b.dataset.tid)));
  }

  async function selectTurbine(id, preferInspection) {
    S.turbineId = id;
    renderTurbineList();
    const t = S.turbines.find((x) => x.id === id);
    try { S.inspections = (await api(`/turbines/${encodeURIComponent(id)}/inspections`)).inspections || []; }
    catch (e) { $('#insp-main').innerHTML = `<div class="panel insp-empty"><p>${esc(e.message)}</p></div>`; return; }
    if (!S.inspections.length) {
      $('#insp-main').innerHTML = `<div class="panel insp-empty"><h3>${esc(t?.code || '')}</h3><p>No published inspection for this turbine yet.</p></div>`;
      return;
    }
    const pick = S.inspections.find((i) => i.id === preferInspection) || S.inspections[0];
    await selectInspection(pick.id);
  }

  // ---------------------------------------------------------------- inspection
  async function selectInspection(id) {
    S.inspectionId = id;
    $('#insp-main').innerHTML = `<div class="panel insp-empty"><p>Loading inspection…</p></div>`;
    let data;
    try { data = await api(`/inspections/${encodeURIComponent(id)}/points`); }
    catch (e) { $('#insp-main').innerHTML = `<div class="panel insp-empty"><p>${esc(e.message)}</p></div>`; return; }
    S.images.forEach((u) => URL.revokeObjectURL(u));
    S.images.clear();
    S.data = data;
    S.points = new Map(data.points.map((p) => [p.id, p]));
    S.byCode = new Map(data.points.map((p) => [p.position_code, p]));
    S.dets = new Map();
    data.detections.forEach((d) => { if (!S.dets.has(d.point_id)) S.dets.set(d.point_id, []); S.dets.get(d.point_id).push(d); });
    renderMain();
    const worst = [...S.dets.entries()].map(([pid, ds]) => [pid, Math.max(0, ...ds.filter(live).map(catOf))])
      .sort((a, b) => b[1] - a[1])[0];
    selectPoint(worst && worst[1] ? worst[0] : (data.points.find((p) => p.status === 'inspected') || data.points[0])?.id);
  }

  function pointCat(p) {
    const ds = (S.dets.get(p.id) || []).filter(live);
    return ds.length ? Math.max(...ds.map(catOf)) : null;
  }

  function renderMain() {
    const { inspection: i } = S.data;
    const t = S.turbines.find((x) => x.id === S.turbineId) || {};
    const dets = S.data.detections.filter(live);
    const worst = dets.length ? Math.max(...dets.map(catOf)) : null;
    const serials = (S.data.blades || []).map((b) => `${LETTER[b.blade]} ${esc(b.serial)}`).join(' · ');
    const facts = [t.site, t.state, [t.manufacturer, t.model].filter(Boolean).join(' '), t.blade_length_m ? `${t.blade_length_m} m blades` : '']
      .filter(Boolean).map(esc).join(' · ');
    $('#insp-main').innerHTML = `
      <div class="panel insp-head">
        <div class="insp-head-top">
          <div><h2>${esc(t.code || i.turbine_code)}${t.name && t.name !== t.code ? ` <span>${esc(t.name)}</span>` : ''}</h2>
            <p>${facts || '&nbsp;'}${serials ? ` · Blades ${serials}` : ''}</p></div>
          <label class="insp-pick"><span>Inspection</span><select id="insp-insp" class="insp-select">${S.inspections.map((x) => `<option value="${esc(x.id)}" ${x.id === i.id ? 'selected' : ''}>${day(x.inspection_date)}${x.status !== 'published' ? ` (${esc(x.status)})` : ''}${x.worst_cat ? ` · worst CAT ${x.worst_cat}` : ''}</option>`).join('')}</select></label>
        </div>
        <div class="insp-stats">
          <div><span>Inspected</span><b>${day(i.inspection_date)}</b></div>
          <div><span>Findings</span><b>${dets.length}</b></div>
          <div><span>Worst</span><b>${worst ? catBadge(worst) + ` ${esc(catName(worst))}` : 'None'}</b></div>
          <div><span>Photos</span><b>${i.image_count}<small> / ${i.expected_points}</small></b></div>
          <div><span>Package</span><b>${i.package_status === 'partial' ? '<span class="insp-pill warn">Partial</span>' : '<span class="insp-pill ok">Complete</span>'}${i.status !== 'published' ? ` <span class="insp-pill warn">${esc(i.status)}</span>` : ''}</b></div>
          <div><span>Model</span><b class="insp-mono">${esc(i.model_name)} ${esc(i.model_version)}</b></div>
          ${i.approved_by ? `<div><span>Approved by</span><b>${esc(i.approved_by)}</b></div>` : ''}
        </div>
      </div>
      <div class="insp-grid">
        <div class="panel insp-map-panel">
          <div class="panel-header"><div><h3>Blade map</h3><p>Root (P01) → tip (P20), coloured by the worst CAT at each point</p></div>
            <div class="insp-seg"><button type="button" data-f="all" class="${S.filter === 'all' ? 'on' : ''}">All</button><button type="button" data-f="findings" class="${S.filter === 'findings' ? 'on' : ''}">Findings</button></div></div>
          <div class="panel-body" id="insp-map"></div>
        </div>
        <div class="panel insp-viewer-panel"><div id="insp-viewer" class="insp-viewer"></div></div>
      </div>
      <div class="panel insp-findings-panel">
        <div class="panel-header"><div><h3>Findings (${dets.length})</h3><p>Worst first; within a CAT, worsening defects first. Click a row to open its photo.</p></div></div>
        <div class="panel-body insp-table-wrap" id="insp-findings"></div>
      </div>`;
    $('#insp-insp').addEventListener('change', (e) => selectInspection(e.target.value));
    $$('.insp-seg [data-f]').forEach((b) => b.addEventListener('click', () => { S.filter = b.dataset.f; $$('.insp-seg [data-f]').forEach((x) => x.classList.toggle('on', x === b)); renderMap(); }));
    renderMap();
    renderFindings();
  }

  function square(p) {
    const cat = pointCat(p);
    const cls = ['insp-sq'];
    if (p.status === 'unavailable') cls.push('na');
    else if (p.status === 'failed') cls.push('failed');
    if (p.id === S.pointId) cls.push('sel');
    if (S.filter === 'findings' && !cat) cls.push('dim');
    const tip = `${p.position_code} — ${p.status !== 'inspected' ? `${p.status}: ${p.reason || ''}` : cat ? `worst CAT ${cat}` : 'clean'}`;
    return `<button type="button" class="${cls.join(' ')}" data-pid="${p.id}" title="${esc(tip)}" aria-label="${esc(tip)}" ${cat ? `style="background:${catColour(cat)}"` : ''}></button>`;
  }

  function renderMap() {
    const pts = S.data.points;
    let html = '';
    for (const b of [1, 2, 3]) {
      const bp = pts.filter((p) => (p.component || 'blade') === 'blade' && p.blade === b);
      if (!bp.length) continue;
      const serial = S.data.blades?.find((x) => x.blade === b)?.serial;
      const n = bp.reduce((a, p) => a + (S.dets.get(p.id) || []).filter(live).length, 0);
      html += `<div class="insp-blade"><div class="insp-blade-h"><b>Blade ${LETTER[b]}${serial ? ` · ${esc(serial)}` : ''}</b><span>${n} finding${n === 1 ? '' : 's'}</span></div>`;
      for (const s of SIDES) {
        html += `<div class="insp-row"><span class="insp-side" title="${SIDE_NAMES[s]}">${s}</span>${bp.filter((p) => p.side === s).sort((x, y) => x.point - y.point).map(square).join('')}</div>`;
      }
      html += '<div class="insp-axis"><span>root</span><span>tip</span></div></div>';
    }
    for (const comp of ['nacelle', 'tower']) {
      const cp = pts.filter((p) => p.component === comp);
      if (!cp.length) continue;
      html += `<div class="insp-blade"><div class="insp-blade-h"><b>${comp === 'nacelle' ? 'Nacelle / rotor' : 'Tower'}</b><span>${cp.length} photos</span></div><div class="insp-strip">${cp.map(square).join('')}</div></div>`;
    }
    html += `<div class="insp-legend"><span><i class="insp-sq"></i>Clean</span>${[1, 2, 3, 4, 5].map((c) => `<span><i class="insp-sq" style="background:${catColour(c)}"></i>CAT ${c}</span>`).join('')}<span><i class="insp-sq na"></i>No photo</span><span><i class="insp-sq failed"></i>Unusable</span></div>`;
    $('#insp-map').innerHTML = html;
    $$('#insp-map [data-pid]').forEach((b) => b.addEventListener('click', () => selectPoint(Number(b.dataset.pid))));
  }

  function renderFindings() {
    const rank = { worsening: 0, new: 1, stable: 2 };
    const rows = S.data.detections.map((d) => ({ d, p: S.points.get(d.point_id) }))
      .sort((a, b) => (catOf(b.d) - catOf(a.d)) || ((rank[a.d.trend] ?? 3) - (rank[b.d.trend] ?? 3)) || a.p.position_code.localeCompare(b.p.position_code));
    $('#insp-findings').innerHTML = rows.length ? `<table class="data-table insp-table"><thead><tr><th>Position</th><th>Defect</th><th>CAT</th><th>Trend</th><th>Size</th><th>Confidence</th><th>Review</th></tr></thead><tbody>${rows.map(({ d, p }) => `
      <tr data-pid="${p.id}" class="${live(d) ? '' : 'rejected'} ${p.id === S.pointId ? 'sel' : ''}">
        <td><b class="insp-mono">${esc(p.position_code)}</b><div class="insp-muted">${describe(p)}</div></td>
        <td>${esc(label(d.class))}</td><td>${catBadge(catOf(d), d.severity == null && d.review_status === 'pending')}</td>
        <td>${d.trend ? `<span class="insp-pill ${d.trend === 'worsening' ? 'bad' : d.trend === 'new' ? 'info' : ''}">${esc(d.trend)}</span>` : '—'}</td>
        <td>${d.length_mm != null ? `${Math.round(d.length_mm)} × ${Math.round(d.width_mm)} mm` : '<span class="insp-muted">unknown</span>'}</td>
        <td>${d.confidence != null ? Number(d.confidence).toFixed(2) : '—'}</td>
        <td><span class="insp-pill ${d.review_status === 'confirmed' ? 'ok' : d.review_status === 'rejected' ? 'bad' : d.review_status === 'corrected' ? 'info' : ''}">${esc(d.review_status)}</span></td></tr>`).join('')}</tbody></table>`
      : '<p class="insp-muted">No findings in this inspection — every inspected point is clean.</p>';
    $$('#insp-findings tr[data-pid]').forEach((tr) => tr.addEventListener('click', () => selectPoint(Number(tr.dataset.pid))));
  }

  // ---------------------------------------------------------------- one point
  async function imageUrl(p) {
    if (S.images.has(p.id)) return S.images.get(p.id);
    const token = sessionStorage.getItem(window.CompliQApi?.tokenKey || 'compliq_api_token');
    const res = await fetch(`${String(window.COMPLIQ_API_BASE_URL || '').replace(/\/$/, '')}/api/points/${p.id}/image`, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Requested-With': 'compliq' }, credentials: 'same-origin'
    });
    if (!res.ok) throw new Error(res.status === 404 ? 'Photo not found' : `Photo could not load (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    S.images.set(p.id, url);
    return url;
  }

  function step(dir) {
    const order = S.data.points.filter((p) => S.filter !== 'findings' || pointCat(p));
    const i = order.findIndex((p) => p.id === S.pointId);
    const next = order[(i + dir + order.length) % order.length];
    if (next) selectPoint(next.id);
  }

  async function selectPoint(pid) {
    const p = S.points.get(pid);
    if (!p) return;
    S.pointId = pid;
    $$('#insp-map .insp-sq.sel, #insp-findings tr.sel').forEach((el) => el.classList.remove('sel'));
    $$(`#insp-map [data-pid="${pid}"], #insp-findings tr[data-pid="${pid}"]`).forEach((el) => el.classList.add('sel'));
    const ds = S.dets.get(pid) || [];
    const reviewer = canReview();
    const head = `<div class="insp-vhead"><div><b class="insp-mono">${esc(p.position_code)}</b><span>${describe(p)}</span></div>
      <div class="insp-vnav"><label class="insp-check"><input type="checkbox" id="insp-boxes" ${S.showBoxes ? 'checked' : ''}> Boxes</label>
        <button type="button" class="view-btn" id="insp-prev" title="Previous point">←</button><button type="button" class="view-btn" id="insp-next" title="Next point">→</button></div></div>`;
    if (p.status !== 'inspected') {
      $('#insp-viewer').innerHTML = `${head}<div class="insp-stage insp-stage-empty"><p><b>${p.status === 'failed' ? 'Photo unusable' : 'No photo for this point'}</b><br>${esc(p.reason || '')}</p></div>`;
      bindViewer();
      return;
    }
    const boxes = ds.map((d, n) => {
      const col = live(d) ? catColour(catOf(d)) : '#9aa3ad';
      return `<div class="insp-box ${live(d) ? '' : 'rejected'}" data-did="${esc(d.id)}" style="left:${d.x_min * 100}%;top:${d.y_min * 100}%;width:${(d.x_max - d.x_min) * 100}%;height:${(d.y_max - d.y_min) * 100}%;border-color:${col}"><span style="background:${col}">${n + 1} · ${esc(label(d.class))}</span></div>`;
    }).join('');
    const list = ds.length ? ds.map((d, n) => {
      const cls = S.classes[d.class] || { cat_min: 1, cat_max: 5 };
      const cats = [];
      for (let c = cls.cat_min; c <= cls.cat_max; c++) cats.push(c);
      return `<div class="insp-det ${live(d) ? '' : 'rejected'}" data-did="${esc(d.id)}">
        <span class="insp-num" style="background:${live(d) ? catColour(catOf(d)) : '#9aa3ad'}">${n + 1}</span>
        <div class="insp-det-main"><div class="insp-det-title"><b>${esc(label(d.class))}</b> ${catBadge(catOf(d), d.severity == null && d.review_status === 'pending')}
          ${d.trend ? `<span class="insp-pill ${d.trend === 'worsening' ? 'bad' : d.trend === 'new' ? 'info' : ''}">${esc(d.trend)}</span>` : ''}
          <span class="insp-pill ${d.review_status === 'confirmed' ? 'ok' : d.review_status === 'rejected' ? 'bad' : ''}">${esc(d.review_status)}</span></div>
          <div class="insp-muted">${d.length_mm != null ? `${Math.round(d.length_mm)} × ${Math.round(d.width_mm)} mm` : 'size unknown'} · confidence ${d.confidence != null ? Number(d.confidence).toFixed(2) : '—'} · ${esc(d.severity_reason || '')}</div>
          ${reviewer ? `<div class="insp-actions">
            <button type="button" class="view-btn" data-act="confirmed" ${d.review_status === 'confirmed' ? 'disabled' : ''}>Confirm</button>
            <button type="button" class="view-btn" data-act="rejected" ${d.review_status === 'rejected' ? 'disabled' : ''}>Reject</button>
            <label>Final CAT <select data-cat class="insp-select insp-small">${cats.map((c) => `<option value="${c}" ${c === catOf(d) ? 'selected' : ''}>CAT ${c}</option>`).join('')}</select></label></div>` : ''}
        </div></div>`;
    }).join('') : '<p class="insp-muted">No findings at this point.</p>';
    const facts = [p.image_width ? `${p.image_width} × ${p.image_height} px` : '', p.mm_per_px ? `${p.mm_per_px} mm/px` : '', p.zone ? `${p.zone} zone` : '',
      p.captured_at ? `taken ${String(p.captured_at).replace('T', ' ').slice(0, 16)}` : '', p.drone_altitude_m != null ? `drone ${p.drone_altitude_m} m` : ''].filter(Boolean).join(' · ');
    $('#insp-viewer').innerHTML = `${head}
      <div class="insp-stage ${S.showBoxes ? '' : 'noboxes'}"><div class="insp-frame"><img id="insp-img" alt="${esc(p.position_code)}"><div class="insp-boxes">${boxes}</div></div><p class="insp-loading" id="insp-loading">Loading photo…</p></div>
      <p class="insp-muted insp-facts">${esc(facts)}</p>
      <div class="insp-dets">${list}</div>`;
    bindViewer();
    $$('.insp-det, .insp-box').forEach((el) => {
      el.addEventListener('mouseenter', () => $$(`[data-did="${el.dataset.did}"]`).forEach((x) => x.classList.add('hot')));
      el.addEventListener('mouseleave', () => $$('.hot').forEach((x) => x.classList.remove('hot')));
    });
    if (reviewer) {
      $$('.insp-det [data-act]').forEach((b) => b.addEventListener('click', () => review(b.closest('.insp-det').dataset.did, { review_status: b.dataset.act })));
      $$('.insp-det [data-cat]').forEach((s) => s.addEventListener('change', () => review(s.closest('.insp-det').dataset.did, { severity: Number(s.value), review_status: 'corrected' })));
    }
    try {
      const url = await imageUrl(p);
      if (S.pointId !== pid) return;
      const img = $('#insp-img');
      img.src = url;
      img.onload = () => { const l = $('#insp-loading'); if (l) l.remove(); };
    } catch (e) {
      const l = $('#insp-loading');
      if (l) l.textContent = e.message;
    }
  }

  function bindViewer() {
    $('#insp-prev')?.addEventListener('click', () => step(-1));
    $('#insp-next')?.addEventListener('click', () => step(1));
    $('#insp-boxes')?.addEventListener('change', (e) => { S.showBoxes = e.target.checked; $('.insp-stage')?.classList.toggle('noboxes', !S.showBoxes); });
  }

  async function review(id, change) {
    try {
      const res = await api(`/detections/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(change) });
      const d = S.data.detections.find((x) => x.id === id);
      Object.assign(d, { class: res.detection.class, severity: res.detection.severity, review_status: res.detection.review_status });
      toast(`Finding ${res.detection.review_status}`, 'success');
      const keep = S.pointId;
      renderMain();
      selectPoint(keep);
    } catch (e) { toast(`Not saved: ${e.message}`, 'error'); }
  }

  // ---------------------------------------------------------------- fleet merge
  /**
   * Turbines the ML engineer added in Inspection Studio live in D1. Add the ones missing from this organization's
   * fleet list (in memory; they are saved with the fleet the next time someone saves it), and bring the last
   * inspection date and finding count of matching turbines up to date.
   */
  async function mergeIntoFleet(db) {
    if (!db || !Array.isArray(db.turbines) || !window.CompliQApi?.hasSession()) return 0;
    let turbines = [];
    try { turbines = (await api('/turbines')).turbines || []; } catch (_) { return 0; }
    const u = user() || {};
    const mine = turbines.filter((t) => !u.globalAdmin || String(t.org_name || '').toLowerCase() === String(u.org || '').toLowerCase());
    let added = 0;
    for (const t of mine) {
      const existing = db.turbines.find((x) => String(x.assetId || '').toUpperCase() === String(t.code).toUpperCase());
      const status = t.worst_cat >= 4 ? 'critical' : t.worst_cat >= 3 ? 'warning' : 'normal';
      const latest = t.latest_inspection_date ? day(t.latest_inspection_date) : null;
      if (existing) {
        Object.assign(existing, {
          dbId: t.id, latestInspectionId: t.latest_inspection_id || null,
          name: t.name || t.code, site: t.site || '—', state: t.state || '',
          gps: { lat: Number(t.latitude) || 0, lng: Number(t.longitude) || 0 },
          location: [t.site, t.state].filter(Boolean).join(', ') || '—',
          manufacturer: t.manufacturer || '', model: t.model || '',
          rotorDia: Number(t.rotor_diameter_m) || (t.blade_length_m ? Math.round(2 * t.blade_length_m) : 0),
          bladeLength: Number(t.blade_length_m) || null, hubHeight: Number(t.hub_height_m) || 0,
          power: Number(t.rated_power_mw) || 0, commYear: t.commissioned_year || '',
          blades: t.blade_serials || [], lastInspection: latest || '—', anomalies: t.defects || 0,
          status, health: t.worst_cat ? 100 - 10 * t.worst_cat : 100,
          inspCoverage: t.latest_image_count ? Math.round(100 * Math.min(t.latest_image_count, 240) / 240) : 0,
          campaign: '—', source: 'inspection-studio'
        });
        continue;
      }
      const id = db.turbines.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
      db.turbines.push({
        id, assetId: t.code, name: t.name || t.code, site: t.site || '—', state: t.state || '',
        gps: { lat: Number(t.latitude) || 0, lng: Number(t.longitude) || 0 },
        location: [t.site, t.state].filter(Boolean).join(', ') || '—', status,
        // health for turbines from the inspection tool: 100 when clean, 10 points less per CAT of the worst finding
        health: t.worst_cat ? 100 - 10 * t.worst_cat : 100,
        rotorDia: Number(t.rotor_diameter_m) || (t.blade_length_m ? Math.round(2 * t.blade_length_m) : 0),
        bladeLength: Number(t.blade_length_m) || null, hubHeight: Number(t.hub_height_m) || 0, power: Number(t.rated_power_mw) || 0,
        manufacturer: t.manufacturer || '', model: t.model || '', commYear: t.commissioned_year || '', windSpeed: 0, rpm: 0,
        inspCoverage: t.latest_image_count ? Math.round(100 * Math.min(t.latest_image_count, 240) / 240) : 0,
        lastInspection: latest || '—', campaign: '—', anomalies: t.defects || 0, defects: [],
        bladeCount: 3, blades: t.blade_serials || [], source: 'inspection-studio',
        dbId: t.id, latestInspectionId: t.latest_inspection_id || null
      });
      added++;
    }
    return added;
  }

  window.CompliQInspections = { open, mergeIntoFleet };
})();
