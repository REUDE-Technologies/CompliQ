# Zoomable AI Platform REA Report  
## Target: `https://ai.zoomable.io/en`

**Document type:** REA-assisted competitive / product intelligence  
**Primary URL:** https://ai.zoomable.io/en  
**Related deep page:** https://ai.zoomable.io/en/energy  
**Date of capture:** 18 October 2026  
**Prepared for:** CompliQ / REUDE product planning  
**Vendor:** NEARTHLAB (footer: ©2025 NEARTHLAB All Rights Reserved)

---

## 1. Method and evidence

### 1.1 What was inspected

| Target | Method | Result |
|---|---|---|
| Zoomable EN home (`/en`) | REA `capture_browser_scenario` (Chromium headless) | DOM, accessibility tree, scroll screenshots, network event families |
| Zoomable Energy (`/en/energy`) | REA scenario + clicks on blade-side demo buttons | DOM, a11y, product carousel, AI Demo LE/SS interactions |
| Supporting public copy | Web fetch of `/en` and `/en/energy` | Marketing claims cross-checked with live DOM |

### 1.2 Primary REA evidence IDs

| Capture | Evidence ID | Notes |
|---|---|---|
| Zoomable EN home | `ev_a34ed46be2e3c9083cf262af21cf1aa20e81782ab04a2084747d9c27980ad147` | Final URL `https://ai.zoomable.io/en`; confidence **observed** |
| Zoomable Energy + AI Demo | `ev_64d2bdd3382b26641c53e7c4b1b416d5ec122780d9a843c622c38d185c4fcc49` | Clicked **Leading Edge** and **Suction Side** demo controls |

### 1.3 Local artifacts (this archive)

