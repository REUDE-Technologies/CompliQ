/* ══════════════════════════════════════════════════════════════════
   CompliQ – automatic inspection report (PDF)

   Page 1  = the cover page of the master report, copied unchanged.
   Page 2+ = generated from what the user picked on the Report page:
             turbine, blade, sides, CAT categories and defect classes.

   Needs: jsPDF (already loaded by dashboard.html), pdf-lib (loaded on
   demand from a CDN), and the helpers defined in dashboard.js.
   ══════════════════════════════════════════════════════════════════ */

const RG = {
  MASTER_URL: 'reports/Gamesa_2MW_Wind_Turbine_Inspection_Report.pdf',
  LOGO_URL: 'images/report-logo.png',
  REPORT_NO: 'REU_WT_IR_002_2026',
  PDFLIB_URLS: [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
  ],
  PAGE_W: 595.28,
  PAGE_H: 841.89,
  LEFT: 56,
  RIGHT: 56,
  TOP: 104,
  BOTTOM: 790,
  NAVY: [31, 56, 100],
  RED: [192, 0, 0],
  GREY: [120, 120, 120],
  LINE: [150, 150, 150],
  TEAL: [15, 164, 175]
};
RG.W = RG.PAGE_W - RG.LEFT - RG.RIGHT;

const RG_SIDE_ORDER = ['PS', 'SS', 'LE', 'TE'];
const RG_CAT_NAMES = { 1: 'Cosmetic', 2: 'Minor', 3: 'Moderate', 4: 'Serious', 5: 'Critical' };

/* ── small helpers ─────────────────────────────────────────────── */

function rgText(value) {
  return String(value ?? '')
    .replace(/[→⟶➜]/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/[✓✔]/g, 'Yes')
    .replace(/[☷⚠]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–—‘’“”•…€]/g, '');
}

