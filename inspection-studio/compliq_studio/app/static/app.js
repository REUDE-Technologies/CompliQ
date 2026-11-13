"use strict";
/* CompliQ Inspection Studio — browser UI. Talks to the local server at /api/*. No build step. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = $("#main");

const CAT_NAMES = { 1: "Cosmetic", 2: "Minor", 3: "Moderate", 4: "Serious", 5: "Critical" };
const CAT_COLOURS = { 1: "#2F6FB3", 2: "#2E9D58", 3: "#C99A06", 4: "#E07B2E", 5: "#D03B3B" };
const SIDES = ["SS", "LE", "PS", "TE"];
const SIDE_NAMES = { SS: "Suction side", LE: "Leading edge", PS: "Pressure side", TE: "Trailing edge" };
const GROUP_NAMES = { nacelle: "Nacelle / rotor", tower: "Tower" };
const FAIL_REASONS = ["Blurred", "Wrong side or blade", "Blade not in frame", "Over- or under-exposed", "Duplicate photo"];

const S = { info: null, job: null, review: null, scan: null, model: null, runDismissed: false };

/* ---------------------------------------------------------------- api */
const api = {
  async req(method, path, body) {
    const opt = { method, headers: {} };
    if (method !== "GET") opt.headers["X-Studio"] = "1";
    if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
    const r = await fetch(path, opt);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) {
      const msg = (data && (data.detail || data.error)) || r.statusText;
      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = r.status;
      throw err;
    }
    return data;
  },
  get(p) { return this.req("GET", p); },
  post(p, b = {}) { return this.req("POST", p, b); },
  put(p, b) { return this.req("PUT", p, b); },
};

/* ---------------------------------------------------------------- ui helpers */
function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), kind === "bad" ? 7000 : 3500);
}

function modal(html, onReady) {
  const m = $("#modal");
  m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ""; };
  m.onclick = (e) => { if (e.target === m) close(); };
  $$("[data-close]", m).forEach((b) => (b.onclick = close));
  const first = $("input, textarea, select, button.btn-primary, button.btn-ok", m);
  if (first) setTimeout(() => first.focus(), 30);
  if (onReady) onReady(m, close);
  return close;
}

function askText({ title, body = "", label, value = "", quick = [], okText = "OK", danger = false }) {
  return new Promise((resolve) => {
    modal(`<h2>${esc(title)}</h2>${body}
      ${quick.length ? `<div class="quick">${quick.map((q) => `<button class="btn btn-sm" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}
      <label class="field"><span>${esc(label)}</span><input type="text" id="ask" value="${esc(value)}"></label>
      <div class="acts"><button class="btn" data-close>Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="askok">${esc(okText)}</button></div>`,
    (m, close) => {
      const input = $("#ask", m);
      $$("[data-q]", m).forEach((b) => (b.onclick = () => { input.value = b.dataset.q; input.focus(); }));
      const ok = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } close(); resolve(v); };
      $("#askok", m).onclick = ok;
      input.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") { close(); resolve(null); } };
      $$("[data-close]", m).forEach((b) => (b.onclick = () => { close(); resolve(null); }));
      m.onclick = (e) => { if (e.target === m) { close(); resolve(null); } };
    });
  });
}

function confirmBox(title, body, okText = "Continue") {
  return new Promise((resolve) => {
    modal(`<h2>${esc(title)}</h2><div>${body}</div>
      <div class="acts"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="cok">${esc(okText)}</button></div>`,
    (m, close) => {
      $("#cok", m).onclick = () => { close(); resolve(true); };
      $$("[data-close]", m).forEach((b) => (b.onclick = () => { close(); resolve(false); }));
      m.onclick = (e) => { if (e.target === m) { close(); resolve(false); } };
    });
  });
}

function reviewer() { return localStorage.getItem("studio.reviewer") || ""; }
async function ensureReviewer() {
  if (reviewer()) return reviewer();
  const name = await askText({ title: "Who is reviewing?", body: '<p class="muted">Your name is saved with each decision and with the package approval.</p>', label: "Your name", okText: "Save" });
  if (name) { localStorage.setItem("studio.reviewer", name); renderReviewer(); }
  return name;
}
function renderReviewer() {
  const el = $("#reviewer");
  const name = reviewer();
  el.innerHTML = name ? `Reviewer: <b>${esc(name)}</b> <button class="btn-link small" id="chgrev">change</button>` : "";
  const b = $("#chgrev");
  if (b) b.onclick = async () => { localStorage.removeItem("studio.reviewer"); renderReviewer(); await ensureReviewer(); };
}

const fmtDate = (iso) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");
const fmtSecs = (s) => (s == null ? "—" : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);
const catBadge = (c) => (c ? `<span class="cat cat${c}" title="CAT ${c} ${CAT_NAMES[c]}">CAT ${c}</span>` : "");
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

function setNav(name) {
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === name));
  main.classList.toggle("wide", name === "review");
}

/* ---------------------------------------------------------------- router */
async function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  document.onkeydown = null;
  try {
    if (!parts.length) { setNav("inspections"); return await viewInspections(); }
    if (parts[0] === "new") { setNav("new"); return await viewNew(); }
    if (parts[0] === "settings") { setNav("settings"); return await viewSettings(); }
    if (parts[0] === "review" && parts[1]) { setNav("review"); return await viewReview(parts[1], parts[2]); }
    if (parts[0] === "upload" && parts[1]) { setNav("upload"); return await viewUpload(parts[1]); }
    location.hash = "#/";
  } catch (e) {
    main.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back to inspections</a></div>`;
  }
}
window.addEventListener("hashchange", route);

/* ---------------------------------------------------------------- inspections */
async function viewInspections() {
  main.innerHTML = '<div class="loading">Loading inspections…</div>';
  const list = await api.get("/api/inspections");
  const head = `<div class="page-head"><div><h1>Inspections</h1><div class="sub">Runs saved in <code>${esc(S.info.output_dir)}</code></div></div>
    <div class="actions"><button class="btn" id="sample">Try with sample data</button><a class="btn btn-primary" href="#/new">New run</a></div></div>`;
  if (!list.length) {
    main.innerHTML = head + `<div class="card empty">
      <div class="art"><svg width="34" height="34" viewBox="0 0 32 32"><path d="M16 5v22M16 16l-9 5.5M16 16l9 5.5" stroke="#1e3a5f" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="16" cy="16" r="2.6" fill="#1e3a5f"/></svg></div>
      <h2>No inspections yet</h2>
      <p>Point the app at a turbine's photo folder (12 blade sides + nacelle + tower), run the model, review the findings, then upload to CompliQ.</p>
      <div class="row" style="justify-content:center"><a class="btn btn-primary btn-lg" href="#/new">Start a run</a><button class="btn btn-lg" id="sample2">Try with sample data</button></div>
      <div class="steps">
        <div><b>1 · Photos</b>14 folders: B1–B3 × SS, LE, PS, TE (20 each), nacelle, tower.</div>
        <div><b>2 · Run</b>The model checks every photo; clean WebP + annotated copy for each.</div>
        <div><b>3 · Review</b>Approve each photo, remove wrong boxes, approve the package.</div>
        <div><b>4 · Upload</b>Sends the approved package to the Cloudflare Worker.</div>
      </div></div>`;
  } else {
    const rows = list.map((w) => {
      const r = w.review;
      const done = r.approved + r.failed;
      const up = w.upload;
      const upCell = up && up.status === "published" ? `<span class="badge ok" title="${esc(up.org_name || "")}">In CompliQ</span>`
        : up && up.status === "incomplete" ? '<span class="badge warn">Unfinished</span>'
        : up && up.status === "deleted" ? '<span class="badge">Deleted</span>' : '<span class="faint">—</span>';
      const pkg = w.validation_ok === false ? `<span class="badge bad">${w.validation_errors} errors</span>`
        : r.package_approved ? '<span class="badge ok">Approved</span>'
        : r.approval_voided ? '<span class="badge warn">Changed after approval</span>' : '<span class="badge">Not approved</span>';
      return `<tr class="click" data-key="${esc(w.key)}">
        <td><b>${esc(w.turbine_code)}</b><div class="faint small mono">${esc(w.key)}</div></td>
        <td class="nowrap">${fmtDate(w.inspection_date)}</td>
        <td>${w.photos}${w.gaps ? ` <span class="badge warn" title="failed or unavailable">${w.gaps} gaps</span>` : ""}</td>
        <td>${w.detections}</td>
        <td class="nowrap"><span class="bar ok minibar"><i style="width:${pct(done, r.reviewable)}%"></i></span> <span class="small muted">${done}/${r.reviewable}</span></td>
        <td>${pkg}</td><td>${upCell}</td>
        <td class="small muted">${esc(w.model?.model_name || "")} ${esc(w.model?.model_version || "")}${w.run_state && w.run_state !== "complete" ? ` <span class="badge warn">${esc(w.run_state)}</span>` : ""}</td>
      </tr>`;
    }).join("");
    main.innerHTML = head + `<div class="tablewrap"><table class="list"><thead><tr><th>Turbine</th><th>Inspection date</th><th>Photos</th><th>Findings</th><th>Review</th><th>Package</th><th>CompliQ</th><th>Model</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    $$("tr[data-key]").forEach((tr) => (tr.onclick = () => (location.hash = `#/review/${encodeURIComponent(tr.dataset.key)}`)));
  }
  [$("#sample"), $("#sample2")].forEach((b) => b && (b.onclick = startSample));
}

async function startSample() {
  if (!(await confirmBox("Make sample photos?", '<p>This draws 258 synthetic photos (12 blade sides × 20, 8 nacelle, 10 tower) into the <code>samples</code> folder, about 40 seconds. They are drawings, not real blades, and run with a <b>demo model</b> that replays the drawn defects, so you can try review and upload before model.pt is ready.</p>', "Make samples"))) return;
  try { S.job = await api.post("/api/sample"); S.runDismissed = false; pollSoon(); toast("Making sample photos…"); }
  catch (e) { toast(e.message, "bad"); }
}

/* ---------------------------------------------------------------- setup + run */
function setup() {
  try { return JSON.parse(localStorage.getItem("studio.setup")) || {}; } catch { return {}; }
}
function saveSetup(patch) { localStorage.setItem("studio.setup", JSON.stringify({ ...setup(), ...patch })); }

