# Nearthlab Enterprise Site & Video Report  
## Focus: NearthWIND Pro (`#nearthwind-pro`)

**Document type:** REA-assisted competitive / product intelligence  
**Primary URL:** https://www.nearthlab.com/en/enterprise#nearthwind-pro  
**Date of capture:** 16 October 2026  
**Prepared for:** CompliQ / REUDE product planning  

---

## 1. Method and evidence

### 1.1 What was inspected

| Target | Method | Result |
|---|---|---|
| Enterprise page (Pro anchor) | REA `capture_browser_scenario` (Chromium headless) | Complete DOM, accessibility tree, screenshots |
| Product section videos (on-page embeds) | REA wait + timed playback on Nearthlab origin | Three YouTube iframes discovered and exercised with page referrer |
| YouTube watch pages for each video ID | REA navigate + accessibility | Titles, durations, channel, play state observed |
| Direct `/embed/` URLs without Nearthlab referrer | REA | **Failed** with YouTube Error 153 (HTTP referer required) |
| Supporting product pages | Web fetch | Homepage, Zoomable AI demo site, Pro2 solution page, industry interview |

### 1.2 Primary REA evidence IDs

| Capture | Evidence ID | Notes |
|---|---|---|
| Enterprise Pro page (DOM + a11y + screenshot) | `ev_78705be2e09535a691c9ef7a7f1c4810ab837e6e7ff5dfd247e59f09a847f3ba` | Final URL confirmed with `#nearthwind-pro` |
| First multi-video locator probe | `ev_d253e0421d58a6951f5d638943401fe7c3aa40aaaff94dcc88e13a932f56ee5a` | Incomplete (strict-mode multi-match), but revealed all three video titles/IDs |
| Section walk Pro → Mobile → Zoomable | `ev_c3ca9c3e6254b7509a0156a48f631b5e749a2d3123eeb30ec82bae7123997a36` | Screenshots per section |
| YouTube watch pages (Pro / Mobile / Zoomable) | `ev_b631287cf2ef1bc3de0d543806cad81ee9af841033f30ac7883a36eb7e9b6895` | Metadata + playback controls |
| Oversized follow-up YT capture (retained) | `ev_f9bcb990c5bbb137aa57365d67ffb335baba5991e5b637e0859362427b975e9f` | Session export includes this record |
| Session export | `D:\temp\compliq-main\docs\nearthlab_rea_evidence_bundle.json` (~13.7 MB, 7 records) |

### 1.3 Local screenshot artifacts

Saved under `D:\temp\compliq-main\docs\`:

- `nearthlab-enterprise-pro.png`
- `nearth-section-play_pro.png`
- `nearth-section-wait_mobile.png` / `nearth-section-play_mobile.png`
- `nearth-section-play_zoom.png`
- `nearth-yt-wait_zoom.png`

### 1.4 Confidence boundary

- **Observed:** Page structure, copy, specs, iframe URLs, embed behaviour, YouTube metadata, UI screenshots from the public site and public/unlisted YouTube pages.
- **Inferred:** How the live Zoomable product works beyond marketing UI; absolute accuracy of advertised mm / minute claims.
- **Not verified:** Logged-in Zoomable app behaviour, real customer datasets, pricing, or in-field flight performance.

---

## 2. Page architecture (what REA saw)

The Enterprise page is a three-product stack for industrial inspection:

1. **NearthWIND Pro** — purpose-built autonomous inspection drone hardware  
2. **NearthWIND Mobile** — app that automates small commercial drones  
3. **Zoomable** — cloud digital-twin / analytics SaaS  

Accessibility tree confirms:

- Language switch EN / KR  
- Left complementary nav with hash links: `#nearthwind-pro`, `#nearthwind-mobile`, `#zoomable`  
- Each product block has: heading, tagline, description, still image, **autoplaying muted looping YouTube iframe**, then numbered feature sections  
- Footer: Seoul HQ, business / IR emails, LinkedIn, YouTube channel, Privacy Policy  
- External CTA for Zoomable: https://ai.zoomable.io  

DOM section IDs observed: `nearthwind-pro`, `nearthwind-mobile`, `zoomable`.

---

## 3. NearthWIND Pro — detailed findings