function rgHex(hex, fallback = [255, 255, 255]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgDate(d = new Date()) {
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()}-${mon}-${String(d.getFullYear()).slice(2)}`;
}

function rgLongDate(d = new Date()) {
  const mon = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];
  return `${String(d.getDate()).padStart(2, '0')}-${mon}-${d.getFullYear()}`;
}

function rgPoint(index) {
  return 'P' + String(index).padStart(2, '0');
}

function rgClassOf(row) {
  const type = row.finding || row.type || '';
  if (/corrosion/i.test(type)) return 'Corrosion';
  if (/erosion/i.test(type)) return 'Leading Edge Erosion';
  return matchDefectClass(type)?.name || 'Coating & Gelcoat Damage';
}

function rgTypeName(row) {
  return String(row.finding || row.type || 'Finding').replace(/^(C\d+|H\d+|D\d+)\s+/i, '');
}

function rgSession() {
  try { return JSON.parse(localStorage.getItem('compliq_session') || '{}') || {}; }
  catch (_) { return {}; }
}

function rgLoadScript(urls) {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  return urls.reduce((chain, url) => chain.catch(() => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => (window.PDFLib ? resolve(window.PDFLib) : reject(new Error('pdf-lib missing')));
    s.onerror = () => { s.remove(); reject(new Error('load failed: ' + url)); };
    document.head.appendChild(s);
  })), Promise.reject(new Error('start')));
}

async function rgFetchBitmap(url) {
  const res = await fetch(encodeURI(url));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return createImageBitmap(await res.blob());
}

async function rgLogo() {
  try {
    const bmp = await rgFetchBitmap(RG.LOGO_URL);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return { data: c.toDataURL('image/png'), ratio: bmp.width / bmp.height };
  } catch (_) {
    return null;
  }
}

/* ── what the user selected on the Report page ─────────────────── */

function rgSelection() {
  const turbine = STATE.db?.turbines?.find(t => t.id === reportTurbineId()) || selectedTurbine();
  const blade = document.getElementById('report-blade')?.value || STATE.selectedBlade || 'A';
  const sides = RG_SIDE_ORDER.filter(s => selectedReportSides().includes(s));
  const cats = [...document.querySelectorAll('#report-category-filters input:checked')].map(i => Number(i.value)).sort();
  const classes = [...document.querySelectorAll('#report-class-filters input:checked')].map(i => i.value);
  return { turbine, blade, sides: sides.length ? sides : ['PS'], cats, classes };
}

function rgFindings(sel) {
  if (isG97Turbine(sel.turbine)) {
    const rows = findingsForBlade(sel.blade).filter(r => sel.sides.includes(r.surface));
    return reportFilteredFindings(rows).map(r => ({ ...r, cls: rgClassOf(r) }));
  }
  /* Turbines without station photos: use the defect register. */
  return (STATE.db.defects || [])
    .filter(d => d.assetId === sel.turbine?.id && String(d.blade) === String(sel.blade))
    .filter(d => sel.cats.includes(Number(d.severity)) && sel.classes.includes(rgClassOf(d)))
    .map(d => ({
      id: d.id, blade: sel.blade, surface: sel.sides[0], index: 0, finding: d.type,
      cat: Number(d.severity), count: 1, verify: false, demo: true, dist: d.dist, cls: rgClassOf(d)
    }));
}

/* ── station photographs ───────────────────────────────────────── */

async function rgStationPhoto(blade, side, index) {
  for (const url of g97StationCandidates(blade, side, index)) {
    try {
      const bmp = await rgFetchBitmap(url);
      return { bmp, url, preAnnotated: /_annotated\./i.test(url) };
    } catch (_) { /* try the next file name */ }
  }
  return null;
}

function rgBoxRect(box, w, h) {
  const [x1, y1, x2, y2] = box.bbox_norm.map(Number);
  return { x: Math.min(x1, x2) * w, y: Math.min(y1, y2) * h, w: Math.abs(x2 - x1) * w, h: Math.abs(y2 - y1) * h };
}

function rgDrawBox(ctx, box, w, h, color, label, scale = 1) {
  const r = rgBoxRect(box, w, h);
  const lw = Math.max(2, Math.round(Math.max(w, h) * 0.004 * scale));
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  if (Array.isArray(box.poly) && box.poly.length >= 3) {
    ctx.beginPath();
    box.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  if (label) {
    const fs = Math.max(12, Math.round(Math.max(w, h) * 0.018));
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    const tw = ctx.measureText(label).width + fs * 0.6;
    const ty = r.y - fs * 1.3 < 0 ? r.y + r.h : r.y - fs * 1.3;
    ctx.fillStyle = color;
    ctx.fillRect(r.x, ty, tw, fs * 1.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, r.x + fs * 0.3, ty + fs * 1.0);
  }
}

/** Annotated view + one close-up per finding, as JPEG data URLs. */
function rgRenderStation(photo, boxes, findings, stationFindings) {
  const { bmp, preAnnotated } = photo;
  const maxW = 1100;
  const s = Math.min(1, maxW / bmp.width);
  const W = Math.round(bmp.width * s);
  const H = Math.round(bmp.height * s);
  const main = document.createElement('canvas');
  main.width = W;
  main.height = H;
  const ctx = main.getContext('2d');
  ctx.drawImage(bmp, 0, 0, W, H);

  /* Match against every finding on the station, then keep only the selected ones,
     so a box from a filtered-out finding is never relabelled as another finding. */
  const keep = new Set(findings.map(f => f.id));
  const matched = boxes
    .map(box => ({ box, finding: matchFindingForBox(stationFindings || findings, box) }))
    .filter(m => m.finding && keep.has(m.finding.id))
    .map(m => ({ box: m.box, finding: findings.find(f => f.id === m.finding.id) }));
  if (!preAnnotated) {
    matched.forEach(({ box, finding }) => {
      const col = finding?.color || FINDING_COLOR[finding?.cat] || '#0FA4AF';
      const code = findingCode(finding) || box.code || '';
      rgDrawBox(ctx, box, W, H, col, `${code} CAT ${finding?.cat ?? box.cat ?? ''}`.trim());
    });
  }

  /* Biggest box of each finding becomes its close-up (max 4). */
  const crops = [];
  findings.forEach(f => {
    const own = matched.filter(m => m.finding?.id === f.id);
    if (!own.length || crops.length >= 4) return;
    const box = own.map(m => m.box).sort((a, b) => {
      const ra = rgBoxRect(a, 1, 1), rb = rgBoxRect(b, 1, 1);
      return rb.w * rb.h - ra.w * ra.h;
    })[0];
    const r = rgBoxRect(box, bmp.width, bmp.height);
    const side = Math.min(
      Math.max(r.w, r.h) * 1.6,
      Math.min(bmp.width, bmp.height)
    );
    const minSide = Math.min(bmp.width, bmp.height) * 0.12;
    const S = Math.max(side, minSide);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const sx = Math.max(0, Math.min(bmp.width - S, cx - S / 2));
    const sy = Math.max(0, Math.min(bmp.height - S, cy - S / 2));
    const out = 360;
    const c = document.createElement('canvas');
    c.width = out;
    c.height = out;
    const cctx = c.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, out, out);
    cctx.drawImage(bmp, sx, sy, Math.min(S, bmp.width), Math.min(S, bmp.height), 0, 0, out, out);
    if (!preAnnotated) {
      const k = out / S;
      const local = {
        bbox_norm: [(r.x - sx) * k / out, (r.y - sy) * k / out, (r.x + r.w - sx) * k / out, (r.y + r.h - sy) * k / out]
      };
      rgDrawBox(cctx, local, out, out, f.color || '#0FA4AF', '', 0.8);
    }
    crops.push({ data: c.toDataURL('image/jpeg', 0.8), code: findingCode(f) || box.code || '', finding: f });
  });

  return { main: main.toDataURL('image/jpeg', 0.72), ratio: W / H, crops };
}

/* ── page layout ───────────────────────────────────────────────── */

function RGLayout(doc) {
  this.doc = doc;
  this.y = RG.TOP;
  this.toc = [];
}

RGLayout.prototype.page = function () {
  return this.doc.internal.getNumberOfPages();
};

RGLayout.prototype.newPage = function () {
  this.doc.addPage();
  this.y = RG.TOP;
};

RGLayout.prototype.ensure = function (h) {
  if (this.y + h > RG.BOTTOM) {
    this.newPage();
    return true;
  }
  return false;
};

RGLayout.prototype.heading = function (num, title, level = 1, opts = {}) {
  const doc = this.doc;
  const size = level === 1 ? 15 : (level === 2 ? 12.5 : 11);
  if (opts.newPage) this.newPage();
  else this.ensure(size * 3 + 40);
  if (level === 1 && this.y > RG.TOP) this.y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(0, 0, 0);
  const label = rgText(num ? `${num} ${title}` : title);
  doc.text(label, RG.LEFT, this.y + size);
  this.toc.push({ label, level, page: this.page() });
  this.y += size + (level === 1 ? 14 : 10);
};

RGLayout.prototype.paragraph = function (text, opts = {}) {
  const doc = this.doc;
  const size = opts.size || 10;
  const lh = size * 1.45;
  const indent = opts.indent || 0;
  doc.setFont('helvetica', opts.bold ? 'bold' : (opts.italic ? 'italic' : 'normal'));
  doc.setFontSize(size);
  doc.setTextColor(...(opts.color || [0, 0, 0]));
  const lines = doc.splitTextToSize(rgText(text), RG.W - indent);
  lines.forEach(line => {
    this.ensure(lh);
    doc.text(line, RG.LEFT + indent, this.y + size);
    this.y += lh;
  });
  this.y += opts.after ?? 6;
};

RGLayout.prototype.bullets = function (items, opts = {}) {
  const doc = this.doc;
  const size = opts.size || 10;
  const lh = size * 1.45;
  items.forEach(item => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(rgText(item), RG.W - 16);
    lines.forEach((line, i) => {
      this.ensure(lh);
      if (i === 0) doc.text(opts.numbered ? `${items.indexOf(item) + 1}.` : '•', RG.LEFT + 2, this.y + size);
      doc.text(line, RG.LEFT + 16, this.y + size);
      this.y += lh;
    });
    this.y += 2;
  });
  this.y += 4;
};

/**
 * cols: [{ key, label, w (fraction of width), align }]
 * rows: [{ key: value, ..., _fill: { key: [r,g,b] }, _bold: { key: true } }]
 */
RGLayout.prototype.table = function (cols, rows, opts = {}) {
  const doc = this.doc;
  const size = opts.size || 8.8;
  const lh = size * 1.32;
  const pad = 4;
  const widths = cols.map(c => c.w * RG.W);
  const xs = widths.reduce((acc, w, i) => { acc.push(i ? acc[i - 1] + widths[i - 1] : RG.LEFT); return acc; }, []);

  const drawHead = () => {
    if (opts.noHead) return;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    const heads = cols.map((c, i) => doc.splitTextToSize(rgText(c.label), widths[i] - pad * 2));
    const h = Math.max(...heads.map(l => l.length)) * lh + pad * 2;
    /* Keep the header together with at least ~3 lines of the first row. */
    this.ensure(h + lh * 4 + pad * 2);
    doc.setDrawColor(...RG.LINE);
    doc.setLineWidth(0.5);
    cols.forEach((c, i) => {
      /* Text colour and fill colour share one setting in jsPDF: set fill every time. */
      doc.setFillColor(...(opts.headFill || RG.NAVY));
      doc.rect(xs[i], this.y, widths[i], h, 'FD');
      doc.setTextColor(255, 255, 255);
      heads[i].forEach((line, j) => doc.text(line, xs[i] + pad, this.y + pad + size + j * lh));
    });
    this.y += h;
  };

  drawHead();
  rows.forEach(row => {
    const cells = cols.map((c, i) => {
      doc.setFont('helvetica', row._bold?.[c.key] || c.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      return doc.splitTextToSize(rgText(row[c.key] ?? ''), widths[i] - pad * 2);
    });
    const h = Math.max(...cells.map(l => l.length), 1) * lh + pad * 2;
    if (this.y + h > RG.BOTTOM) {
      this.newPage();
      drawHead();
    }
    cols.forEach((c, i) => {
      const fill = row._fill?.[c.key] || opts.fill?.[c.key];
      doc.setDrawColor(...RG.LINE);
      doc.setLineWidth(0.5);
      if (fill) {
        doc.setFillColor(...fill);
        doc.rect(xs[i], this.y, widths[i], h, 'FD');
      } else {
        doc.rect(xs[i], this.y, widths[i], h, 'S');
      }
      doc.setFont('helvetica', row._bold?.[c.key] || c.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.setTextColor(...(row._color?.[c.key] || [0, 0, 0]));
      cells[i].forEach((line, j) => {
        const ty = this.y + pad + size + j * lh;
        if (c.align === 'center') doc.text(line, xs[i] + widths[i] / 2, ty, { align: 'center' });
        else doc.text(line, xs[i] + pad, ty);
      });
    });
    this.y += h;
  });
  this.y += opts.after ?? 12;
};

/** Header / footer on every generated page, plus "Page X of N". */
function rgStampPages(doc, logo, totalPages) {
  const n = doc.internal.getNumberOfPages();
  const date = rgDate();
  for (let i = 1; i <= n; i += 1) {
    doc.setPage(i);
    if (logo) doc.addImage(logo.data, 'PNG', 30, 18, 92, 92 / logo.ratio);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...RG.RED);
    doc.text('Restricted', RG.PAGE_W / 2, 28, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(0, 0, 0);
    doc.text('INSPECTION REPORT', RG.PAGE_W / 2, 42, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(RG.REPORT_NO, RG.PAGE_W / 2, 55, { align: 'center' });
    const right = RG.PAGE_W - RG.RIGHT;
    const pageNo = i + 1;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const wTail = doc.getTextWidth(String(totalPages));
    doc.setFont('helvetica', 'normal');
    const wOf = doc.getTextWidth(' of ');
    doc.setFont('helvetica', 'bold');
    const wNum = doc.getTextWidth(String(pageNo));
    doc.setFont('helvetica', 'normal');
    const wPage = doc.getTextWidth('Page ');
    let x = right - (wPage + wNum + wOf + wTail);
    doc.text('Page ', x, 70); x += wPage;
    doc.setFont('helvetica', 'bold'); doc.text(String(pageNo), x, 70); x += wNum;
    doc.setFont('helvetica', 'normal'); doc.text(' of ', x, 70); x += wOf;
    doc.setFont('helvetica', 'bold'); doc.text(String(totalPages), x, 70);
    doc.text(date, right, 83, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...RG.RED);
    doc.text('Restricted', RG.PAGE_W / 2, RG.PAGE_H - 30, { align: 'center' });
  }
}

/* ── report sections ───────────────────────────────────────────── */

function rgSeverityFill(cat) {
  return rgHex(SEVERITY_UI[cat]?.bg, [240, 240, 240]);
}

function rgDistance(row, turbine) {
  if (row.demo) return { dist: row.dist != null ? `${row.dist} m` : '—', radial: '—', metres: Number(row.dist) || 0 };
  return findingRowDistance(row, turbine);
}

function rgSummaryText(sel, rows, stations) {
  const t = sel.turbine;
  const serial = bladeDisplayName(sel.blade, t);
  const sideNames = sel.sides.map(s => SIDE_NAME[s] || s).join(', ');
  const parts = [];
  parts.push(`Drone-based visual inspection of ${serial} on ${t?.model || 'the turbine'} (${t?.assetId || ''}) at ${t?.location || t?.site || 'site'}. This report was generated from the CompliQ Report page and covers the ${sideNames.toLowerCase()}, limited to ${sel.cats.length === 5 ? 'all severity categories' : 'severity categories ' + sel.cats.map(c => 'CAT ' + c).join(', ')} and ${sel.classes.length >= document.querySelectorAll('#report-class-filters input').length ? 'all defect classes' : 'the defect classes ' + sel.classes.join(', ')}.`);
  if (!rows.length) {
    parts.push('No findings matched the selected categories and defect classes on the selected sides.');
    return parts;
  }
  const byCat = [5, 4, 3, 2, 1].map(c => [c, rows.filter(r => r.cat === c).length]).filter(([, n]) => n);
  parts.push(`${rows.length} finding(s) at ${stations} station(s) match this selection: ${byCat.map(([c, n]) => `${n} x CAT ${c} (${RG_CAT_NAMES[c]})`).join(', ')}.`);
  const top = rows.slice().sort((a, b) => (b.cat - a.cat) || (a.index - b.index))[0];
  const d = rgDistance(top, t);
  parts.push(`The most significant finding is ${rgTypeName(top)} (CAT ${top.cat}) on the ${(SIDE_NAME[top.surface] || top.surface).toLowerCase()}${top.index ? ` at station ${rgPoint(top.index)}, ${d.dist} from the root` : ''}. Recommended action: ${SEVERITY_UI[top.cat]?.action || 'review'}.`);
  const verify = rows.filter(r => r.verify).length;
  if (verify) parts.push(`${verify} finding(s) are marked for verification and should be confirmed by close-up inspection before repair planning.`);
  return parts;
}

function rgDetailsPage(L, sel, rows, stations) {
  const doc = L.doc;
  const t = sel.turbine;
  const session = rgSession();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Inspection Report: ', RG.LEFT, L.y + 14);
  const w = doc.getTextWidth('Inspection Report: ');
  doc.setFont('helvetica', 'normal');
  doc.text(RG.REPORT_NO, RG.LEFT + w, L.y + 14);
  L.y += 30;
  const serials = ['A', 'B', 'C'].map(b => bladeSerial(b, t)).filter(Boolean).join(', ');
  L.table(
    [{ key: 'k', label: '', w: 0.3 }, { key: 'v', label: '', w: 0.7 }],
    [
      { k: 'Company/ Organization', v: session.org || 'xxxx' },
      { k: 'Location', v: t?.site ? `${t.site}, ${t.state || ''}`.replace(/,\s*$/, '') : (t?.location || '—') },
      { k: 'Wind turbine', v: `${t?.model || '—'}${t?.assetId ? ' (' + t.assetId + ')' : ''}` },
      { k: 'Blade-Serial #', v: serials || '—' },
      { k: 'Blade in this report', v: bladeDisplayName(sel.blade, t) },
      { k: 'Sides in this report', v: sel.sides.map(s => `${SIDE_NAME[s]} (${s})`).join(', ') },
      { k: 'Inspection date', v: t?.lastInspection || 'xxxx' },
      { k: 'Report generated', v: `${rgLongDate()}${session.firstName ? ' by ' + [session.firstName, session.lastName].filter(Boolean).join(' ') : ''}` }
    ],
    { noHead: true, size: 9.5 }
  );
  L.y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Summary', RG.LEFT, L.y + 12);
  L.y += 24;
  rgSummaryText(sel, rows, stations).forEach(p => L.paragraph(p, { size: 10, after: 8 }));
  L.paragraph('Notice: Due to camera angles, stand-off distance and lighting, certain regions (root/collar, hub interface, trailing-edge faces, crack-like indications) could not be fully resolved. Additional defects in these areas cannot be ruled out.', { size: 9.5 });

  /* Copyright box near the bottom of the page, as in the master report. */
  const boxH = 64;
  const by = Math.max(L.y + 10, RG.BOTTOM - boxH - 10);
  if (by + boxH <= RG.BOTTOM) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.7);
    doc.rect(RG.LEFT, by, RG.W, boxH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Copyright Notice', RG.LEFT + 6, by + 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const txt = doc.splitTextToSize('Any and all images, visualizations, charts, diagrams, data collection, data synchronization patterns, and other materials contained in or displayed in this inspection report are protected by copyright. All such copyrights are exclusively owned and controlled by REUDE Technologies Private Limited.', RG.W - 12);
    txt.forEach((line, i) => doc.text(line, RG.LEFT + 6, by + 30 + i * 10));
  }
}

function rgScopeAndClassification(L, sel, rows) {
  L.heading('1.', 'Report Scope and Selection', 1);
  L.paragraph('This part of the report is generated automatically from the selection made on the CompliQ Report page. Only the stations and findings that match the filters below are included.');
  const t = sel.turbine;
  L.table(
    [{ key: 'k', label: 'Filter', w: 0.3 }, { key: 'v', label: 'Selection', w: 0.7 }],
    [
      { k: 'Turbine', v: turbineLabel(t) },
      { k: 'Blade', v: bladeDisplayName(sel.blade, t) },
      { k: 'Sides', v: sel.sides.map(s => `${SIDE_NAME[s]} (${s})`).join(', ') },
      { k: 'Categories', v: sel.cats.length ? sel.cats.map(c => `CAT ${c} · ${RG_CAT_NAMES[c]}`).join(', ') : 'None selected' },
      { k: 'Defect classes', v: sel.classes.length ? sel.classes.join(', ') : 'None selected' },
      { k: 'Findings included', v: String(rows.length) }
    ],
    { size: 9.5 }
  );

  L.heading('2.', 'Defect Classification', 1);
  L.paragraph('Severity follows the DNV five-category scale used throughout CompliQ. Categories not selected in the report filters are marked as excluded.');
  L.table(
    [
      { key: 'cat', label: 'Severity Class', w: 0.17, bold: true },
      { key: 'cond', label: 'Description', w: 0.37 },
      { key: 'act', label: 'Recommended Action', w: 0.31 },
      { key: 'inc', label: 'In this report', w: 0.15, align: 'center' }
    ],
    [5, 4, 3, 2, 1].map(c => ({
      cat: `CAT ${c} · ${RG_CAT_NAMES[c]}`,
      cond: SEVERITY_UI[c].condition,
      act: SEVERITY_UI[c].action,
      inc: sel.cats.includes(c) ? `Included (${rows.filter(r => r.cat === c).length})` : 'Excluded',
      _fill: { cat: rgSeverityFill(c) }
    })),
    { size: 9 }
  );
}

function rgStationBlock(L, sel, side, index, findings, art) {
  const doc = L.doc;
  const t = sel.turbine;
  const span = bladeSpanM(t);
  const metres = pointMetres(index, span);
  const pct = Math.round((metres / span) * 100);
  const maxCat = Math.max(...findings.map(f => f.cat));
  const imgH = 140;

  /* Text under the photos, measured first so the block never splits awkwardly. */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const notes = findings.map(f => {
    const d = rgDistance(f, t);
    const code = findingCode(f);
    return `${code ? code + ' – ' : ''}${rgTypeName(f)} | CAT ${f.cat} (${RG_CAT_NAMES[f.cat]})${f.verify ? ', verification required' : ''} | ${d.dist} from root (${d.radial} span) | ${f.cls}${f.count > 1 ? ` | ${f.count} marks` : ''}. Recommended action: ${SEVERITY_UI[f.cat]?.action || 'review'}.`;
  });
  const noteLines = notes.reduce((n, s) => n + doc.splitTextToSize(rgText(s), RG.W - 16).length, 0);
  const blockH = 20 + 14 + imgH + 8 + noteLines * 13.8 + findings.length * 2 + 10;
  L.ensure(Math.min(blockH, RG.BOTTOM - RG.TOP));

  const x0 = RG.LEFT;
  /* Title bar */
  doc.setDrawColor(...RG.LINE);
  doc.setLineWidth(0.6);
  doc.rect(x0, L.y, RG.W, 20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(rgText(`${side} Station ${rgPoint(index)} — ${pct}% (${metres.toFixed(1)} m from root)`), x0 + 6, L.y + 13.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${findings.length} finding(s) | max severity: CAT ${maxCat} · ${RG_CAT_NAMES[maxCat]}`, x0 + RG.W - 6, L.y + 13.5, { align: 'right' });
  L.y += 20;

  /* Column labels + photos */
  const mainW = art ? Math.min(RG.W * 0.56, imgH * art.ratio) : RG.W;
  doc.rect(x0, L.y, RG.W, 14 + imgH + 6);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.text('Annotated View', x0 + mainW / 2, L.y + 10, { align: 'center' });
  if (art?.crops.length) doc.text('Defect Detail Evidence', x0 + mainW + (RG.W - mainW) / 2, L.y + 10, { align: 'center' });
  doc.line(x0, L.y + 14, x0 + RG.W, L.y + 14);
  const iy = L.y + 17;
  if (art) {
    let dw = mainW - 6;
    let dh = dw / art.ratio;
    if (dh > imgH) { dh = imgH; dw = dh * art.ratio; }
    doc.addImage(art.main, 'JPEG', x0 + 3 + (mainW - 6 - dw) / 2, iy + (imgH - dh) / 2, dw, dh, undefined, 'FAST');
    const n = art.crops.length;
    if (n) {
      const room = RG.W - mainW - 6;
      const cell = Math.min(imgH, (room - (n - 1) * 4) / n);
      let cx = x0 + mainW + 3 + (room - (cell * n + (n - 1) * 4)) / 2;
      art.crops.forEach(crop => {
        doc.addImage(crop.data, 'JPEG', cx, iy, cell, cell, undefined, 'FAST');
        if (crop.code) {
          doc.setFillColor(30, 30, 30);
          doc.rect(cx, iy, Math.max(16, doc.getTextWidth(crop.code) + 6), 11, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(crop.code, cx + 3, iy + 8);
          doc.setTextColor(0, 0, 0);
        }
        cx += cell + 4;
      });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...RG.GREY);
    doc.text('Station photo could not be loaded for this report.', x0 + RG.W / 2, iy + imgH / 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  }
  L.y += 14 + imgH + 6 + 6;

  L.bullets(notes, { size: 9.5 });
  L.y += 6;
}

function rgConsolidatedTable(L, sel, side, rows) {
  const t = sel.turbine;
  const sorted = rows.slice().sort((a, b) => (a.index - b.index) || (b.cat - a.cat));
  L.ensure(150);
  L.heading('', `Overall Findings – Consolidated ${SIDE_NAME[side] || side} Findings`, 3);
  L.table(
    [
      { key: 'st', label: 'Station', w: 0.09, align: 'center', bold: true },
      { key: 'id', label: 'ID', w: 0.06, align: 'center' },
      { key: 'cond', label: 'Observed Condition', w: 0.25 },
      { key: 'cls', label: 'Defect Class', w: 0.16 },
      { key: 'dist', label: 'Dist. from Root', w: 0.12, align: 'center' },
      { key: 'sev', label: 'Severity', w: 0.1, align: 'center', bold: true },
      { key: 'rec', label: 'Recommendation', w: 0.22 }
    ],
    sorted.map(r => {
      const d = rgDistance(r, t);
      return {
        st: r.index ? `${rgPoint(r.index)}\n${d.radial}` : '—',
        id: findingCode(r) || '—',
        cond: rgTypeName(r) + (r.verify ? ' (verify)' : ''),
        cls: r.cls,
        dist: d.dist,
        sev: `CAT ${r.cat}\n${RG_CAT_NAMES[r.cat]}`,
        rec: SEVERITY_UI[r.cat]?.action || '',
        _fill: { sev: rgSeverityFill(r.cat) }
      };
    }),
    { size: 8.6 }
  );
}

function rgOverall(L, sel, rows, sectionNo) {
  const t = sel.turbine;
  L.heading(`${sectionNo}.`, 'Overall Findings Summary and Recommendations', 1, { newPage: true });
  if (!rows.length) {
    L.paragraph('No findings matched the selected filters, so there are no actions to recommend for this selection. Widen the categories or defect classes on the Report page to include more findings.');
    return;
  }
  L.paragraph('Number of findings by side and severity category for this selection:');
  L.table(
    [{ key: 'side', label: 'Side', w: 0.28, bold: true },
      ...[5, 4, 3, 2, 1].map(c => ({ key: 'c' + c, label: `CAT ${c}`, w: 0.12, align: 'center' })),
      { key: 'tot', label: 'Total', w: 0.12, align: 'center', bold: true }],
    [...sel.sides.map(s => {
      const list = rows.filter(r => r.surface === s);
      const row = { side: `${SIDE_NAME[s]} (${s})`, tot: String(list.length) };
      [5, 4, 3, 2, 1].forEach(c => { row['c' + c] = String(list.filter(r => r.cat === c).length); });
      return row;
    }), (() => {
      const row = { side: 'All selected sides', tot: String(rows.length), _bold: {} };
      [5, 4, 3, 2, 1].forEach(c => { row['c' + c] = String(rows.filter(r => r.cat === c).length); row._bold['c' + c] = true; });
      row._bold.side = true;
      return row;
    })()],
    { size: 9.5, fill: Object.fromEntries([5, 4, 3, 2, 1].map(c => ['c' + c, rgSeverityFill(c)])) }
  );

  const byClass = {};
  rows.forEach(r => { byClass[r.cls] = (byClass[r.cls] || 0) + 1; });
  L.paragraph('Findings by defect class: ' + Object.entries(byClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(', ') + '.');

  L.heading('', 'Conclusion', 3);
  const max = Math.max(...rows.map(r => r.cat));
  const serious = rows.filter(r => r.cat >= 4).length;
  const moderate = rows.filter(r => r.cat === 3).length;
  const conclusion = [];
  if (max >= 5) conclusion.push(`${bladeDisplayName(sel.blade, t)} has at least one CAT 5 (Critical) finding in this selection. The turbine should be stopped and the finding confirmed by rope-access / NDT inspection before return to service.`);
  else if (max === 4) conclusion.push(`${bladeDisplayName(sel.blade, t)} has ${serious} CAT 4 (Serious) finding(s). Repair within 1–3 months with increased monitoring is recommended.`);
  else if (max === 3) conclusion.push(`${bladeDisplayName(sel.blade, t)} is serviceable. ${moderate} CAT 3 (Moderate) finding(s) should be repaired at the next scheduled maintenance.`);
  else conclusion.push(`${bladeDisplayName(sel.blade, t)} is serviceable with monitoring. All findings in this selection are CAT ${max} or lower.`);
  const verify = rows.filter(r => r.verify).length;
  if (verify) conclusion.push(`${verify} finding(s) are flagged for verification and need a close-up check to confirm their category.`);
  L.bullets(conclusion);

  L.heading('', 'Recommendations', 3);
  const priority = rows.slice().sort((a, b) => (b.cat - a.cat) || (a.index - b.index)).slice(0, 10);
  L.bullets(priority.map(r => {
    const d = rgDistance(r, t);
    return `${r.surface} ${r.index ? rgPoint(r.index) : ''} ${findingCode(r)} ${rgTypeName(r)} (CAT ${r.cat}, ${d.dist} from root): ${SEVERITY_UI[r.cat]?.action || 'review'}.`.replace(/\s+/g, ' ');
  }), { numbered: true });
  if (rows.length > priority.length) L.paragraph(`${rows.length - priority.length} further finding(s) are listed in the consolidated tables above.`, { italic: true, size: 9 });
  L.bullets([
    'Re-inspect the same stations in the next campaign so the progression of each finding can be compared.',
    'Observations are based on image analysis of UAV-captured imagery and are limited to visible surface features. They do not constitute certified defect classification or confirmation of structural damage.'
  ]);
}

function rgTocPage(doc, toc, tocPage) {
  doc.setPage(tocPage);
  let y = RG.TOP;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text('Table of Contents', RG.LEFT, y + 15);
  y += 34;
  toc.forEach(entry => {
    if (y > RG.BOTTOM - 14) return;
    const indent = (entry.level - 1) * 14;
    const size = entry.level === 1 ? 10.5 : 9.5;
    doc.setFont('helvetica', entry.level === 1 ? 'bold' : 'normal');
    doc.setFontSize(size);
    const label = entry.label;
    const pageNo = String(entry.page + 1);
    const right = RG.PAGE_W - RG.RIGHT;
    const labelW = doc.getTextWidth(label);
    const numW = doc.getTextWidth(pageNo);
    doc.text(label, RG.LEFT + indent, y);
    doc.text(pageNo, right, y, { align: 'right' });
    const dotW = doc.getTextWidth('.');
    const from = RG.LEFT + indent + labelW + 4;
    const to = right - numW - 4;
    if (to > from) doc.text('.'.repeat(Math.floor((to - from) / dotW)), from, y);
    y += entry.level === 1 ? 20 : 16;
  });
}

/* ── main entry point (Download report button) ─────────────────── */

let RG_BUSY = false;

async function generatePDFReport() {
  if (RG_BUSY) return;
  if (!window.jspdf?.jsPDF) {
    showToast('PDF library is still loading. Try again in a moment.', 'error');
    return;
  }
  RG_BUSY = true;
  const btn = document.querySelector('.report-download-btn');
  const btnText = btn?.textContent;
  const progress = msg => { if (btn) btn.textContent = msg; };
  if (btn) btn.disabled = true;

  try {
    progress('Collecting findings…');
    await Promise.all([loadBladeFindings(), loadStationBoxes()]);
    const sel = rgSelection();
    if (!sel.turbine) throw new Error('No turbine selected');
    const rows = rgFindings(sel);
    const g97 = isG97Turbine(sel.turbine);

    /* Group by side and station. */
    const bySide = {};
    sel.sides.forEach(s => { bySide[s] = new Map(); });
    rows.forEach(r => {
      const m = bySide[r.surface];
      if (!m) return;
      if (!m.has(r.index)) m.set(r.index, []);
      m.get(r.index).push(r);
    });
    const stationCount = Object.values(bySide).reduce((n, m) => n + m.size, 0);

    /* Load photos one station at a time. */
    const art = {};
    if (g97) {
      let done = 0;
      for (const side of sel.sides) {
        for (const [index, list] of [...bySide[side].entries()].sort((a, b) => a[0] - b[0])) {
          done += 1;
          progress(`Loading photos ${done}/${stationCount}…`);
          const photo = await rgStationPhoto(sel.blade, side, index);
          if (!photo) continue;
          STATION_ASPECT[`${sel.blade}-${side}-${index}`] = photo.bmp.width / photo.bmp.height;
          const boxes = (STATION_BOXES.byKey[`${sel.blade}-${side}-${index}`] || []).filter(b => Array.isArray(b.bbox_norm));
          art[`${side}-${index}`] = rgRenderStation(photo, boxes, list, findingsForStation(sel.blade, side, index));
          photo.bmp.close?.();
        }
      }
    }

    progress('Building PDF…');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const L = new RGLayout(doc);
    const logo = await rgLogo();

    /* Page 2: inspection details + summary */
    rgDetailsPage(L, sel, rows, stationCount);
    /* Page 3: table of contents (filled at the end) */
    L.newPage();
    const tocPage = L.page();
    /* Scope + classification */
    L.newPage();
    rgScopeAndClassification(L, sel, rows);

    /* Findings per side */
    L.heading('3.', `${bladeDisplayName(sel.blade, sel.turbine)} – Inspection Findings`, 1, { newPage: true });
    sel.sides.forEach((side, i) => {
      const sideRows = rows.filter(r => r.surface === side);
      L.heading(`3.${i + 1}`, `${SIDE_NAME[side] || side} – Station-by-Station Findings`, 2, { newPage: i > 0 });
      if (!sideRows.length) {
        L.paragraph(`No findings on the ${(SIDE_NAME[side] || side).toLowerCase()} match the selected categories and defect classes.`, { italic: true });
        return;
      }
      if (g97) {
        [...bySide[side].entries()].sort((a, b) => a[0] - b[0]).forEach(([index, list]) => {
          rgStationBlock(L, sel, side, index, list, art[`${side}-${index}`] || null);
        });
      }
      rgConsolidatedTable(L, sel, side, sideRows);
    });

    rgOverall(L, sel, rows, 4);
    rgTocPage(doc, L.toc, tocPage);

    const generatedPages = doc.internal.getNumberOfPages();
    rgStampPages(doc, logo, generatedPages + 1);

    progress('Adding cover page…');
    const generated = doc.output('arraybuffer');
    let bytes = generated;
    try {
      const { PDFDocument } = await rgLoadScript(RG.PDFLIB_URLS);
      const masterRes = await fetch(encodeURI(RG.MASTER_URL));
      if (!masterRes.ok) throw new Error('Master report HTTP ' + masterRes.status);
      const master = await PDFDocument.load(await masterRes.arrayBuffer());
      const gen = await PDFDocument.load(generated);
      const out = await PDFDocument.create();
      const [cover] = await out.copyPages(master, [0]);
      out.addPage(cover);
      (await out.copyPages(gen, gen.getPageIndices())).forEach(p => out.addPage(p));
      out.setTitle(`Inspection Report ${RG.REPORT_NO} – ${bladeDisplayName(sel.blade, sel.turbine)}`);
      out.setAuthor('REUDE Technologies – CompliQ');
      bytes = await out.save();
    } catch (err) {
      console.warn('Cover page could not be added:', err);
      showToast('Cover page could not be added; downloading the generated pages only.', 'error');
    }

    const serial = String(bladeSerial(sel.blade, sel.turbine) || sel.blade).replace(/[^\w-]+/g, '_');
    const filename = inspectionReportDownloadName().replace(/\.pdf$/i, `_Blade${serial}_${sel.sides.join('-')}.pdf`);
    const href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
    showToast(`Report generated: ${rows.length} finding(s), ${generatedPages + 1} pages`, 'success');
  } catch (err) {
    console.error(err);
    showToast('Could not generate the report: ' + (err?.message || err), 'error');
  } finally {
    RG_BUSY = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = btnText || 'Download report';
    }
  }
}