async function viewNew() {
  const job = S.job;
  if (job && job.kind === "run" && !S.runDismissed) return renderRun();
  const st = setup();
  const s = S.info.settings;
  const tz = st.tz || s.inspection?.timezone || "+05:30";
  main.innerHTML = `<div class="page-head"><div><h1>New run</h1><div class="sub">Photos → model → clean WebP + annotated copies → package ready for review</div></div></div>
  <div class="grid2">
    <div class="stack">
      <div class="card"><h2>1 · Photo folder</h2>
        <div class="inputgroup"><input type="text" id="input_dir" placeholder="e.g. D:\\Inspections\\WTG-001_2026-11-04" value="${esc(st.input_dir || "")}">
          <button class="btn" id="browse_in">Browse…</button><button class="btn btn-primary" id="scan">Scan</button></div>
        <p class="small faint" style="margin-top:6px">Sub-folders: B1-SS … B3-TE (20 photos each, P01 at the root), NACELLE, TOWER. Names like "Blade 1/SS" also work.</p>
        <div id="scanres"></div>
      </div>
    </div>
    <div class="stack">
      <div class="card"><h2>2 · Inspection</h2>
        <div class="fields">
          <label class="field"><span>Turbine code</span><input type="text" id="turbine_code" placeholder="WTG-001" value="${esc(st.turbine_code || "")}"><small><button class="btn-link" id="pickturb" type="button">Pick from CompliQ…</button>${st.cloud_target?.org_name ? ` · ${esc(st.cloud_target.org_name)}` : ""}</small></label>
          <label class="field"><span>Inspection date and time</span><input type="datetime-local" id="dt" value="${esc(st.dt || "")}"></label>
          <label class="field"><span>Time zone</span><input type="text" id="tz" value="${esc(tz)}"></label>
          <label class="field"><span>Blade length (m)</span><input type="number" step="0.1" min="0" id="blade_length_m" value="${esc(st.blade_length_m ?? s.inspection?.blade_length_m ?? "")}"><small>Used for distance from the root.</small></label>
        </div>
        <label class="field" style="margin-top:14px"><span>Where the originals live (optional)</span><input type="text" id="source_video" placeholder="Drive: Inspections/2026/WTG-001" value="${esc(st.source_video || "")}"><small>Stored as <code>source_video</code>; never shown to viewer accounts.</small></label>
      </div>
      <div class="card"><h2>3 · Model</h2>
        <div class="inputgroup"><input type="text" id="model_path" value="${esc(st.model_path || s.model?.path || "models/model.pt")}">
          <button class="btn" id="browse_model">Browse…</button><button class="btn" id="checkmodel">Check</button></div>
        <div id="modelres" style="margin-top:10px"></div>
        <details style="margin-top:10px"><summary>Camera and size settings</summary>
          <p class="small muted">Size in mm needs distance × sensor width ÷ (focal length × image width). Distance comes from the photo's laser range when the drone records it; otherwise the value here. Leave empty if unknown — sizes stay null and the CAT uses the class minimum.</p>
          <div class="fields">
            <label class="field"><span>Distance to blade (m)</span><input type="number" step="0.1" id="cam_dist" value="${esc(st.camera?.distance_to_blade_m ?? s.camera?.distance_to_blade_m ?? "")}"></label>
            <label class="field"><span>Focal length (mm)</span><input type="number" step="0.01" id="cam_focal" placeholder="from EXIF" value="${esc(st.camera?.focal_length_mm ?? s.camera?.focal_length_mm ?? "")}"></label>
            <label class="field"><span>Sensor width (mm)</span><input type="number" step="0.01" id="cam_sensor" value="${esc(st.camera?.sensor_width_mm ?? s.camera?.sensor_width_mm ?? "")}"></label>
          </div>
        </details>
      </div>
      <div class="card"><h2>4 · Run</h2>
        <div>
          <label class="field"><span>Package format</span><select id="schema_version">
            <option value="1.1" ${(st.schema_version || s.package?.schema_version) !== "1.0" ? "selected" : ""}>1.1 — blades + nacelle + tower</option>
            <option value="1.0" ${(st.schema_version || s.package?.schema_version) === "1.0" ? "selected" : ""}>1.0 — blades only (current spec)</option></select>
            <small>1.1 needs the backend schema update in the PRD.</small></label>
        </div>
        <div class="stack" style="margin-top:12px">
          <label class="check"><input type="checkbox" id="fresh"> <span>Re-process every photo <span class="faint">(otherwise unchanged photos reuse earlier results)</span></span></label>
          <label class="check" id="newwrap" hidden><input type="checkbox" id="new_inspection"> <span>Start as a new inspection <span class="faint">(new inspection ID; this turbine and date already has one)</span></span></label>
        </div>
        <div id="runerr" style="margin-top:12px"></div>
        <div class="row" style="margin-top:14px"><button class="btn btn-primary btn-lg" id="run">Run model</button><span class="muted small" id="runhint"></span></div>
      </div>
    </div>
  </div>`;

  const persist = () => saveSetup(readForm());
  $$("input, select", main).forEach((el) => el.addEventListener("change", persist));
  $("#scan").onclick = doScan;
  $("#input_dir").onkeydown = (e) => { if (e.key === "Enter") doScan(); };
  $("#browse_in").onclick = () => browse("folder", "#input_dir", doScan);
  $("#browse_model").onclick = () => browse("file", "#model_path", checkModel);
  $("#checkmodel").onclick = checkModel;
  $("#run").onclick = startRun;
  $("#pickturb").onclick = pickTurbine;
  if (st.input_dir) doScan();
  if (S.model && S.model.path === $("#model_path").value) renderModel(S.model.data); else if (st.model_path === "demo") checkModel();
}

function readForm() {
  const v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
  const st = setup();
  return {
    input_dir: v("input_dir"), turbine_code: v("turbine_code").toUpperCase(), dt: v("dt"), tz: v("tz"),
    blade_length_m: v("blade_length_m"), source_video: v("source_video"), model_path: v("model_path"),
    schema_version: v("schema_version"), overrides: st.overrides || {},
    camera: { distance_to_blade_m: v("cam_dist"), focal_length_mm: v("cam_focal"), sensor_width_mm: v("cam_sensor") },
  };
}

async function browse(kind, sel, then) {
  try {
    const r = await api.post("/api/browse", { kind, initial: $(sel).value || undefined });
    if (r.path) { $(sel).value = r.path; saveSetup(readForm()); if (then) then(); }
    else if (r.error) toast(r.error, "bad");
  } catch (e) { toast(e.message, "bad"); }
}

async function doScan() {
  const form = readForm();
  saveSetup(form);
  const box = $("#scanres");
  if (!form.input_dir) { box.innerHTML = '<div class="note warn" style="margin-top:10px">Enter the photo folder first.</div>'; return; }
  box.innerHTML = '<p class="muted" style="margin-top:12px"><span class="spin"></span> Scanning…</p>';
  try {
    const r = await api.post("/api/scan", { input_dir: form.input_dir, overrides: form.overrides });
    S.scan = r;
    if (!$("#turbine_code").value && r.suggested_turbine) $("#turbine_code").value = r.suggested_turbine;
    if (!$("#dt").value && (r.first_capture || r.suggested_date)) $("#dt").value = (r.first_capture || r.suggested_date + "T00:00").slice(0, 16);
    if (r.demo_data && !/demo/.test($("#model_path").value) && !S.info.model_exists) {
      $("#model_path").value = "demo";
      checkModel();
    }
    $("#newwrap").hidden = !r.existing;
    saveSetup(readForm());
    renderScan(r);
  } catch (e) { box.innerHTML = `<div class="note bad" style="margin-top:10px">${esc(e.message)}</div>`; }
}

function folderCell(f) {
  const cls = f.issues.length ? "bad" : f.warnings.length ? "warn" : "ok";
  const n = f.mode === "not_filmed" ? '<span class="small">not filmed</span>' : `${f.assigned}<small> / ${f.group === "blade" ? 20 : f.photo_count}</small>`;
  const meta = f.issues[0] || f.warnings[0] || (f.path ? `${f.path}${f.reversed ? " · tip→root" : ""}${f.mode === "numbered" ? " · by number" : ""}` : "");
  const acts = f.group === "blade" ? `<div class="acts">
      ${f.mode === "order" && !f.issues.length ? `<button class="btn-link" data-flip="${f.key}" title="Flip the order if this pass was flown tip to root">⇄ Flip</button>` : ""}
      ${f.mode === "not_filmed" ? `<button class="btn-link" data-unfilm="${f.key}">Undo</button>` : `<button class="btn-link" data-film="${f.key}" title="Mark all 20 points unavailable with a reason">Not filmed</button>`}</div>` : "";
  return `<div class="fcell ${cls}" title="${esc([...f.issues, ...f.warnings].join("\n"))}"><div class="n">${n}</div><div class="meta">${esc(meta)}</div>${acts}</div>`;
}

