# CompliQ — Wind Turbine Inspection Market Feature Gap Analysis

**Document type:** Competitive intelligence & product roadmap input  
**Date:** 16 October 2026  
**Scope:** Real-world blade / turbine inspection platforms vs CompliQ  
**Method:** Public product pages for market leaders, plus REA browser capture of key marketing sites; CompliQ assessed against the live dashboard in this project  

**Important:** Competitor capabilities below are **advertised** product features. They were not verified inside logged-in production apps. CompliQ scores reflect the current software as implemented in this codebase.

---

## 1. Executive summary

Market-leading wind inspection platforms do not sell “image folders.” They sell a closed operational loop:

**Inspect → AI / expert confirm → locate on the blade → prioritise → plan repair → prove closure → retain history across campaigns.**

CompliQ already has strong seeds for that loop:

- Serial-first blade identity (e.g. **Blade 5288**)
- Interactive **3D turbine overview**
- **DNV-style CAT 1–5** severity language
- Open **CV / manual ingest** (software-first, not drone-locked)
- Fleet overview, asset detail, findings, and report surfaces

The main gaps vs market standard are **lifecycle and evidence depth**: repair work-order closure, true campaign-to-campaign progression, millimetre measurement on imagery, LPS / internal evidence on the same blade record, coverage gates, and audit-ready PDF reports linked to source frames.

**Recommended strategy:** Do not try to own drones, crawlers, or LPS sensors in the near term. Beat hardware-heavy vendors as the **open system of record** — serial blade passport, CAT SOP spine, vendor-agnostic ingest, repair closure, and defendable reports.

---

## 2. Sources reviewed

| Vendor / product | What they sell (high level) | Primary public source |
|---|---|---|
| **SkySpecs Horizon** (+ Foresight / SkyCrawler) | Autonomous external inspection, internal crawler, blade management, repair planning, fleet analytics | skyspecs.com/inspections (REA capture also visited this origin) |
| **Clobotics IRIS** (+ IBIS / KIWI / Hummingbird) | Unified external + internal + LPS evidence, AI screen → expert review, persistent blade record | clobotics.com/industries/wind/iris-wind-intelligence |
| **TOPseven** (INSPECTOR / NAVIGATOR / CLOUDseven / BEAT) | Autonomous flight, AI severity, 3D twin, LPS analytics, fleet dashboard, audit PDF | topseven.com/software-wind-turbine-inspections |
| **SkyVisor Wind** | Autonomous DJI flights, AI defect detection, digital twin, FieldApp, tiered AI/expert plans | skyvisor.ai/en-us/blade |
| **Enervid** | Deep-zoom imagery, annotation, severity, repair assignment to closure, fleet map, PDF reports | enervid.com/wind |
| **Aerones Visual Inspection Studio** | Internal crawler video + drone imagery, side-by-side defect tracking, AI anomaly assist | aerones.com (Visual Inspection Studio launch) |
| **Perceptual Robotics (Dhalion)** | Autonomous capture, AI annotation, automated reporting, repair management, ISP portal | perceptual-robotics.com |

**REA evidence:** Browser scenario capture completed across TOPseven → Enervid → SkySpecs product pages (evidence id `ev_cae9d7aedfdfd993321dd5eaaeff4b9c02098fdfcc350d1ecb863e5dfcfbb253`). Capture confirms live public pages and DOM presence; it does not prove backend product behaviour.

---

## 3. Market standard: what “good” looks like

Across leaders, the following are treated as **table stakes** for a serious inspection platform:

1. **Asset-centric record** — findings live on the turbine/blade, not in disconnected folders.
2. **Severity with action language** — type + severity + recommended next step.
3. **Located damage** — blade, surface/side, radius or station, preferably measurable size.
4. **Human-in-the-loop review** — AI proposes; experts confirm.
5. **Comparable campaigns** — same blade can be compared over time (new / stable / progressing).
6. **Repair path** — assign, track, close with an audit trail.
7. **Fleet prioritisation** — what to fix first across sites.
8. **Defendable outputs** — reports linked to evidence, exportable, reviewable.
9. **Multi-evidence readiness** — external RGB as baseline; LPS / internal / thermal as valued add-ons.
10. **Access control** — owners, ISPs, and repair crews see appropriate slices.

Hardware autonomy (repeatable drone paths, crawlers, contactless LPS) is a strong differentiator for some vendors, but many of those capabilities can be **ingested** into a software platform without owning the robot.

---

## 4. Feature matrix: market vs CompliQ