Under `D:\Compliq\REA_Competitive_Intelligence\`:

| Path | Content |
|---|---|
| `evidence/zoomable_ai_en_evidence_summary.json` | Home capture digest + SHA-256 of DOM/a11y/screenshot |
| `evidence/zoomable_ai_en_dom.html` | Home DOM snapshot |
| `evidence/zoomable_ai_en_accessibility.txt` | Home accessibility tree |
| `evidence/zoomable_ai_energy_evidence_summary.json` | Energy capture digest |
| `evidence/zoomable_ai_energy_dom.html` | Energy DOM snapshot |
| `evidence/zoomable_ai_energy_accessibility.txt` | Energy accessibility tree |
| `screenshots/zoomable-ai-en-step*.png` | Home scroll sequence |
| `screenshots/zoomable-ai-energy-step*.png` | Energy scroll + side-demo sequence |

### 1.4 Confidence boundary

- **Observed:** Public Next.js marketing app structure, copy, nav IA, industry pages, product carousel labels, AI Demo UI (upload + LE/TE/SS/PS examples), Nearthlab ownership/footer.
- **Inferred:** How the logged-in Zoomable tenant implements dashboard / defect severity / repair workflows beyond marketing screenshots.
- **Not verified:** Authenticated Zoomable app behaviour, real customer datasets, brochure PDF contents, API contracts, pricing, or measured 90% / 1-hour claims.

---

## 2. Product identity (what REA saw)

### 2.1 Positioning

From live accessibility + meta tags on `/en`:

- **Product name:** Zoomable Enterprise  
- **Title / OG:** “Zoomable \| Drone Data Management Platform”  
- **Tagline:** “Powering Smart Inspection and Asset to Smart Inspections”  
- **Subtitle:** “AI-Powered Infrastructure Inspection Platform”  
- **Keywords:** Zoomable, drone, AI, inspection, infrastructure, asset management  
- **Locales:** EN (`/en`) and KR (`/ko`)  
- **Parent company link:** https://www.nearthlab.com  
- **Address:** 3F, 9, Jeongui-ro 8-gil, Songpa-gu, Seoul, Republic of Korea  

Hero body (observed):

> Zoomable streamlines the entire inspection lifecycle — from asset identification to defect detection and lifecycle management — by integrating multi-source sensor data into a unified, intelligent system optimized for complex infrastructure environments.

CTAs observed: **Download Brochure**, **Contact Us**.

### 2.2 Information architecture

Nav links observed on home:

| Label | Path |
|---|---|
| Zoomable Enterprise | `/en` |
| Energy | `/en/energy` |
| Infrastructure | `/en/infrastructure` |
| Public Facility | `/en/public-facilities` |
| Agriculture | `/en/agriculture` |
| KR / EN | `/ko`, `/en` |

Stack signal from DOM: **Next.js** static assets under `/_next/static/...` with Vercel-style `dpl=` deployment query.

---

## 3. Home page — capability pillars

### 3.1 Platform pillars (H3 blocks)

| Pillar | Subtitle | Observed claim |
|---|---|---|
| Flexible Data Alignment | Cross-Platform Sensor Compatibility | Ingest unstructured imagery from fixed industrial cameras, CCTV, UAVs, satellites, aerial platforms; auto-align/classify via source metadata |
| Accuracy and Efficiency | Intelligent Defect Detection and Predictive Risk Assessment | Cloud AI detects defects and classifies risk levels with fine precision |
| Scalability | Scalable Architecture with Custom API Integration | Modular SaaS for single facilities → large infrastructure systems |

### 3.2 Main Functions (H2)

| Function | Headline claim | Detail claim (observed) |
|---|---|---|
| **Fault Detection** | Complete analysis of vast inspection data in just 1 hour | AI analyzes thousands of images, generates defect reports, detects **over 90%** of defects without manual intervention |
| **Image Stitching** | Capture complete, high-quality inspection data without gaps | Real-time stitch of drone images; identifies gaps / incomplete areas; guides re-shoots |
| **Damage Tracking** | Track defect trends for optimal maintenance decisions | Compare current vs historical; visualize growth / progression; filter/sort by maintenance priority |

### 3.3 Industry cards on home

Energy · Public Facility · Infrastructure · Agriculture (each with “View More”).

---

## 4. Energy page — wind-relevant product depth

URL: https://ai.zoomable.io/en/energy

### 4.1 Energy positioning

- H1: **Energy**  
- Subtitle: Smart Inspection Solutions for Efficient and Sustainable Energy Asset Operations  
- Framing: Asset condition diagnosis → strategic operation / **data-driven APM (Asset Performance Management)**  
- Claims: structural defects + O&M history → predict asset risk and **RUL**; ROI-based maintenance; ESG / policy readiness  

POINT blocks:

1. Rising demand for smart inspections in renewables (efficiency, cost, ESG)  
2. Challenges: localized damage → efficiency loss; inspection gaps; safety risk  

### 4.2 APM value props

| Capability | Observed text |
|---|---|
| Integrated Asset Management | Consolidated data from single sites to full energy portfolios |
| Production Forecasting | Short- and mid-term generation from failure patterns / maintenance trends |
| Cost Optimization | ESG-aligned budgeting; maintenance ROI using **LCOE** |

### 4.3 Product carousel (View Products)

Accessibility labels observed:

- **Integrated Dashboard** — real-time inspection status + defect summaries across energy assets  
- **Detailed Defect Management**  
- **Defect Severity Classification** (image alt includes “Defect Severity Classification 2”)  
- Carousel controls: Previous slide / Next slide  

This matches the earlier Nearthlab Enterprise marketing story: dashboard + defect gallery + severity taxonomy.

### 4.4 Applicable energy industries

| Vertical | Defect examples observed on page |
|---|---|
| **Wind Farm** | Surface cracks, lightning damage, edge delamination, corrosion on blades and nacelle |
| Solar Farm | Microcracks, connector failures, internal hotspots |
| Hydroelectric | Cracks, discoloration, seepage (dam / spillway) |
| Nuclear | Cracks, corrosion, seepage (cooling towers, pumps, concrete) |

### 4.5 AI Demo (highest CompliQ relevance)

Section **AI Demo** observed with:

- Label: **Defect AI Blade Detection**  
- Upload control: “Click to Upload or Drag and Drop” — min **1024×1024**, under **10MB**  
- **RUN** button (disabled until upload)  
- Prompt: “Try a Zoomable AI — Please select an example below to identify defects.”  
- Example side buttons (clicked in REA):  
  - **Leading Edge**  
  - **Trailing Edge**  
  - **Suction Side**  
  - **Pressure Side**  
- Multiple “Windturbine blade photo” images for examples  

**Observation:** Zoomable’s public AI demo uses the same four blade-side taxonomy CompliQ already uses (LE / TE / SS / PS). That is table-stakes language for wind blade inspection UIs.

---

## 5. Relationship to Nearthlab stack

| Layer | Product | Role vs Zoomable AI site |
|---|---|---|
| Hardware / flight | NearthWIND Pro / Mobile (nearthlab.com) | Capture autonomy |
| Decision / SaaS | **Zoomable** (`ai.zoomable.io`) | Inspection lifecycle, AI detect, stitch, track, APM |
| Corporate | Nearthlab | Owns both; Zoomable footer links official Nearthlab site |

The Zoomable AI site is the **software decision layer** brochure; it does not require login for marketing, but does expose an interactive blade AI demo on Energy.

---

## 6. Implications for CompliQ

### 6.1 Where Zoomable messaging is ahead

1. Explicit **end-to-end lifecycle** language (identify → detect → lifecycle manage)  
2. **Multi-source ingest** (UAV + CCTV + satellite + fixed cameras) as a first-class pillar  
3. **Coverage / stitch / re-shoot guidance** as a product function, not an afterthought  
4. **Damage tracking / progression** with maintenance priority sorting  
5. Energy APM framing: risk, **RUL**, LCOE / ROI, portfolio dashboard  
6. Public **blade AI demo** with LE/TE/SS/PS examples + upload path  
7. Productised **severity classification** imagery in the marketing carousel  

### 6.2 Where CompliQ can still differentiate

1. **Vendor-agnostic system of record** — Zoomable is Nearthlab-orbit; CompliQ can remain open to any drone / CV pipeline  
2. **Serial blade passport** (e.g. Blade 5288 / 3297) as operator-facing identity  
3. **DNV-style CAT 1–5 SOP language** vs proprietary severity branding  
4. Faster path to **repair work-order closure** and owner/ISP role separation if executed  
5. India / multi-ISP deployment without locking to Nearthlab airframes  

### 6.3 Concrete UI/product lessons from this REA

| Zoomable pattern observed | CompliQ opportunity |
|---|---|
| LE / TE / SS / PS example picker in AI Demo | Keep multi-side selection + slideshow; make side filters as obvious as Zoomable’s demo chips |
| Integrated Dashboard + defect summary | Fleet → asset rollup of open CAT / side coverage |
| Defect Severity Classification carousel | CAT chips on findings gallery + filters |
| Detailed Defect Management | Override / review panel already started — deepen to assign/close |
| Image stitching + gap / re-shoot | Coverage checklist before campaign complete |
| Damage tracking vs history | Campaign progression: New / Stable / Progressing |
| Brochure + Contact CTAs | Keep Download report as defendable output; add clearer “share / export evidence” |

---

## 7. Risks / unknowns

1. Marketing percentages (**>90% detection**, **1 hour** analysis) are **claims**, not validated here.  
2. Product carousel images may be stylised UI, not a live tenant.  
3. AI Demo example images prove UX intent; they do not prove production model quality.  
4. Brochure download and Contact Us flows were **not** fully exercised (no form submission).  
5. Authenticated Zoomable application remains out of scope.

---

## 8. Bottom line

`https://ai.zoomable.io/en` presents **Zoomable Enterprise** as Nearthlab’s AI SaaS for infrastructure inspection: multi-source ingest, cloud defect AI, stitching/coverage, damage progression, and industry packs — with **Energy** as the wind-relevant deep page featuring APM language, severity/dashboard product shots, and an interactive **blade AI demo** keyed to **Leading / Trailing / Suction / Pressure** sides.

For CompliQ, the actionable takeaway is to match Zoomable’s **decision-layer density** (coverage, severity gallery, side-aware review, progression, portfolio summary) while staying **capture-vendor agnostic** and CAT/SOP-aligned.

---

## Appendix A — Observation vs inference

| Class | Content |
|---|---|
| Observation | URLs, nav IA, copy, Next.js stack signals, industry pages, AI Demo controls/sides, Nearthlab footer, REA evidence IDs and local screenshots |
| Inference | Logged-in product mirrors marketing carousel; CompliQ opportunity mapping |
| Unknown | Live tenant behaviour; model accuracy; pricing; brochure PDF detail; API surface |

## Appendix B — Exact URLs

- Home EN: https://ai.zoomable.io/en  
- Energy: https://ai.zoomable.io/en/energy  
- Infrastructure: https://ai.zoomable.io/en/infrastructure  
- Public facilities: https://ai.zoomable.io/en/public-facilities  
- Agriculture: https://ai.zoomable.io/en/agriculture  
- Nearthlab: https://www.nearthlab.com  

---

*End of report.*