function renderScan(r) {
  const F = r.folders;
  let html = '<div class="folders" style="margin-top:14px"><div></div>' + SIDES.map((s) => `<div class="hdr" title="${SIDE_NAMES[s]}">${s}</div>`).join("");
  for (const b of [1, 2, 3]) html += `<div class="rowlbl">Blade ${b}</div>` + SIDES.map((s) => folderCell(F[`B${b}-${s}`])).join("");
  html += "</div>";
  html += '<div class="comps">' + ["nacelle", "tower"].map((c) => {
    const f = F[c];
    const cls = f.issues.length ? "bad" : f.mode === "missing" ? "warn" : "ok";
    const codes = f.assigned ? `${c === "nacelle" ? "NAC" : "TWR"}-01 … ${String(f.assigned).padStart(2, "0")}` : "";
    return `<div class="fcell ${cls}"><div class="n">${f.assigned}<small> photos · ${GROUP_NAMES[c]}</small></div><div class="meta">${esc(f.issues[0] || f.warnings[0] || `${f.path} · ${codes}`)}</div></div>`;
  }).join("") + "</div>";
  const notes = [...r.issues, ...r.warnings];
  if (notes.length) html += `<div class="note warn" style="margin-top:10px"><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
  html += r.ok ? `<div class="note ok" style="margin-top:10px">Ready: ${r.blade_photo_count} blade photos, ${r.nacelle_photo_count} nacelle, ${r.tower_photo_count} tower.</div>`
    : '<div class="note bad" style="margin-top:10px">Fix the red folders before running. Hover a folder to see why.</div>';
  $("#scanres").innerHTML = html;
  const ov = () => ({ ...(setup().overrides || {}) });
  $$("[data-flip]").forEach((b) => (b.onclick = () => { const o = ov(); const k = b.dataset.flip; o[k] = { ...(o[k] || {}), reverse: !(o[k] || {}).reverse }; saveSetup({ overrides: o }); doScan(); }));
  $$("[data-film]").forEach((b) => (b.onclick = async () => {
    const reason = await askText({ title: `${b.dataset.film} not filmed`, body: '<p class="muted">All 20 points become "unavailable" with this reason, and the package status becomes partial.</p>', label: "Reason", quick: ["Wind gust aborted pass", "Battery swap, pass skipped", "Blade side not reachable"], okText: "Mark not filmed" });
    if (!reason) return;
    const o = ov(); o[b.dataset.film] = { ...(o[b.dataset.film] || {}), not_filmed: reason }; saveSetup({ overrides: o }); doScan();
  }));
  $$("[data-unfilm]").forEach((b) => (b.onclick = () => { const o = ov(); delete (o[b.dataset.unfilm] || {}).not_filmed; saveSetup({ overrides: o }); doScan(); }));
}

async function checkModel() {
  const path = $("#model_path").value.trim();
  saveSetup(readForm());
  const box = $("#modelres");
  if (!path) { box.innerHTML = ""; return; }
  box.innerHTML = '<p class="muted"><span class="spin"></span> Loading model…</p>';
  try {
    const r = await api.post("/api/model", { model_path: path });
    S.model = { path, data: r };
    renderModel(r);
  } catch (e) { S.model = null; box.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
}

function renderModel(r) {
  const chips = Object.entries(r.classes).map(([n, c]) => `<span class="chip ${c ? "ok" : "bad"}" title="${c ? "→ " + c : "not one of the six codes; skipped"}">${esc(n)}${c && c !== n ? " → " + esc(c) : ""}</span>`).join("");
  $("#modelres").innerHTML = `<div class="row" style="margin-bottom:8px"><b>${esc(r.info.model_name)}</b> <span class="badge">v${esc(r.info.model_version)}</span>
    ${r.info.demo ? '<span class="badge warn">Demo — replays sample boxes, not a real model</span>' : ""}
    ${r.info.version_from === "default" ? '<span class="badge warn" title="Add models/model.json with model_name and model_version">version not set</span>' : ""}</div>
    <div class="chips">${chips}</div>
    ${r.unknown.length ? `<div class="note warn" style="margin-top:8px">${r.unknown.length} model class(es) are not among the six codes and will be skipped. Map them in <code>config/classes.yaml</code> → <code>model_name_map</code>.</div>` : ""}
    ${r.not_covered.length ? `<p class="small muted" style="margin-top:8px">The model never predicts: ${r.not_covered.map(esc).join(", ")}</p>` : ""}`;
}

async function pickTurbine() {
  let orgs = [];
  try { orgs = await api.get("/api/cloud/orgs"); }
  catch (e) { return toast(e.message.includes("not set up") ? "Set up the CompliQ connection in Settings first." : e.message, "bad"); }
  const last = setup().cloud_target?.org_id || localStorage.getItem("studio.org") || "";
  modal(`<h2>Pick a turbine from CompliQ</h2>
    <label class="field"><span>Organization</span><select id="pk-org"><option value="">Choose…</option>${orgs.map((o) => `<option value="${esc(o.id)}" ${o.id === last ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
    <label class="field" style="margin-top:10px"><span>Turbine</span><select id="pk-t" disabled><option>Choose the organization first</option></select></label>
    <p class="small muted" id="pk-info" style="margin-top:8px">Not listed? Type the code yourself; you can add the turbine when you publish.</p>
    <div class="acts"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="pk-ok" disabled>Use this turbine</button></div>`,
  (m, close) => {
    let list = [];
    const orgSel = $("#pk-org", m), tSel = $("#pk-t", m), ok = $("#pk-ok", m);
    const load = async () => {
      tSel.disabled = true; ok.disabled = true;
      if (!orgSel.value) return;
      tSel.innerHTML = "<option>Loading…</option>";
      try { list = await api.get(`/api/cloud/turbines?org_id=${encodeURIComponent(orgSel.value)}`); }
      catch (e) { tSel.innerHTML = `<option>${esc(e.message)}</option>`; return; }
      tSel.innerHTML = list.length ? list.map((t) => `<option value="${esc(t.code)}">${esc(t.code)}${t.name && t.name !== t.code ? " — " + esc(t.name) : ""}${t.blade_length_m ? ` · ${t.blade_length_m} m` : ""}</option>`).join("") : "<option value=''>No turbines yet</option>";
      tSel.disabled = !list.length; ok.disabled = !list.length;
    };
    orgSel.onchange = load;
    if (orgSel.value) load();
    ok.onclick = () => {
      const t = list.find((x) => x.code === tSel.value);
      if (!t) return;
      $("#turbine_code").value = t.code;
      if (t.blade_length_m) $("#blade_length_m").value = t.blade_length_m;
      localStorage.setItem("studio.org", orgSel.value);
      saveSetup({ ...readForm(), cloud_target: { org_id: orgSel.value, org_name: orgSel.selectedOptions[0]?.textContent, code: t.code } });
      close();
      toast(`Using ${t.code} from ${orgSel.selectedOptions[0]?.textContent}`, "ok");
    };
  });
}

async function startRun() {
  const f = readForm();
  saveSetup(f);
  const errs = [];
  if (!S.scan || !S.scan.ok) errs.push("Scan the photo folder and fix any red folders.");
  if (!f.turbine_code) errs.push("Enter the turbine code.");
  if (!f.dt) errs.push("Enter the inspection date and time.");
  if (!/^[+-]\d{2}:\d{2}$/.test(f.tz)) errs.push("Time zone must look like +05:30.");
  if (!f.model_path) errs.push("Enter the model path.");
  if (errs.length) { $("#runerr").innerHTML = `<div class="note bad"><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`; return; }
  if (!f.blade_length_m && !(await confirmBox("No blade length?", "<p>Without it every <code>distance_m</code> in points.json is null. You can still run and add it later by running again.</p>", "Run anyway"))) return;
  const camera = Object.fromEntries(Object.entries(f.camera).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
  const body = {
    input_dir: f.input_dir, turbine_code: f.turbine_code, inspection_date: `${f.dt.length === 16 ? f.dt + ":00" : f.dt}${f.tz}`,
    blade_length_m: f.blade_length_m ? Number(f.blade_length_m) : null, model_path: f.model_path,
    source_video: f.source_video || null, camera, overrides: f.overrides, schema_version: f.schema_version,
    fresh: $("#fresh").checked, new_inspection: $("#new_inspection").checked,
    cloud_target: (setup().cloud_target && setup().cloud_target.code === f.turbine_code) ? setup().cloud_target : {},
  };
  try {
    S.job = await api.post("/api/run", body);
    S.runDismissed = false;
    renderRun();
    pollSoon();
  } catch (e) { $("#runerr").innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
}

function runStatusHtml(j) {
  const p = j.progress || {};
  if (j.state === "running") {
    const what = p.phase === "loading_model" ? p.message : p.phase === "packaging" ? "Writing the package and validating…" : `Checking ${p.code || "…"}`;
    return `<div class="row"><span class="spin"></span><b>${esc(what)}</b><span class="muted">${esc(p.photo || "")}</span><span class="spacer"></span><button class="btn btn-danger" id="cancel">Cancel</button></div>`;
  }
  if (j.state === "done") {
    const r = j.result || {};
    return `<div class="note ${r.validation_ok ? "ok" : "bad"}"><b>Run finished.</b> ${r.processed} photos checked${r.reused ? `, ${r.reused} reused from the last run` : ""}, ${r.detections} findings.
      ${r.validation_ok ? "The package passes validation." : `The package has validation errors:<ul>${(r.validation_errors || []).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`}
      ${(r.unknown_model_classes || []).length ? `<br>Skipped model classes: ${r.unknown_model_classes.map(esc).join(", ")}` : ""}</div>
      <div class="row" style="margin-top:12px"><a class="btn btn-primary btn-lg" href="#/review/${encodeURIComponent(r.workspace)}">Review findings →</a><button class="btn" id="dismiss">New run</button></div>`;
  }
  return `<div class="note ${j.state === "cancelled" ? "warn" : "bad"}"><b>${j.state === "cancelled" ? "Run cancelled." : "Run stopped."}</b> ${esc(j.error || "Finished photos are kept; run again to continue.")}
    ${(j.details || []).length ? `<ul>${j.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div>
    <div class="row" style="margin-top:12px"><button class="btn btn-primary" id="dismiss">Back to setup</button></div>`;
}

function renderRun() {
  const j = S.job;
  if (!j) return viewNew();
  let root = $("#runview");
  if (!root || root.dataset.job !== j.id) {
    main.innerHTML = `<div id="runview" data-job="${esc(j.id)}"><div class="page-head"><div><h1>${esc(j.label)}</h1><div class="sub">Started ${esc(fmtDate(j.started_at))} UTC</div></div></div>
    <div class="runbox"><div class="stack">
      <div class="card">
        <div class="row" style="align-items:flex-end;margin-bottom:12px"><div class="bignum"><span id="rc-done">0</span><span class="muted" style="font-size:18px"> / <span id="rc-total">…</span></span></div>
          <div class="spacer"></div><div class="right"><div class="muted small" id="rc-elapsed"></div><div><b id="rc-eta"></b></div></div></div>
        <div class="bar"><i id="rc-bar" style="width:0"></i></div>
        <div style="margin-top:14px" id="rc-status"></div>
      </div>
      <div class="card"><h2>Recent findings</h2><div id="rc-thumbs"><p class="muted">Photos with findings appear here as the run goes.</p></div></div>
    </div>
    <div class="card"><h2>Log</h2><div class="events" id="rc-log"><p class="muted">Waiting…</p></div></div></div></div>`;
    root = $("#runview");
  }
  const c = j.counts || {};
  $("#rc-done").textContent = c.done ?? 0;
  $("#rc-total").textContent = c.total || "…";
  $("#rc-elapsed").textContent = `Elapsed ${fmtSecs(c.elapsed_s)}`;
  $("#rc-eta").textContent = j.state === "running" && c.eta_s != null ? `About ${fmtSecs(c.eta_s)} left` : "";
  $("#rc-bar").style.width = `${pct(c.done || 0, c.total || 0)}%`;
  const sig = `${j.state}|${(j.progress || {}).phase}|${(j.progress || {}).code}`;
  if (root.dataset.sig !== sig) {
    root.dataset.sig = sig;
    $("#rc-status").innerHTML = runStatusHtml(j);
    const cb = $("#cancel");
    if (cb) cb.onclick = async () => { await api.post("/api/job/cancel"); toast("Cancelling after the current photo…"); };
    const d = $("#dismiss");
    if (d) d.onclick = () => { S.runDismissed = true; viewNew(); };
  }
  const finds = (j.events || []).filter((e) => e.phase === "running" && e.detections > 0).slice(-12).reverse();
  const fsig = finds.map((e) => e.code).join(",");
  if (finds.length && root.dataset.fsig !== fsig) {
    root.dataset.fsig = fsig;
    const key = j.workspace;
    $("#rc-thumbs").innerHTML = `<div class="thumbs">${finds.map((e) => `<a href="#/review/${encodeURIComponent(key)}/${encodeURIComponent(e.code)}" title="${e.detections} finding(s)"><img loading="lazy" src="/api/inspections/${encodeURIComponent(key)}/image/${encodeURIComponent(e.code)}?kind=annotated&t=${encodeURIComponent(e.at)}"><span>${esc(e.code)}</span></a>`).join("")}</div>`;
  }
  const lsig = String((j.events || []).length) + j.state;
  if (root.dataset.lsig !== lsig) {
    root.dataset.lsig = lsig;
    $("#rc-log").innerHTML = (j.events || []).slice().reverse().map((e) => `<div><span class="faint mono">${esc(e.at)}</span><span>${esc(e.code ? `${e.code}: ${e.detections} finding${e.detections === 1 ? "" : "s"}` : e.message || e.phase)}</span></div>`).join("") || '<p class="muted">Waiting…</p>';
  }
}

/* ---------------------------------------------------------------- review */
function blades(points) { return points.filter((p) => p.group === "blade"); }

async function viewReview(key, code) {
  main.innerHTML = '<div class="loading">Loading inspection…</div>';
  const data = await api.get(`/api/inspections/${encodeURIComponent(key)}`);
  const byCode = Object.fromEntries(data.points.map((p) => [p.code, p]));
  const R = (S.review = { key, data, byCode, filter: S.review?.key === key ? S.review.filter : "all", showBoxes: true, actual: false, hot: null, point: null });
  const startCode = code && byCode[code] ? code
    : (data.points.find((p) => p.review_state === "pending" && p.count) || data.points.find((p) => p.review_state === "pending") || data.points.find((p) => p.status === "inspected") || data.points[0])?.code;
  R.current = startCode;
  renderReviewShell();
  await loadPoint(startCode);
  document.onkeydown = reviewKeys;
}

function renderReviewShell() {
  const R = S.review, d = R.data, r = d.review;
  const done = r.approved + r.failed;
  const v = d.validation || {};
  const vbadge = v.ok === false ? `<button class="badge bad" id="showval" style="border:0;cursor:pointer">${v.errors.length} validation errors</button>`
    : v.ok ? `<span class="badge ok" title="Checked ${esc(fmtDate(v.checked_at))}">✓ Valid package</span>` : "";
  const appr = r.package_approved
    ? `<span class="badge ok">✓ Approved by ${esc(r.approved_by)}</span><a class="btn btn-primary" href="#/upload/${encodeURIComponent(R.key)}">Publish →</a>`
    : `<button class="btn" id="bulkclean" ${r.pending ? "" : "disabled"} title="Approve every photo with no findings that is still waiting">Approve clean photos</button>
       <button class="btn btn-ok" id="approvepkg" ${r.pending ? "disabled" : ""} title="${r.pending ? `${r.pending} photos still need a decision` : "Approve the package for upload"}">Approve package…</button>`;
  const up = d.upload && d.upload.status === "published" ? '<span class="badge ok">Published</span>' : "";
  main.innerHTML = `<div class="review-head card" style="padding:12px 18px">
    <div class="title"><h1>${esc(d.turbine_code)} <span class="muted" style="font-weight:500">· ${esc(fmtDate(d.inspection_date).slice(0, 10))}</span></h1>
      <div class="small muted" style="margin-top:3px">ID <span class="mono">${esc(d.inspection_id)}</span> · ${esc(d.model?.model_name || "")} ${esc(d.model?.model_version || "")} · format ${esc(d.schema_version)}</div>
      <div class="small row" style="margin-top:5px;gap:8px">${vbadge}${up}<a href="#/upload/${encodeURIComponent(R.key)}">Package &amp; publish →</a></div></div>
    <div class="stats"><div class="stat"><b>${d.photos}</b><span>photos</span></div><div class="stat"><b>${d.detections}</b><span>findings</span></div>
      <div class="stat"><b>${d.gaps}</b><span>no image</span></div></div>
    <div class="review-progress"><div class="lbl"><span>Reviewed</span><span>${done} / ${r.reviewable}</span></div><div class="bar ok"><i style="width:${pct(done, r.reviewable)}%"></i></div>
      <div class="small faint" style="margin-top:4px">${r.approval_voided ? '<span style="color:var(--warn)">Changed after approval — approve again</span>' : `${d.removed} box${d.removed === 1 ? "" : "es"} removed`}</div></div>
    <div class="row" style="margin-left:auto">${appr}</div>
  </div>
  <div class="review">
    <div class="card mapcard" id="map"></div>
    <div class="card viewer" id="viewer"><div class="loading">Loading…</div></div>
  </div>`;
  renderMap();
  const sv = $("#showval");
  if (sv) sv.onclick = () => modal(`<h2>Validation errors</h2><div class="note bad"><ul>${v.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div><div class="acts"><button class="btn" data-close>Close</button></div>`);
  const bc = $("#bulkclean");
  if (bc) bc.onclick = bulkClean;
  const ap = $("#approvepkg");
  if (ap) ap.onclick = approvePackage;
}

function sqClass(p) {
  const c = ["sq"];
  if (p.status === "unavailable") c.push("unavailable");
  else if (p.status === "failed") c.push("failed");
  else if (p.max_cat) c.push("c" + p.max_cat);
  if (p.review_state === "approved") c.push("approved");
  if (p.code === S.review.current) c.push("sel");
  const f = S.review.filter;
  if ((f === "findings" && !p.count) || (f === "pending" && p.review_state !== "pending")) c.push("dim");
  return c.join(" ");
}
function sqTitle(p) {
  const st = p.status !== "inspected" ? `${p.status}: ${p.reason || ""}` : `${p.count} finding${p.count === 1 ? "" : "s"}${p.max_cat ? " · max CAT " + p.max_cat : ""} · ${p.review_state}`;
  return `${p.code} — ${st}`;
}
const sq = (p) => `<button class="${sqClass(p)}" data-code="${p.code}" title="${esc(sqTitle(p))}" aria-label="${esc(sqTitle(p))}"></button>`;

function renderMap() {
  const R = S.review, pts = R.data.points;
  const f = R.filter;
  let html = `<div class="filters">${[["all", "All"], ["findings", "With findings"], ["pending", "To review"]].map(([k, l]) => `<button class="btn btn-sm ${f === k ? "on" : ""}" data-filter="${k}">${l}</button>`).join("")}</div>`;
  for (const b of [1, 2, 3]) {
    const bp = pts.filter((p) => p.code.startsWith(`B${b}-`));
    const n = bp.reduce((a, p) => a + p.count, 0);
    html += `<div class="blade"><h4><span>Blade ${b}</span><span class="faint">${n} finding${n === 1 ? "" : "s"}</span></h4>`;
    for (const s of SIDES) html += `<div class="prow"><span class="lbl" title="${SIDE_NAMES[s]}">${s}</span><div class="squares">${bp.filter((p) => p.code.slice(3, 5) === s).map(sq).join("")}</div></div>`;
    html += '<div class="axis"><span>root · P01</span><span>P20 · tip</span></div></div>';
  }
  for (const g of ["nacelle", "tower"]) {
    const gp = pts.filter((p) => p.group === g);
    if (!gp.length) continue;
    html += `<div class="blade"><h4><span>${GROUP_NAMES[g]}</span><span class="faint">${gp.length} photos${R.data.schema_version === "1.0" ? " · not in a 1.0 package" : ""}</span></h4><div class="prow"><span class="lbl">${g === "nacelle" ? "NAC" : "TWR"}</span><div class="squares wrap">${gp.map(sq).join("")}</div></div></div>`;
  }
  html += `<div class="legend"><span><i class="sq"></i>Clean</span>${[1, 2, 3, 4, 5].map((c) => `<span><i class="sq c${c}"></i>CAT ${c}</span>`).join("")}
    <span><i class="sq approved"></i>Approved</span><span><i class="sq failed"></i>Unusable</span><span><i class="sq unavailable"></i>No photo</span></div>`;
  const map = $("#map");
  map.innerHTML = html;
  $$("[data-filter]", map).forEach((b) => (b.onclick = () => { R.filter = b.dataset.filter; renderMap(); }));
  $$(".sq[data-code]", map).forEach((b) => (b.onclick = () => loadPoint(b.dataset.code)));
}

function updateSquare(code) {
  const p = S.review.byCode[code];
  const el = $(`.sq[data-code="${code}"]`);
  if (el && p) { el.className = sqClass(p); el.title = sqTitle(p); }
}

async function loadPoint(code) {
  const R = S.review;
  const prev = R.current;
  R.current = code;
  R.hot = null;
  updateSquare(prev);
  updateSquare(code);
  history.replaceState(null, "", `#/review/${encodeURIComponent(R.key)}/${encodeURIComponent(code)}`);
  const p = R.byCode[code];
  if (!p || p.status === "unavailable" || (p.status === "failed" && !p.review_state)) {
    R.point = null;
    renderViewer(p);
    return;
  }
  try {
    R.point = await api.get(`/api/inspections/${encodeURIComponent(R.key)}/points/${encodeURIComponent(code)}`);
    if (R.current === code) renderViewer(p);
  } catch (e) { toast(e.message, "bad"); }
}

function describeCode(code, group) {
  if (group === "nacelle" || group === "tower") return `${GROUP_NAMES[group]} · photo ${Number(code.slice(4))}`;
  return `Blade ${code[1]} · ${SIDE_NAMES[code.slice(3, 5)]} · point ${Number(code.slice(6))}`;
}

function renderViewer(mp) {
  const R = S.review, pt = R.point, el = $("#viewer");
  const code = R.current;
  const nav = `<div class="row"><button class="btn btn-sm" id="prev" title="Previous (←)">←</button><button class="btn btn-sm" id="next" title="Next (→)">→</button>
    <button class="btn btn-sm" id="nextpending" title="Next photo to review (N)">Next to review <kbd>N</kbd></button></div>`;
  if (!pt) {
    el.innerHTML = `<div class="viewer-head"><span class="code">${esc(code)}</span><span class="muted">${esc(describeCode(code, mp?.group))}</span><span class="spacer"></span>${nav}</div>
      <div class="stage"><div class="empty-stage"><b>${esc(mp?.status === "failed" ? "Photo could not be processed" : "No photo for this point")}</b><br>${esc(mp?.reason || "")}<br><span class="small">It goes into points.json as "${esc(mp?.status)}" with this reason.</span></div></div>`;
    wireNav();
    return;
  }
  const stateLabel = pt.review_state === "approved" ? '<span class="badge ok">✓ Approved</span>'
    : pt.review_state === "failed" ? `<span class="badge bad">Unusable — ${esc(pt.review_reason)}</span>` : '<span class="badge warn">To review</span>';
  const img = `/api/inspections/${encodeURIComponent(R.key)}/image/${encodeURIComponent(code)}?kind=webp`;
  const boxes = pt.detections.map((d, i) => {
    const b = d.bbox, col = CAT_COLOURS[d.severity_suggested];
    return `<div class="box ${d.removed ? "removed" : ""}" data-i="${i}" style="left:${b.x_min * 100}%;top:${b.y_min * 100}%;width:${(b.x_max - b.x_min) * 100}%;height:${(b.y_max - b.y_min) * 100}%;border-color:${col}">
      <span class="tag" style="background:${col}">${i + 1} · ${esc(S.info.classes[d.class]?.label || d.class)} ${d.confidence.toFixed(2)}</span></div>`;
  }).join("");
  const dets = pt.detections.length ? pt.detections.map((d, i) => `<div class="det ${d.removed ? "removed" : ""}" data-i="${i}">
      <div class="num" style="background:${CAT_COLOURS[d.severity_suggested]}">${i + 1}</div>
      <div class="det-main"><div class="t">${esc(S.info.classes[d.class]?.label || d.class)} ${catBadge(d.severity_suggested)} <span class="muted small">conf ${d.confidence.toFixed(2)}</span></div>
        <div class="s">${d.length_mm != null ? `${d.length_mm} × ${d.width_mm} mm` : "size unknown"} · ${esc(d.severity_reason)}</div>
        ${(d.flags || []).map((f) => `<div class="flag">⚠ ${esc(f)}</div>`).join("")}
        ${d.removed && d.removed_note ? `<div class="s">Removed: ${esc(d.removed_note)}</div>` : ""}</div>
      <div>${d.removed ? `<button class="btn btn-sm" data-restore="${d.detection_id}">Restore</button>` : `<button class="btn btn-sm btn-danger" data-remove="${d.detection_id}" title="Remove this box (X)">Remove</button>`}</div></div>`).join("")
    : '<p class="muted">No findings above the class thresholds — a clean point.</p>';
  const dropped = pt.dropped || {};
  const unknown = Object.entries(dropped.unknown_class || {}).map(([k, n]) => `${k} ×${n}`).join(", ");
  const info = [
    ["Photo", pt.source], ["Captured", fmtDate(pt.captured_at)], ["Original", pt.orig_width ? `${pt.orig_width} × ${pt.orig_height}` : "—"],
    ["WebP", `${pt.image_width} × ${pt.image_height}`], ["Zone", pt.zone || "—"],
    ["Distance to blade", pt.distance_to_target_m ? `${pt.distance_to_target_m} m (${pt.distance_source})` : "unknown"],
    ["mm per px (WebP)", pt.mm_per_px ?? "unknown"],
    ["Dropped", `${dropped.below_threshold || 0} below threshold${unknown ? ` · unknown classes: ${unknown}` : ""}`],
  ].map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join("");
  const failed = pt.review_state === "failed";
  el.innerHTML = `<div class="viewer-head"><span class="code">${esc(code)}</span><span class="muted">${esc(describeCode(code, pt.group))}</span>${stateLabel}<span class="spacer"></span>${nav}</div>
    <div class="stage ${R.showBoxes ? "" : "noboxes"} ${R.actual ? "actual" : ""}" id="stage"><div class="frame"><img src="${img}" alt="${esc(code)}" draggable="false"><div class="boxes">${failed ? "" : boxes}</div></div></div>
    <div class="toolbar">
      ${failed ? `<button class="btn" id="reset">Restore photo <kbd>R</kbd></button>`
        : `<button class="btn btn-ok" id="approve" ${pt.review_state === "approved" ? "disabled" : ""}>✓ Approve <kbd>A</kbd></button>
           <button class="btn" id="fail">Mark unusable <kbd>U</kbd></button>
           ${pt.review_state === "approved" ? '<button class="btn" id="reset">Undo approval <kbd>R</kbd></button>' : ""}`}
      <span class="spacer"></span>
      <label class="check"><input type="checkbox" id="tboxes" ${R.showBoxes ? "checked" : ""}> Boxes <kbd>B</kbd></label>
      <button class="btn btn-sm" id="tactual">${R.actual ? "Fit to width" : "Actual size"} <kbd>F</kbd></button>
      <a class="btn btn-sm" target="_blank" href="/api/inspections/${encodeURIComponent(R.key)}/image/${encodeURIComponent(code)}?kind=annotated">Annotated copy ↗</a>
    </div>
    <div class="side-panel"><div><h3>Findings (${pt.kept_count})</h3><div class="dets">${failed ? '<p class="muted">Marked unusable: this point has no image or findings in the package.</p>' : dets}</div></div>
      <div><h3>Point</h3><div class="pointinfo">${info}</div>${pt.reviewed_by ? `<p class="small faint" style="margin-top:12px">Last decision by ${esc(pt.reviewed_by)} · ${esc(fmtDate(pt.reviewed_at))}</p>` : ""}</div></div>`;
  wireNav();
  const on = (id, fn) => { const b = $("#" + id); if (b) b.onclick = fn; };
  on("approve", () => act("approve", { advance: true }));
  on("fail", markUnusable);
  on("reset", () => act("reset"));
  $("#tboxes").onchange = (e) => { R.showBoxes = e.target.checked; $("#stage").classList.toggle("noboxes", !R.showBoxes); };
  on("tactual", () => { R.actual = !R.actual; renderViewer(mp); });
  $$("[data-remove]").forEach((b) => (b.onclick = () => act("remove_detection", { detection_id: b.dataset.remove })));
  $$("[data-restore]").forEach((b) => (b.onclick = () => act("restore_detection", { detection_id: b.dataset.restore })));
  const hot = (i) => { R.hot = i; $$(".box, .det").forEach((x) => x.classList.toggle("hot", x.dataset.i === String(i))); };
  $$(".det, .box").forEach((x) => { x.onmouseenter = () => hot(x.dataset.i); x.onmouseleave = () => hot(null); });
  $$(".box").forEach((x) => (x.onclick = () => { const row = $(`.det[data-i="${x.dataset.i}"]`); if (row) row.scrollIntoView({ block: "nearest" }); hot(x.dataset.i); }));
}

function wireNav() {
  const b = (id, fn) => { const el = $("#" + id); if (el) el.onclick = fn; };
  b("prev", () => step(-1));
  b("next", () => step(1));
  b("nextpending", nextPending);
}

function orderedCodes() { return S.review.data.points.map((p) => p.code); }
function step(dir) {
  const codes = orderedCodes();
  const R = S.review;
  let i = codes.indexOf(R.current);
  for (let k = 0; k < codes.length; k++) {
    i = (i + dir + codes.length) % codes.length;
    const p = R.byCode[codes[i]];
    const f = R.filter;
    if ((f === "findings" && !p.count) || (f === "pending" && p.review_state !== "pending")) continue;
    return loadPoint(codes[i]);
  }
}
function nextPending() {
  const codes = orderedCodes();
  const R = S.review;
  const i = codes.indexOf(R.current);
  for (let k = 1; k <= codes.length; k++) {
    const c = codes[(i + k) % codes.length];
    if (R.byCode[c].review_state === "pending") return loadPoint(c);
  }
  toast("Every photo has a decision. Approve the package when ready.", "ok");
}

async function act(action, extra = {}) {
  const R = S.review;
  const by = await ensureReviewer();
  if (!by) return;
  const code = R.current;
  try {
    const res = await api.post(`/api/inspections/${encodeURIComponent(R.key)}/review`, { code, action, by, ...extra });
    const pt = res.point;
    R.point = pt;
    const mp = R.byCode[code];
    Object.assign(mp, {
      review_state: pt.review_state, count: pt.kept_count, max_cat: pt.max_cat,
      status: pt.review_state === "failed" ? "failed" : pt.status,
    });
    R.data.review = res.review;
    if (["remove_detection", "restore_detection", "fail", "reset"].includes(action)) R.data.validation = null;
    R.data.detections = R.data.points.reduce((a, p) => a + (p.status === "inspected" ? p.count : 0), 0);
    if (action === "remove_detection") R.data.removed += 1;
    if (action === "restore_detection") R.data.removed -= 1;
    const keepCode = R.current;
    renderReviewShell();
    R.current = keepCode;
    renderViewer(mp);
    if (action === "remove_detection") toast("Box removed. It stays in the QA note for retraining.");
    if (extra.advance) nextPending();
  } catch (e) { toast(e.message, "bad"); }
}

async function markUnusable() {
  const reason = await askText({ title: `Mark ${S.review.current} unusable`, body: '<p class="muted">The point becomes "failed" in points.json with this reason, with no image and no findings.</p>', label: "Reason", quick: FAIL_REASONS, okText: "Mark unusable", danger: true });
  if (reason) act("fail", { reason, advance: true });
}

async function bulkClean() {
  const R = S.review;
  const clean = R.data.points.filter((p) => p.review_state === "pending" && !p.count).length;
  if (!clean) return toast("No clean photos are waiting for review.");
  if (!(await confirmBox(`Approve ${clean} clean photos?`, `<p>These photos have no findings above the thresholds. Approving them in bulk is quick, but the model can miss defects — skim them first if you have time.</p>`, `Approve ${clean}`))) return;
  const by = await ensureReviewer();
  if (!by) return;
  try {
    const r = await api.post(`/api/inspections/${encodeURIComponent(R.key)}/bulk`, { action: "approve_clean", by });
    toast(`${r.approved} clean photos approved`, "ok");
    viewReview(R.key, R.current);
  } catch (e) { toast(e.message, "bad"); }
}

async function approvePackage() {
  const R = S.review, d = R.data;
  const by = await ensureReviewer();
  if (!by) return;
  const byCat = {};
  d.points.forEach((p) => { if (p.max_cat && p.status === "inspected") byCat[p.max_cat] = (byCat[p.max_cat] || 0) + 1; });
  const failed = d.points.filter((p) => p.status === "failed").length;
  const unavailable = d.points.filter((p) => p.status === "unavailable").length;
  modal(`<h2>Approve package for publishing</h2>
    <p><b>${esc(d.turbine_code)}</b> · ${esc(fmtDate(d.inspection_date))} · format ${esc(d.schema_version)}</p>
    <div class="note"><ul style="margin:0">
      <li>${d.photos - failed + (d.gaps - failed - unavailable)} photos with images, ${d.detections} findings ${Object.keys(byCat).sort().map((c) => catBadge(Number(c)) + "×" + byCat[c]).join(" ")}</li>
      <li>${failed} marked unusable, ${unavailable} with no photo — package status will be <b>${failed + unavailable ? "partial" : "complete"}</b></li>
      <li>${d.removed} boxes removed in review (kept in the QA note)</li></ul></div>
    <label class="field" style="margin-top:12px"><span>Approved by</span><input type="text" id="apby" value="${esc(by)}"></label>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="apok"> <span>I reviewed the findings and the package is ready to publish to CompliQ.</span></label>
    <div id="aperr"></div>
    <div class="acts"><button class="btn" data-close>Cancel</button><button class="btn btn-ok" id="apgo" disabled>Approve</button></div>`,
  (m, close) => {
    $("#apok", m).onchange = (e) => ($("#apgo", m).disabled = !e.target.checked);
    $("#apgo", m).onclick = async () => {
      $("#apgo", m).disabled = true;
      try {
        await api.post(`/api/inspections/${encodeURIComponent(R.key)}/approve`, { by: $("#apby", m).value.trim() });
        close();
        toast("Package approved — ready to publish", "ok");
        location.hash = `#/upload/${encodeURIComponent(R.key)}`;
      } catch (e) { $("#aperr", m).innerHTML = `<div class="note bad" style="margin-top:10px">${esc(e.message)}</div>`; $("#apgo", m).disabled = false; }
    };
  });
}

function reviewKeys(e) {
  if (!S.review || !$("#modal").hidden || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const R = S.review, pt = R.point;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "arrowright") { e.preventDefault(); step(1); }
  else if (k === "arrowleft") { e.preventDefault(); step(-1); }
  else if (k === "n") nextPending();
  else if (k === "b") { R.showBoxes = !R.showBoxes; const c = $("#tboxes"); if (c) c.checked = R.showBoxes; $("#stage")?.classList.toggle("noboxes", !R.showBoxes); }
  else if (k === "f") $("#tactual")?.click();
  else if (!pt) return;
  else if (k === "a" && pt.review_state === "pending") act("approve", { advance: true });
  else if (k === "u" && pt.review_state !== "failed") markUnusable();
  else if (k === "r" && pt.review_state !== "pending") act("reset");
  else if (/^[1-9]$/.test(k) && pt.detections[Number(k) - 1]) {
    R.hot = String(Number(k) - 1);
    $$(".box, .det").forEach((x) => x.classList.toggle("hot", x.dataset.i === R.hot));
  } else if ((k === "x" || k === "delete") && R.hot != null && pt.detections[R.hot] && !pt.detections[R.hot].removed) {
    act("remove_detection", { detection_id: pt.detections[R.hot].detection_id });
  }
}

/* ---------------------------------------------------------------- package + upload */
async function viewUpload(key) {
  main.innerHTML = '<div class="loading">Loading package…</div>';
  const [d, info] = await Promise.all([api.get(`/api/inspections/${encodeURIComponent(key)}`), api.get("/api/info")]);
  S.info = info;
  const r = d.review, v = d.validation || { errors: [], warnings: [] };
  const up = d.upload;
  const insp = d.inspection || {};
  const cf = info.settings.cloudflare || {};
  const connected = !!(cf.account_id && cf.d1_database_id && cf.api_token_set && cf.r2_access_key_id && cf.r2_secret_access_key_set);
  const valHtml = v.ok === false ? `<div class="note bad"><b>${v.errors.length} errors</b><ul>${v.errors.slice(0, 30).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`
    : v.ok ? '<div class="note ok">✓ Passes every rule in the ML spec' + (d.schema_version === "1.1" ? " plus the 1.1 nacelle/tower rules" : "") + ".</div>" : '<div class="note">Not validated yet.</div>';
  const warnHtml = (v.warnings || []).length ? `<details><summary>${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"}</summary><ul class="small">${v.warnings.slice(0, 40).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : "";
  const published = up && up.status === "published";
  main.innerHTML = `<div class="page-head"><div><h1>Package · ${esc(d.turbine_code)} <span class="muted" style="font-weight:500">${esc(fmtDate(d.inspection_date).slice(0, 10))}</span></h1>
      <div class="sub">Inspection ID <span class="mono">${esc(d.inspection_id)}</span></div></div>
    <div class="actions"><a class="btn" href="#/review/${encodeURIComponent(key)}">← Review</a></div></div>
  <div class="grid2">
    <div class="stack">
      <div class="card"><h2>Package contents</h2>
        <div class="pointinfo" style="margin-bottom:14px">
          <div><span>Turbine</span>${esc(d.turbine_code)}</div><div><span>Blade length</span>${insp.blade_length_m != null ? esc(insp.blade_length_m) + " m" : "not set"}</div>
          <div><span>Images</span>${d.photos}</div><div><span>Findings</span>${d.detections}</div>
          <div><span>Failed / unavailable</span>${d.gaps}</div><div><span>Model</span>${esc(d.model?.model_name)} ${esc(d.model?.model_version)}</div></div>
        <label class="field"><span>Package format</span><select id="fmt">
          <option value="1.0" ${d.schema_version === "1.0" ? "selected" : ""}>1.0 — blades only</option>
          <option value="1.1" ${d.schema_version === "1.1" ? "selected" : ""}>1.1 — blades + nacelle + tower</option></select>
          <small>CompliQ shows blades today. The database is ready for nacelle and tower (1.1). Changing it rebuilds the package and needs approval again.</small></label>
        <div class="row" style="margin-top:14px"><button class="btn btn-sm" data-open="package">Open package folder</button><button class="btn btn-sm" data-open="qa">Open QA folder</button><button class="btn btn-sm" id="reval">Re-validate</button></div>
        <p class="small faint mono" style="margin-top:10px;word-break:break-all">${esc(d.package_dir)}</p>
      </div>
      <div class="card"><h2>Validation</h2>${valHtml}${warnHtml}</div>
    </div>
    <div class="stack">
      <div class="card"><h2>Publish to CompliQ</h2>
        ${!connected ? `<div class="note warn">The CompliQ connection is not set up on this laptop. Add the Cloudflare keys in <a href="#/settings">Settings</a>.</div>`
          : `${r.package_approved ? `<div class="note ok" style="margin-bottom:14px">✓ Approved by <b>${esc(r.approved_by)}</b> · ${esc(fmtDate(r.approved_at))} UTC</div>`
            : `<div class="note warn" style="margin-bottom:14px">${r.approval_voided ? "The package changed after it was approved." : "Not approved yet."} Publishing unlocks after the package is approved in <a href="#/review/${encodeURIComponent(key)}">Review</a>.</div>`}
          <div class="stack">
            <label class="field"><span>Organization</span><select id="org"><option value="">Loading…</option></select></label>
            <label class="field"><span>Turbine</span><select id="turb" disabled><option value="">Choose the organization first</option></select>
              <small>Turbines already in CompliQ for this organization. Pick "Add a new turbine" if it isn't there.</small></label>
            <div id="turbdetail"></div>
          </div>
          <div class="row" style="margin-top:14px"><button class="btn btn-primary btn-lg" id="publish" disabled>${published ? "Publish again" : up && up.status === "incomplete" ? "Resume publishing" : "Publish"}</button>
            <span class="small muted">Sends the images, writes the inspection to the database, then makes it visible in the dashboard.</span></div>
          <div id="upstatus" style="margin-top:14px"></div>`}
      </div>
      ${up ? `<div class="card"><h2>In CompliQ</h2>${published
        ? `<div class="note ok">Published to <b>${esc(up.org_name || "")}</b> · ${esc(up.turbine || d.turbine_code)} on ${esc(fmtDate(up.finished_at))} UTC, approved by ${esc(up.approved_by || "")}.<br>${up.images_sent} images sent${up.images_already_there ? `, ${up.images_already_there} already there` : ""}. It is on the dashboard's Inspections tab.</div>
           ${connected ? `<div class="row" style="margin-top:12px"><button class="btn btn-danger" id="unpublish">Delete from CompliQ…</button><span class="small muted">Removes this inspection and its images from the dashboard. The files on this laptop stay.</span></div>` : ""}`
        : up.status === "deleted" ? `<div class="note">Deleted from CompliQ on ${esc(fmtDate(up.deleted_at))} UTC by ${esc(up.deleted_by || "")}. Publish again to put it back.</div>`
        : `<div class="note warn">Not finished: ${esc(up.error)}${(up.details || []).length ? `<ul>${up.details.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}<br>Publish again to finish — images already sent are skipped.</div>`}</div>` : ""}
    </div>
  </div>`;
  $$("[data-open]").forEach((b) => (b.onclick = async () => {
    const res = await api.post(`/api/inspections/${encodeURIComponent(key)}/open`, { which: b.dataset.open });
    if (!res.ok) toast(`Could not open the folder: ${res.path}`, "bad");
  }));
  $("#reval").onclick = async () => { try { await api.post(`/api/inspections/${encodeURIComponent(key)}/validate`); toast("Validated"); viewUpload(key); } catch (e) { toast(e.message, "bad"); } };
  $("#fmt").onchange = async (e) => {
    const ok = await confirmBox("Change package format?", `<p>The package is rebuilt as ${esc(e.target.value)}${r.package_approved ? " and needs approval again" : ""}.</p>`, "Rebuild");
    if (!ok) { e.target.value = d.schema_version; return; }
    try { await api.post(`/api/inspections/${encodeURIComponent(key)}/schema`, { schema_version: e.target.value }); toast(`Rebuilt as ${e.target.value}`); viewUpload(key); }
    catch (err) { toast(err.message, "bad"); }
  };
  const un = $("#unpublish");
  if (un) un.onclick = () => unpublishDialog(key, d.turbine_code);
  if (connected) setupPublishForm(key, d, insp, r);
  const job = S.job && ["publish", "unpublish"].includes(S.job.kind) && S.job.workspace === key ? S.job : null;
  if (job) renderUploadStatus();
}

const NEW_TURBINE = "__new__";
const TURBINE_FIELDS = [
  ["code", "Turbine code", "text", true], ["name", "Name", "text"], ["site", "Site", "text"], ["state", "State", "text"],
  ["latitude", "Latitude", "number"], ["longitude", "Longitude", "number"], ["manufacturer", "Manufacturer", "text"],
  ["model", "Model", "text"], ["blade_length_m", "Blade length (m)", "number", true], ["rotor_diameter_m", "Rotor diameter (m)", "number"],
  ["hub_height_m", "Hub height (m)", "number"], ["rated_power_mw", "Rated power (MW)", "number"], ["commissioned_year", "Commissioned (year)", "number"],
];

async function setupPublishForm(key, d, insp, r) {
  const orgSel = $("#org"), turbSel = $("#turb"), detail = $("#turbdetail"), pub = $("#publish");
  let turbines = [];
  const pkgCode = String(d.turbine_code || "").toUpperCase();
  const want = insp.cloud_target?.org_id || localStorage.getItem("studio.org") || "";
  try {
    const orgs = await api.get("/api/cloud/orgs");
    orgSel.innerHTML = `<option value="">Choose the organization…</option>` + orgs.map((o) => `<option value="${esc(o.id)}" ${o.id === want ? "selected" : ""}>${esc(o.name)}${o.is_platform ? " (platform)" : ""}</option>`).join("");
  } catch (e) { orgSel.innerHTML = `<option value="">Could not load</option>`; detail.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }

  const current = () => turbSel.value === NEW_TURBINE ? null : turbines.find((t) => t.code === turbSel.value);
  const loadTurbines = async () => {
    turbSel.disabled = true; pub.disabled = true; detail.innerHTML = "";
    if (!orgSel.value) { turbSel.innerHTML = `<option value="">Choose the organization first</option>`; return; }
    localStorage.setItem("studio.org", orgSel.value);
    turbSel.innerHTML = `<option>Loading…</option>`;
    try { turbines = await api.get(`/api/cloud/turbines?org_id=${encodeURIComponent(orgSel.value)}`); }
    catch (e) { detail.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; return; }
    const match = turbines.find((t) => t.code.toUpperCase() === pkgCode);
    turbSel.innerHTML = `<option value="">Choose the turbine…</option>` + turbines.map((t) => `<option value="${esc(t.code)}" ${match === t ? "selected" : ""}>${esc(t.code)}${t.name && t.name !== t.code ? " — " + esc(t.name) : ""}${t.site ? " · " + esc(t.site) : ""}</option>`).join("") + `<option value="${NEW_TURBINE}" ${match ? "" : "selected"}>+ Add a new turbine…</option>`;
    turbSel.disabled = false;
    renderDetail();
  };

  const field = (t, [k, label, type, req], editable) => `<label class="field"><span>${esc(label)}${req ? " *" : ""}</span><input type="${type}" data-t="${k}" value="${esc(t[k] ?? "")}" ${editable ? "" : "disabled"} ${type === "number" ? 'step="any"' : ""}></label>`;
  const renderDetail = () => {
    const t = current();
    const isNew = turbSel.value === NEW_TURBINE;
    if (!turbSel.value) { detail.innerHTML = ""; pub.disabled = true; return; }
    const base = isNew ? { code: d.turbine_code, blade_length_m: insp.blade_length_m, blade_serials: ["", "", ""] } : t;
    const serials = (base.blade_serials || []).concat(["", "", ""]).slice(0, 3);
    const needSerials = isNew || serials.some((x) => !String(x).trim());
    const otherCode = !isNew && t.code.toUpperCase() !== pkgCode;
    const lenDiff = !isNew && t.blade_length_m && insp.blade_length_m && Math.abs(t.blade_length_m - insp.blade_length_m) > 0.05;
    detail.innerHTML = `${otherCode ? `<div class="note warn" style="margin-bottom:10px">This package was built for <b>${esc(d.turbine_code)}</b>. To publish it under <b>${esc(t.code)}</b>, switch the package to that turbine (it is rebuilt and needs approval again).
          <div style="margin-top:8px"><button class="btn btn-sm" id="switchturb">Switch package to ${esc(t.code)}</button></div></div>` : ""}
      ${lenDiff ? `<div class="note warn" style="margin-bottom:10px">Blade length differs: CompliQ has ${esc(t.blade_length_m)} m, this package used ${esc(insp.blade_length_m)} m (distances along the blade come from the package).</div>` : ""}
      ${isNew ? `<div class="note" style="margin-bottom:10px">New turbine for this organization. It appears in the dashboard's fleet once published.</div>` : `<p class="small muted" style="margin:0 0 8px">${t.in_database ? `In CompliQ with ${t.inspections || 0} published inspection${t.inspections === 1 ? "" : "s"}.` : "In the dashboard's fleet; added to the inspection database on first publish."}</p>`}
      <div class="fields">${TURBINE_FIELDS.map((f) => field(base, f, isNew)).join("")}</div>
      <h3 style="margin-top:14px">Blade serials${needSerials ? " *" : ""}</h3>
      <div class="fields">${["A", "B", "C"].map((b, i) => `<label class="field"><span>Blade ${b} (B${i + 1})</span><input type="text" data-serial="${i}" value="${esc(serials[i])}" ${needSerials ? "" : "disabled"}></label>`).join("")}</div>`;
    const sw = $("#switchturb");
    if (sw) sw.onclick = async () => {
      if (!(await confirmBox(`Switch to ${t.code}?`, `<p>The package is rebuilt for <b>${esc(t.code)}</b>${t.blade_length_m ? ` with blade length ${esc(t.blade_length_m)} m` : ""}. Photo decisions stay; approve the package again.</p>`, "Switch"))) return;
      try { await api.post(`/api/inspections/${encodeURIComponent(key)}/turbine`, { code: t.code, blade_length_m: t.blade_length_m, org_id: orgSel.value, org_name: orgSel.selectedOptions[0]?.textContent }); toast("Switched — approve the package again"); location.hash = `#/review/${encodeURIComponent(key)}`; }
      catch (e) { toast(e.message, "bad"); }
    };
    pub.disabled = !r.package_approved || otherCode;
  };
  orgSel.onchange = loadTurbines;
  turbSel.onchange = renderDetail;
  if (orgSel.value) loadTurbines();

  pub.onclick = async () => {
    const isNew = turbSel.value === NEW_TURBINE;
    const t = isNew ? {} : { ...current() };
    $$("#turbdetail [data-t]").forEach((el) => { if (isNew || !el.disabled) t[el.dataset.t] = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value.trim(); });
    if (isNew || $$("#turbdetail [data-serial]").some((el) => !el.disabled)) t.blade_serials = $$("#turbdetail [data-serial]").map((el) => el.value.trim());
    const errs = [];
    if (!t.code) errs.push("turbine code");
    if (String(t.code || "").toUpperCase() !== pkgCode) errs.push(`turbine code must be ${d.turbine_code} (the package's turbine)`);
    if (!t.blade_length_m) errs.push("blade length");
    if ((t.blade_serials || []).length !== 3 || t.blade_serials.some((x) => !x)) errs.push("all three blade serials");
    if (errs.length) return toast("Missing: " + errs.join(", "), "bad");
    const orgName = orgSel.selectedOptions[0]?.textContent || "";
    if (!(await confirmBox("Publish to CompliQ?", `<p><b>${esc(d.turbine_code)}</b> · ${esc(fmtDate(d.inspection_date).slice(0, 10))} → <b>${esc(orgName)}</b>.</p><p>Everyone in that organization will see it on the dashboard as soon as it finishes.</p>`, "Publish"))) return;
    try {
      S.job = await api.post(`/api/inspections/${encodeURIComponent(key)}/publish`, { org_id: orgSel.value, org_name: orgName, turbine: t });
      renderUploadStatus(); pollSoon();
    } catch (e) { toast(e.message, "bad"); }
  };
}

async function unpublishDialog(key, code) {
  const by = await ensureReviewer();
  if (!by) return;
  const typed = await askText({ title: "Delete from CompliQ", body: `<p>This removes the inspection, its findings and its images from the dashboard for everyone. The package on this laptop stays, so you can publish again.</p><p>Type <b>${esc(code)}</b> to confirm.</p>`, label: "Turbine code", okText: "Delete", danger: true });
  if (!typed) return;
  try { S.job = await api.post(`/api/inspections/${encodeURIComponent(key)}/unpublish`, { by, confirm: typed }); renderUploadStatus(); pollSoon(); }
  catch (e) { toast(e.message, "bad"); }
}

const UPLOAD_STEPS = [["checking", "Check"], ["turbine", "Turbine"], ["images", "Images"], ["database", "Database"], ["publishing", "Publish"]];
function renderUploadStatus() {
  const box = $("#upstatus");
  const j = S.job;
  if (!box || !j || !["publish", "unpublish"].includes(j.kind)) return;
  const p = j.progress || {};
  if (j.kind === "unpublish") {
    box.innerHTML = j.state === "running" ? `<p class="muted"><span class="spin"></span> ${esc(p.message || "Deleting…")} ${p.total ? `${p.done}/${p.total}` : ""}</p>`
      : j.state === "done" ? `<div class="note ok">Deleted from CompliQ (${j.result.images_deleted} images).</div>` : `<div class="note bad">${esc(j.error)}</div>`;
    return;
  }
  const at = UPLOAD_STEPS.findIndex(([k]) => k === p.phase);
  const steps = UPLOAD_STEPS.map(([k, l], i) => `<span class="chip ${j.state === "done" || i < at ? "ok" : ""}" ${i === at && j.state === "running" ? 'style="background:#e8efff;color:#1d4ed8"' : ""}>${i === at && j.state === "running" ? '<span class="spin" style="width:10px;height:10px"></span> ' : ""}${l}</span>`).join("");
  let body = "";
  if (j.state === "running" && p.total && ["images", "database"].includes(p.phase)) body = `<div class="bar" style="margin-top:10px"><i style="width:${pct(p.done, p.total)}%"></i></div><p class="small muted" style="margin-top:6px">${p.phase === "images" ? `${p.done} / ${p.total} images` : `${p.done} / ${p.total} database rows`}</p>`;
  if (j.state === "done") body = `<div class="note ok" style="margin-top:10px"><b>${j.result.already_published ? "Already published" : "Published"}.</b> ${j.result.images_sent} images sent${j.result.images_already_there ? `, ${j.result.images_already_there} already there` : ""}. Open the dashboard's Inspections tab to see it.</div>`;
  if (j.state === "error" || j.state === "cancelled") body = `<div class="note bad" style="margin-top:10px"><b>${esc(j.error)}</b>${(j.details || []).length ? `<ul>${j.details.slice(0, 15).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}<br>Publish again to finish.</div>`;
  box.innerHTML = `<div class="chips">${steps}</div>${body}${j.state === "running" ? '<button class="btn btn-sm btn-danger" id="upcancel" style="margin-top:10px">Cancel</button>' : ""}`;
  const c = $("#upcancel");
  if (c) c.onclick = () => api.post("/api/job/cancel");
}

/* ---------------------------------------------------------------- settings */
async function viewSettings() {
  S.info = await api.get("/api/info");
  const s = S.info.settings;
  const f = (sec, key, label, type = "text", hint = "", extra = "") => {
    const val = (s[sec] || {})[key];
    return `<label class="field"><span>${esc(label)}</span><input type="${type}" data-s="${sec}.${key}" value="${esc(val ?? "")}" ${extra}>${hint ? `<small>${hint}</small>` : ""}</label>`;
  };
  const sel = (sec, key, label, opts, hint = "") => `<label class="field"><span>${esc(label)}</span><select data-s="${sec}.${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String((s[sec] || {})[key]) === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>${hint ? `<small>${hint}</small>` : ""}</label>`;
  const secret = (key, label, hint) => {
    const isSet = (s.cloudflare || {})[`${key}_set`];
    return `<label class="field"><span>${esc(label)} ${isSet ? '<span class="badge ok">saved</span>' : '<span class="badge warn">not set</span>'}</span><input type="password" autocomplete="off" data-s="cloudflare.${key}" placeholder="${isSet ? "•••••••• (leave empty to keep)" : ""}">${hint ? `<small>${hint}</small>` : ""}</label>`;
  };
  const chk = (sec, key, label) => `<label class="check"><input type="checkbox" data-s="${sec}.${key}" ${(s[sec] || {})[key] ? "checked" : ""}> <span>${esc(label)}</span></label>`;
  const classes = Object.entries(S.info.classes).map(([c, d]) => `<tr><td class="mono">${esc(c)}</td><td>${esc(d.label)}</td><td>${d.cat[0]}–${d.cat[1]}</td><td>${d.threshold.toFixed(2)}</td></tr>`).join("");
  main.innerHTML = `<div class="page-head"><div><h1>Settings</h1><div class="sub">Saved to <code>config/settings.local.yaml</code> in ${esc(S.info.project)}</div></div>
    <div class="actions"><button class="btn btn-primary" id="save">Save settings</button></div></div>
  <div class="grid2"><div class="stack">
    <div class="card"><h2>Model</h2><div class="fields">
      ${f("model", "path", "Model file", "text", "Relative to the app folder, e.g. models/model.pt")}
      ${f("model", "imgsz", "Inference size", "number", "ML spec uses 1024")}
      ${sel("model", "device", "Device", [["auto", "Auto (GPU if available)"], ["cpu", "CPU"], ["0", "GPU 0"]])}
      ${f("model", "name", "Model name override", "text", "Empty = models/model.json or file name")}
      ${f("model", "version", "Model version override", "text")}
    </div><div style="margin-top:12px">${chk("model", "tiled", "Small-defect mode: also run on overlapping tiles (SAHI-style, slower)")}</div>
    <div class="fields" style="margin-top:10px">${f("model", "tile_size", "Tile size (px)", "number")}${f("model", "tile_overlap", "Tile overlap", "number", "", 'step="0.05" min="0" max="0.5"')}</div></div>
    <div class="card"><h2>Package and export</h2><div class="fields">
      ${sel("package", "schema_version", "Default package format", [["1.1", "1.1 — blades + nacelle + tower"], ["1.0", "1.0 — blades only"]])}
      ${f("package", "output_dir", "Output folder", "text", "Where packages and QA folders go")}
      ${f("export", "long_edge", "WebP longest edge (px)", "number", "ML spec: 1600")}
      ${f("export", "webp_quality", "WebP quality", "number", "ML spec: about 80")}
      ${f("export", "annotated_long_edge", "Annotated copy longest edge (px)", "number")}
    </div></div>
    <div class="card"><h2>Classes and thresholds</h2><p class="small muted">Edit <code>config/classes.yaml</code> (thresholds, model name mapping) and <code>config/severity_rules.yaml</code> (CAT rule), then restart the app.</p>
      <div class="tablewrap"><table class="list"><thead><tr><th>Code</th><th>Dashboard label</th><th>CAT</th><th>Threshold</th></tr></thead><tbody>${classes}</tbody></table></div></div>
  </div><div class="stack">
    <div class="card"><h2>Inspection and camera defaults</h2><div class="fields">
      ${f("inspection", "blade_length_m", "Blade length (m)", "number")}${f("inspection", "timezone", "Time zone", "text", "Used when photos carry no offset")}
      ${f("camera", "distance_to_blade_m", "Distance to blade (m)", "number", "When photos have no laser range")}
      ${f("camera", "focal_length_mm", "Focal length (mm)", "number", "Empty = from EXIF")}
      ${f("camera", "sensor_width_mm", "Sensor width (mm)", "number", "Long side, e.g. 17.3 for a 4/3-inch sensor")}
    </div></div>
    <div class="card"><h2>Photo folders</h2><div class="fields">
      ${sel("input", "order", "Map 20 photos to P01–P20 by", [["name", "File name"], ["capture_time", "Capture time"]])}
      ${sel("input", "direction", "Photos run", [["root_to_tip", "Root → tip"], ["tip_to_root", "Tip → root"]])}
      ${f("input", "nacelle_max_photos", "Max nacelle photos", "number")}${f("input", "tower_max_photos", "Max tower photos", "number")}
      ${f("components", "nacelle_model", "Nacelle model", "text", "same | none | path to .pt")}${f("components", "tower_model", "Tower model", "text", "same | none | path to .pt")}
    </div></div>
    <div class="card"><h2>CompliQ connection (Cloudflare)</h2>
      <p class="small muted">The keys stay on this laptop in <code>config/settings.local.yaml</code>. Anyone with them can change the CompliQ database, so keep this laptop's account private. Secret fields show empty once saved; leave them empty to keep the saved value.</p>
      <div class="fields">
        ${f("cloudflare", "account_id", "Account ID", "text", "Cloudflare dashboard, account sidebar")}
        ${f("cloudflare", "d1_database_id", "D1 database ID", "text", "database_id in wrangler.jsonc")}
        ${secret("api_token", "API token", "Account · D1 · Edit")}
        ${f("cloudflare", "r2_bucket", "R2 bucket", "text", "compliq-files")}
        ${f("cloudflare", "r2_access_key_id", "R2 access key ID", "text", "Object Read & Write on the bucket")}
        ${secret("r2_secret_access_key", "R2 secret access key", "")}
      </div>
      <details style="margin-top:10px"><summary>Advanced (testing only)</summary><div class="fields">
        ${f("cloudflare", "api_base", "API base", "text", "https://api.cloudflare.com/client/v4")}
        ${f("cloudflare", "r2_endpoint", "R2 endpoint", "text", "Empty = https://&lt;account&gt;.r2.cloudflarestorage.com")}
        ${f("upload", "parallel", "Images at once", "number")}
      </div></details>
      <div class="row" style="margin-top:12px"><button class="btn" id="cftest">Save and test connection</button><span id="cfres" class="small"></span></div>
    </div>
  </div></div>`;
  const save = async (quiet) => {
    const out = {};
    $$("[data-s]").forEach((el) => {
      const [sec, key] = el.dataset.s.split(".");
      let v = el.type === "checkbox" ? el.checked : el.value.trim();
      if (el.type === "number") v = v === "" ? null : Number(v);
      if ((el.type === "text" || el.type === "password") && v === "" && ["name", "version"].indexOf(key) < 0) v = null;
      if (key === "device" && v === "0") v = 0;
      (out[sec] = out[sec] || {})[key] = v === "" ? null : v;
    });
    try { await api.put("/api/settings", out); S.info = await api.get("/api/info"); if (!quiet) toast("Settings saved", "ok"); return true; }
    catch (e) { toast(e.message, "bad"); return false; }
  };
  $("#save").onclick = () => save(false);
  $("#cftest").onclick = async () => {
    const res = $("#cfres");
    if (!(await save(true))) return;
    res.innerHTML = '<span class="spin"></span> Testing…';
    try {
      const r = await api.post("/api/cloud/test");
      res.innerHTML = r.ok ? `<span class="badge ok">✓ Connected</span> ${r.organizations} organizations, bucket ${esc(r.bucket)}`
        : `<span class="badge warn">Connected, but</span> ${r.problems.map(esc).join(" ")}`;
      viewSettings();
    } catch (e) { res.innerHTML = `<span class="badge bad">Failed</span> ${esc(e.message)}`; }
  };
}

/* ---------------------------------------------------------------- job polling */
let pollTimer = null;
function pollSoon() { clearTimeout(pollTimer); pollTimer = setTimeout(pollJob, 250); }
async function pollJob() {
  let job = null;
  try { job = await api.get("/api/job"); } catch { /* server restarting */ }
  const prev = S.job;
  S.job = job;
  const chip = $("#jobchip");
  if (job && job.state === "running") {
    const p = job.progress || {};
    chip.hidden = false;
    chip.href = ["publish", "unpublish"].includes(job.kind) ? `#/upload/${encodeURIComponent(job.workspace)}` : "#/new";
    chip.innerHTML = `<span class="spin"></span>${esc(job.label)}${p.total ? ` · ${p.done}/${p.total}` : ""}`;
  } else chip.hidden = true;
  const view = location.hash;
  if (job && job.kind === "run" && view.startsWith("#/new") && !S.runDismissed) renderRun();
  if (job && ["publish", "unpublish"].includes(job.kind) && view.startsWith("#/upload/")) renderUploadStatus();
  const finished = prev && prev.state === "running" && job && job.id === prev.id && job.state !== "running";
  if (finished) {
    if (job.kind === "sample" && job.state === "done") {
      saveSetup({ input_dir: job.result.input_dir, model_path: "demo", turbine_code: "WTG-001", dt: "2026-11-04T10:30", blade_length_m: "48.5", overrides: {} });
      toast("Sample photos ready — scan and run them", "ok");
      S.runDismissed = true;
      if (view.startsWith("#/new")) viewNew(); else location.hash = "#/new";
    } else if (job.kind === "run") toast(job.state === "done" ? "Run finished" : `Run ${job.state}`, job.state === "done" ? "ok" : "bad");
    else if (job.kind === "publish" || job.kind === "unpublish") {
      const what = job.kind === "publish" ? "Published to CompliQ" : "Deleted from CompliQ";
      toast(job.state === "done" ? what : `${job.kind === "publish" ? "Publish" : "Delete"} ${job.state}: ${job.error || ""}`, job.state === "done" ? "ok" : "bad");
      if (view.startsWith("#/upload/")) setTimeout(() => viewUpload(job.workspace), job.state === "done" ? 1500 : 0);
    } else if (job.state !== "done") toast(job.error || "Job failed", "bad");
  }
  pollTimer = setTimeout(pollJob, job && job.state === "running" ? 700 : 2500);
}

/* ---------------------------------------------------------------- boot */
(async function boot() {
  try { S.info = await api.get("/api/info"); }
  catch (e) { main.innerHTML = `<div class="card"><h2>Cannot reach the app server</h2><p class="muted">${esc(e.message)}. Start it with start.bat (Windows) or start.sh.</p></div>`; return; }
  renderReviewer();
  await pollJob();
  route();
})();