### 3.1 Positioning

From the live page (accessibility + DOM):

- **Eyebrow:** Enterprise · Wind Turbine O&M  
- **Name:** NearthWIND Pro  
- **Subtitle:** Automated Wind Turbine Inspection Solution  
- **One-liner:** Purpose-built autonomous drone hardware that automates wind turbine safety inspection  

Screenshot of the Pro hero shows:

- Studio product shot of a rugged black quadcopter with Nearthlab branding  
- Field visual of turbines on a coastal / green landscape with a drone in inspection context  
- Dark UI, yellow accent on active nav item  

### 3.2 Claimed capability pillars (on-page)

#### 01 — Autonomous Flight at Your Fingertips
- Target recognition  
- Autonomous flight-path planning  
- Collision-avoidance safety  
- Proximity flight that holds a set standoff from the structure  
- AI-driven capture intended to cover every surface without gaps  

#### 02 — Precision and Efficiency Redefined
- **45MP · 35mm full-frame** camera for sharp, blur-free imagery  

#### 03 — Tailored for Wind Turbine Excellence
- Onshore and offshore  
- Stable flight in high wind (**gusts up to 17 m/s** on this page)  
- Operable by unskilled personnel after brief training  

### 3.3 Key specifications (on-page definition list)

| Spec | Advertised value |
|---|---|
| Camera | 45MP · 35mm full-frame |
| Wind resistance | Gusts up to 17 m/s |
| Operation | Operable by unskilled personnel |

### 3.4 “Reliability Proven” claims (on-page)

These are marketing performance claims presented as achieved results:

1. Beat a stated requirement baseline of **1 mm image quality** and **25-minute** inspection time — claimed achievement: **0.3 mm-class** defect detection, **15-minute** inspection, **re-shoot rate under 1%**  
2. **600+ images per turbine** at 45MP  
3. Customers include all three top OEMs named as **Siemens Energy, Vestas, GE**; **40+ countries**; **7 years** deployment  

Homepage-adjacent claims (same company narrative, not only the Pro section):

- **100,000+ blades inspected**  
- **99.9%+ mission success**  
- Compresses ~**6 hours** rope access into **15-minute** single-button flight  
- “Zero crashes” / battle-tested autonomous core messaging  

### 3.5 Related product lineage note

Older solution pages still describe **Pro2** with nearly identical pillars (autonomous CV flight, 45MP full-frame, onshore/offshore, short training). NearthWIND Pro on the Enterprise page is the current branded packaging of that purpose-built hardware line.

---

## 4. Videos on the page — REA inventory

REA discovered **three** autoplay detail videos, one per product:

| Product | iframe `title` | YouTube ID | Embed behaviour |
|---|---|---|---|
| NearthWIND Pro | NearthWIND Pro detail video | `DTCZW75EVRw` | `autoplay=1`, `mute=1`, `loop=1`, `controls=0`, `modestbranding=1`, `rel=0`, `playsinline=1`, playlist self-loop |
| NearthWIND Mobile | NearthWIND Mobile detail video | `poN_UFjCXXw` | Same embed flags |
| Zoomable | Zoomable detail video | `GhAXEZsRqkQ` | Same embed flags |

### 4.1 Embed technical behaviour

- Videos are **lazy-loaded** iframes in `.cat-video-band` containers.  
- Embeds are designed as **silent looping product loops** (no controls, muted, loop via playlist=self).  
- Opening the same `/embed/` URL **without** the Nearthlab referrer returns **YouTube Error 153** (“provide an HTTP Referer header”).  
- Implication: the videos are intentionally locked to play **on Nearthlab’s site**; standalone embed hotlinking is blocked.

### 4.2 YouTube metadata (watch pages + oEmbed)

| ID | oEmbed / watch title | Channel | Approx. length (from a11y player) | Visibility |
|---|---|---|---|---|
| `DTCZW75EVRw` | **드론뷰** (Korean: “drone view”) | 거인소프트 (Giant Soft) — not the public Nearthlab channel | **~1:00** | **Unlisted** |
| `poN_UFjCXXw` | **001 1** | Kanghyeon Yu / 유강현 | **~0:45** | **Unlisted** |
| `GhAXEZsRqkQ` | **Zoomable, Cloud analytics platform for inspection data processing & management** | **Nearthlab** (`@nearthlab_official`, ~13.1K subscribers) | **~1:25** | Public (577 views at capture time) |