| Feature | Market standard | Leaders highlighting it | CompliQ today | Gap |
|---|---|---|---|---|
| Finding → repair → close loop | Assign defects to crews, track to closure, audit trail | Enervid, SkySpecs Horizon, Clobotics IRIS | Status / action fields exist; no full work-order board | **Partial** |
| Campaign-to-campaign progression | Overlay inspections; new / stable / progressing | TOPseven, Enervid, Clobotics, SkyVisor, Aerones | Compare UI seeds; not full progression engine | **Partial** |
| Persistent blade lifecycle record | One blade identity across campaigns & vendors | Clobotics IRIS, SkySpecs Horizon | Serial blade naming + findings; timeline incomplete | **Partial** |
| Measurable imagery (mm tools) | Deep zoom + measured callouts | Enervid, TOPseven | Station photos / POC; limited calibrated measure | **Partial** |
| Photogrammetry / scan twin | Turbine rebuilt from scan, year-over-year comparable | TOPseven NAVIGATOR, SkyVisor, SkySpecs LiDAR | Interactive generic 3D model; not scan-derived | **Partial** |
| AI screen → expert confirm | AI filters frames; expert confirms type/size/severity/location | Clobotics IRIS, TOPseven, SkyVisor Pro, Perceptual Robotics | CV ingest exists; review queue UX incomplete | **Partial** |
| LPS / lightning-protection evidence | Pass/fail or located conductor fault on blade record | TOPseven BEAT, Clobotics Hummingbird, SkyVisor Pro | Not modelled as evidence type | **Missing** |
| Internal + external evidence | Crawler / internal findings with external imagery | SkySpecs SkyCrawler, Aerones, Clobotics KIWI | External-oriented; no internal stream | **Missing** |
| Mission coverage verification | Confirm all blade sides/stations before campaign complete | TOPseven, SkyVisor DroneApp | Ingest without coverage gate | **Missing** |
| Audit-ready evidence-linked reports | PDF tied to frames, severity charts, decisions | TOPseven, Enervid, Perceptual Robotics | Report download exists; not fully generated from live evidence | **Partial** |
| Fleet prioritisation analytics | Damage frequency, severity, radius, urgency | TOPseven CLOUDseven, Clobotics, SkySpecs | Fleet metrics / charts; weak repair-risk ranking | **Partial** |
| Role-based owner / ISP / repair access | Scoped access by party | Enervid, SkyVisor, Perceptual Robotics | Account roles seeded; repair-vendor scope weak | **Partial** |
| SSO + open API / vendor-agnostic ingest | Enterprise auth + import from any drone/CV pipeline | SkyVisor Pro, Perceptual Robotics | Open ingest is a CompliQ strength; SSO/API incomplete | **Partial** |

---

## 5. What CompliQ already does well

These are **advantages to protect and amplify**, not recreate:

1. **Serial blade identity** — “Blade 5288” style naming is clearer for operators than letter-only A/B/C in many competitor demos.
2. **Interactive 3D overview** — tangible asset context for non-specialists; competitors often emphasise twins but lock them to their capture stack.
3. **CAT 1–5 SOP language** — aligns with how serious O&M and engineering teams talk about severity and action.
4. **Software-first / open ingest** — CV payload + manual entry means CompliQ can sit above any drone vendor, ISP, or edge AI.
5. **Inspection-flavoured product surface** — fleet, asset, findings, report, ingest, analytics already map to the market workflow vocabulary.

---

## 6. Priority gaps (build order)

### Priority 1 — Defect lifecycle (finding → work order → verify → close)

**Why it matters:** Every serious platform sells maintenance outcomes. Image review alone is not enough to win operator budgets.

**CompliQ play:**
- Repair Board: assignee, due date, cost estimate, access window
- Closure requires a verified re-inspection photo / note
- Auto reopen or escalate if follow-up CAT is worse
- Link everything to defect ID + blade serial + campaign

**Beat them by:** Making ROI visible (cost avoided, days to close, CAT cleared) instead of only detection accuracy claims.

---

### Priority 2 — True campaign compare and progression

**Why it matters:** The market question is “is this worse than last year?”

**CompliQ play:**
- Fingerprint defects by blade serial + surface + radius band
- Status: **New / Stable / Progressing / Resolved**
- Side-by-side station compare with delta severity and growth

**Beat them by:** Stable station IDs and naming even when the drone vendor changes.

---

### Priority 3 — Blade passport on the 3D model

**Why it matters:** Hardware vendors own capture; CompliQ can own the **identity layer**.