**Observation:** Pro and Mobile detail loops are unlisted assets hosted under non-public Nearthlab channel names (likely production / agency uploads), while Zoomable uses the official Nearthlab channel with a written description.

### 4.3 What the videos appear to show

#### NearthWIND Pro detail video (`DTCZW75EVRw`)
- On-page companion still: hardware product shot + coastal turbine field context.  
- Watch-page metadata: unlisted, ~60s, Korean title “드론뷰”, no description.  
- From product-page media pairing and company messaging, this loop is used as a **hardware / field-inspection atmosphere clip** (drone + turbines), not a narrated feature walkthrough.  
- **Limitation:** Because the clip is unlisted, muted, control-less, and short, REA could not recover a spoken script or chapter list. Frame-level product UI overlays were not exposed in accessibility text.

#### NearthWIND Mobile detail video (`poN_UFjCXXw`)
- On-page stills (REA screenshots) show:
  - Tablet + phone on a commercial controller, live turbine UI, **CES Innovation Awards 2022** badge  
  - Close-range blade / coastal turbine field still  
- Watch-page metadata: unlisted, ~45s, title “001 1”, no description.  
- Functionally presented as a **Mobile product loop** (controller + app + field capture), again without narrated captions in the accessibility tree.

#### Zoomable detail video (`GhAXEZsRqkQ`)
- Official Nearthlab upload.  
- Description (truncated in a11y): drone data analytics platform for processing, managing, and analyzing large-scale inspection data.  
- On-page Zoomable media (REA screenshot) is especially informative even beyond the video frame:
  - **Left:** 3D turbine twin with yellow magnifier callout into high-res blade imagery  
  - **Right:** dashboard titled **“PRECISION DEFECT ANALYSIS & TRACKING”** with:
    - Turbine filter (**T01**)  
    - Blade filters (1/2/3)  
    - Blade-side filters (**LE, TE, …**)  
    - Turbine parts filter  
    - **Severity 1–5** colour chips  
    - Thumbnail gallery of blade/nacelle frames with severity markers  
    - Donut + severity counts (example visible in UI mock: Sev2 25 / 30.1%, Sev3 32 / 38.6%)  
- Related official sidebar content observed on YouTube includes **“AI-Driven Wind Turbine Inspection”** (≈2:21) with 0.3 mm / autonomous-flight messaging.

---

## 5. The rest of the Enterprise page (needed to understand Pro)

NearthWIND Pro is sold as **one third of a stack**. The page’s other two products complete the workflow Pro starts.

### 5.1 NearthWIND Mobile

- Plug-and-play app: turns **any small commercial drone** into an automated inspection tool  
- Emphasises cost / logistics reduction vs dedicated hardware  
- CES Innovation Award 2022 badge on the page visual  
- Positioned for regions / use cases where dedicated industrial drones are hard to field, including expansion toward offshore  

**Strategic reading:** Pro = dedicated high-end hardware; Mobile = software autonomy for commodity drones. Same company thesis: autonomy in the app/flight stack, not only in a single airframe.

### 5.2 Zoomable (software twin of the capture stack)

On-page Zoomable claims:

1. **Seamless data processing** — hundreds of photos; wind / buildings / bridges / dams; report that once took **>1 month** now **within a day**  
2. **Advanced analytics** — auto location + size of defects; **millimetre zoom**; year-over-year change tracking  
3. **Automated reporting** — end-to-end SaaS: scheduling, analysis, time-series comparison, **task assignment**, automated reporting, **3D viewer**, **repair history**  

Reliability claims:

- Raw datasets → audited technical reports within **10 days**  
- Data-asset backbone for Nearthlab wind + counter-drone learning systems  
- Cited as driving **89.8% revenue CAGR (2022–2025)** across Siemens and subsequent customers  

Demo CTA: https://ai.zoomable.io  

### 5.3 Zoomable Enterprise marketing site (`ai.zoomable.io`) — fetched content

Adds software-feature vocabulary relevant to CompliQ comparison:

- Multi-source ingest (fixed cameras, CCTV, UAV, satellite, aerial)  
- AI defect detection + risk classification  
- Modular SaaS / custom API  
- Claim: complete analysis of vast data in **~1 hour**; **>90%** defects without manual intervention (marketing claim)  
- **Image stitching** with gap detection and re-shoot guidance  
- **Damage tracking** vs historical records; priority filtering for maintenance  

---

## 6. Deeper product picture from Nearthlab’s own technical interview

An April 2025 *Inside Unmanned Systems* interview with Hajun Kwon (Head of Wind Business) aligns with and expands the Enterprise page. Treat as **company-stated**, not independently measured.

Key points relevant to Pro + Zoomable:

| Topic | Company statement |
|---|---|
| Onboard vs cloud AI | Onboard compute is for **autonomous flight**; **defect detection is post-flight in Zoomable** |
| Navigation | Vision-based GNC; **does not rely on GPS waypoints**; backup LiDAR parallel path; useful offshore / GPS-denied |
| Sensors in flight | GPS + LiDAR + IMU for relative pose / defect localisation (interview); page emphasises 45MP RGB |
| Severity model | Proprietary taxonomy in Zoomable: **Severity 1 (minor) → 5 (immediate shutdown)**, colour-coded |
| Defect types | Cracks, erosion, delamination (+ anomaly detection) |
| QA before AI defecting | Blur/focus, lighting, coverage, metadata checks; drop redundant frames |
| Customisation | Annotation rules adjustable to **customer standards** |
| Predictive angle | Damage progression tracking; empirical estimate of when damage advances a severity level; energy-loss estimate from external damage |
| Evidence breadth | External + **LPS** + **internal** inspections packaged together |
| Mobile rationale | Enable cheap frequent / spot inspections so severe damage can be monitored without full dedicated-drone crews |
| Offshore data logistics | Images on **SSD**, uploaded from site office / logistics hub (not live wireless from turbine) |
| SCADA | Zoomable can be integrated as a module with customer SCADA |
| Wind limits (interview) | Sustained ~12 m/s, gusts ~14 m/s (note: Enterprise page advertises gusts **17 m/s** — numbers differ by source) |
| BVLOS | Not currently used for wind; pilot maintains VLOS; BVLOS under review |

**Important inconsistency to flag:** camera resolution is **45MP** on the Enterprise Pro page, while the interview mentions **64MP** in one answer. Treat page specs as the public product card; interview numbers may refer to a different configuration or an older/newer variant.

---

## 7. Feature map: what Nearthlab is selling as a system

```text
NearthWIND Pro (dedicated airframe)
        +
NearthWIND Mobile (autonomy app on commercial drones)
        |
        v
   Capture: 600+ RGB frames / turbine, coverage-first
        |
        v
Zoomable (SaaS digital twin)
  - ingest / QA / stitch
  - AI annotate + Severity 1–5
  - locate + measure on blade
  - 3D viewer
  - time-series progression
  - task assignment + repair history
  - automated / audited reports
```

This is a **capture + twin + maintenance decision** stack, not only a drone brochure.

---

## 8. Implications for CompliQ

### 8.1 Where Nearthlab is ahead (relative to CompliQ’s current shape)

1. **Closed capture→report loop** with dedicated QA before defecting  
2. **True digital twin UX** tying 3D turbine to millimetre imagery and severity gallery  
3. **Severity 1–5 colour system** embedded in the review UI (conceptually close to CompliQ CAT, but productised end-to-end)  
4. **Progression / energy-loss / repair timing** analytics claimed in interview  
5. **Multi-evidence** (external + LPS + internal) as one package  
6. **Coverage / re-shoot** discipline (stitching + <1% re-shoot marketing claim)  
7. **Task assignment + repair history** inside Zoomable  

### 8.2 Where CompliQ can still differentiate

1. **Vendor-agnostic system of record** — Nearthlab wants you in their capture + Zoomable orbit; CompliQ can stay open to any drone / CV pipeline  
2. **Serial blade passport** (Blade 5288 style) as the primary operator identity layer  
3. **DNV/SOP CAT language** as compliance spine vs a proprietary severity taxonomy  
4. **Software-first India / multi-ISP deployment** without requiring Nearthlab airframes  
5. Faster path to **repair work-order closure** and owner/ISP role separation if executed well  