**CompliQ play:**
- Click **Blade 5288** → passport: findings, repairs, LPS/internal/thermal tabs, station photos
- Pin defects at radius / surface on the existing 3D overview
- Optional later: replace generic mesh with photogrammetry when available

**Beat them by:** Serial + CAT + multi-vendor evidence in one passport.

---

### Priority 4 — Evidence-linked audit reports

**Why it matters:** Owners and ISPs need defendable PDFs, not static templates.

**CompliQ play:**
- Generate from live findings: CAT mix, annotated frames, action register, sign-off fields
- Keep deep links from report rows back into the asset UI

**Beat them by:** Reports that speak DNV CAT / SOP language natively.

---

### Priority 5 — Multi-evidence types without owning robots

**Why it matters:** SkySpecs / Aerones / Clobotics win on hardware; CompliQ can win as the shared record.

**CompliQ play:**
- Evidence modules on the blade: External, Internal, Thermal, LPS, Rope-access
- Partner ingest APIs; CompliQ owns decision + history

**Beat them by:** Being the system that survives provider and ownership changes (IRIS’s strongest narrative).

---

## 7. Standards bar CompliQ should commit to

### 7.1 Condition & severity
- Keep **CAT 1–5** as the single severity spine across fleet, asset, report, and repair boards.
- Map every AI / CV label into the same CAT + recommended action.

### 7.2 Evidence integrity
- Every finding must remain linked to: source frame(s), blade serial, surface, radius/station, campaign, reviewer, and final action.
- Reports must open those links, not hide them.

### 7.3 Comparable inspections
- Same stations, same naming, coverage checklist per campaign.
- Progression only works when geometry and station IDs stay stable.

### 7.4 From insight to uptime
- Prioritise by lost-production risk and access window, not defect count alone.
- Clear CAT 4/5 only after verified repair evidence.

---

## 8. What not to chase first

| Tempting competitor feature | Why delay |
|---|---|
| Building an autonomous drone stack | Capital-heavy; SkySpecs / SkyVisor / TOPseven already compete here |
| Owning crawler / LPS hardware | Partner or ingest instead; own the blade record |
| Perfect photogrammetry twin day one | Pin findings on current 3D + station photos first; add scan mesh later |
| Broad solar / multi-vertical expansion | Finish wind blade lifecycle depth before spreading thin |

---

## 9. Suggested 90-day product outcomes

If CompliQ ships only three outcomes in the next quarter, ship these:

1. **Repair Board** with assign / due / close / verify on existing defects  
2. **Campaign progression** (New / Stable / Progressing) with side-by-side compare  
3. **Generated audit PDF** from live findings + annotated evidence  

Supporting foundations in the same window:

- Coverage checklist on ingest  
- Blade passport panel from the 3D / component selector  
- Explicit evidence-type field (external / thermal / internal / LPS)

---

## 10. Conclusion

The market standard for wind inspection software is clear: **a persistent, severity-ranked, evidence-linked blade record that drives repair and proves closure.**

CompliQ is not starting from zero. Serial blade identity, CAT severity, 3D overview, and open ingest are real differentiators. Closing the gap means completing the operational loop around those strengths — especially **repair lifecycle, progression, audit reports, and multi-evidence readiness** — while staying vendor-agnostic on capture hardware.

That path positions CompliQ as the decision and compliance layer for onshore (and later offshore) operators who need standards-aligned inspection software without locking into a single robot vendor.

---

## Appendix A — Observation vs inference

| Statement class | Examples in this document |
|---|---|
| **Observation** | Public pages advertise AI screening, repair workflows, digital twins, LPS modules, internal crawlers, fleet dashboards, PDF reporting. REA captured live SkySpecs / Enervid / TOPseven page loads. CompliQ codebase contains CAT severity, serial blade labels, 3D overview, ingest, findings, and report surfaces. |
| **Inference** | Gap scores (Missing / Partial), recommended build order, and “how to beat them” plays. |
| **Unknown / not verified** | Actual accuracy of competitor AI, real customer-only UI depth, pricing, offshore SLA performance, and unpublished roadmap items. |

## Appendix B — Related artifact

An interactive summary of this analysis also exists as a Cursor canvas:

`C:\Users\v.kandan\.cursor\projects\c-Users-v-kandan-Downloads-Read-this-Rotrix-arduino\canvases\wind-inspection-market-gaps.canvas.tsx`

---

*Prepared for REUDE / CompliQ product planning. Not for external publication without review.*