### 8.3 Concrete product lessons from this page/videos

| Nearthlab pattern seen | CompliQ opportunity |
|---|---|
| Severity chips 1–5 on gallery | Keep CAT chips on findings gallery; make them filterable like Zoomable |
| Blade + side (LE/TE) filters | Strengthen side/surface filters in asset review |
| 3D twin with magnifier into photo | Pin findings on CompliQ 3D overview → open station photo |
| Auto report + repair history | Replace static PDF with evidence-linked report + repair board |
| Coverage QA before AI | Add campaign coverage checklist in Ingest |
| Mobile for frequent spot checks | Support “spot campaign” ingest path for low-cost revisit imagery |

---

## 9. Risks / unknowns

1. **Video content depth is limited.** Pro/Mobile loops are unlisted, muted, ~45–60s, with no description or captions in accessibility. They function as visual proof, not documentation.  
2. **Spec drift across sources** (45MP vs 64MP; 17 m/s page gusts vs ~14 m/s interview gusts).  
3. **Performance numbers are marketing claims** (0.3 mm, 15 min, <1% re-shoot, 90% AI detection on Zoomable site). Not independently validated here.  
4. **REA cannot authenticate into Zoomable**, so dashboard screenshots on the marketing page may be stylised UI, not a live tenant.  
5. Direct embed playback outside Nearthlab origin is intentionally blocked (Error 153).

---

## 10. Bottom line

The Nearthlab Enterprise page presents **NearthWIND Pro** as a purpose-built, high-wind autonomous inspection drone (45MP full-frame, ~15 min/turbine, 0.3 mm-class detection messaging) whose real product system is incomplete without **NearthWIND Mobile** (commodity-drone autonomy) and especially **Zoomable** (digital twin, Severity 1–5 review, measurement, progression, tasks, reports).

REA confirms the page structure, the three looping detail videos (Pro/Mobile unlisted; Zoomable official), and a Zoomable UI that visually matches the “precision defect analysis & tracking” story: turbine/blade/side filters, severity chips, gallery, and analytics.

For CompliQ, the actionable takeaway is not “build a drone,” but **match Zoomable’s decision-layer density** while staying open on capture: coverage QA, severity-filtered gallery, 3D↔photo linking, progression, repair history, and evidence-linked reporting.

---

## Appendix A — Exact on-page Pro copy (from accessibility capture)

> Enterprise · Wind Turbine O&M  
> NearthWIND Pro  
> Automated Wind Turbine Inspection Solution  
> Purpose-built autonomous drone hardware that automates wind turbine safety inspection  

> Autonomous Flight at Your Fingertips — It recognizes its target and autonomously plans its own flight path to capture high-quality data. Built-in collision-avoidance safety, proximity flight that maintains a set distance from the structure, and AI-driven capture that covers every surface without gaps.  

> Precision and Efficiency Redefined — A 45-megapixel, 35mm full-frame sensor captures sharp, blur-free imagery.  

> Tailored for Wind Turbine Excellence — Delivers specialized solutions from onshore to offshore wind farms, flying stably even in demanding, high-wind conditions (gusts up to 17m/s) — simple enough for unskilled operators to run after brief training.  

## Appendix B — Video URLs

- Pro: https://www.youtube.com/watch?v=DTCZW75EVRw  
- Mobile: https://www.youtube.com/watch?v=poN_UFjCXXw  
- Zoomable: https://www.youtube.com/watch?v=GhAXEZsRqkQ  
- Nearthlab channel: https://www.youtube.com/channel/UCSdYP89uhpE1-FHKov3gjhA  

## Appendix C — Observation vs inference

| Class | Content |
|---|---|
| Observation | Page DOM/a11y, specs, iframe IDs, YouTube titles/durations/visibility, screenshots, Zoomable marketing UI elements, Error 153 on referer-less embeds |
| Inference | Pro/Mobile loops are atmospheric product clips; Zoomable mock reflects real product filters; CompliQ opportunity mapping |
| Unknown | Live Zoomable tenant behaviour; measured field accuracy of 0.3 mm / 15 min claims; commercial packaging & pricing |

---

*End of report.*
