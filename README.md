<div align="center">
  <img src="https://raw.githubusercontent.com/VrtxOmega/Gravity-Omega/master/omega_icon.png" width="100" alt="VERITAS DASH" />
  <h1>VERITAS DASH</h1>
  <p>
  <p><strong>Sovereign Gig-Worker Financial Dashboard — PWA for DoorDash Operators</strong></p>
</div>

<div align="center">

![Status](https://img.shields.io/badge/Status-ACTIVE-success?style=for-the-badge&labelColor=000000&color=d4af37)
![Version](https://img.shields.io/badge/Version-v1.0.0-informational?style=for-the-badge&labelColor=000000&color=d4af37)
![Stack](https://img.shields.io/badge/Stack-HTML%20%2B%20CSS%20%2B%20Vanilla%20JS-informational?style=for-the-badge&labelColor=000000)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge&labelColor=000000)

</div>

---

Veritas Dash is a sovereign, browser-native financial dashboard built for gig-workers. It tracks daily earnings, expenses, miles, hours, bill allocation, tax reserve, baby-fund savings, and take-home pace with a VERITAS gold-and-obsidian interface. All data is stored locally — no server, no tracking, no accounts. Installable as a Progressive Web App (PWA) for standalone mobile experience.

---

## Ecosystem Canon

Within the VERITAS & Sovereign Ecosystem, operator productivity is sovereign productivity. Veritas Dash is the financial operations console for the operator who earns on their own terms — a DoorDash driver, a freelancer, any independent worker who needs visibility into their bottom line without surrendering data to a platform. It is styled identically to ShiftForge (the scheduling layer) so that the operator moves between tools without cognitive friction. The same gold-and-obsidian palette. The same glassmorphism surfaces. The same zero-server guarantee.

---

## Overview

Veritas Dash is a static PWA that runs entirely in the browser and stores data in `localStorage`. The dashboard presents:

- A hero progress ring visualizing daily earnings against goal
- Shift-by-shift entry with one-tap categorization
- Expense tracking (gas, maintenance, meals, tolls, family, other)
- Take-home calculation with bills, tax reserve, mileage deduction, and baby-fund planning
- Miles/hours tracking for better hourly and deduction visibility
- Weekly command view for take-home pace, remaining goal, runs left, reserves, miles, and hours
- Month and year-to-date export snapshot for tax-prep visibility
- Local backup links for moving private data between browsers without a backend
- A non-medical shift readiness checklist for water, snack, charger, fuel, and break plan
- Weekly and monthly aggregated analytics
- Confetti celebration on goal achievement

---

## Features

| Capability | Detail |
|---|---|
| One-Tap Shift Entry | Log a shift in under 10 seconds with earnings and mileage |
| Real-Time Profit Ring | SVG-driven progress visualization with color-coded goal status |
| Expense Categorization | Choose gas, maintenance, meals, tolls, family, or other |
| Tax + Baby Fund Planner | Calculates reserve and savings buckets from configured percentages |
| Mileage + Hours | Tracks miles, mileage deduction estimate, and hourly pace |
| Week Command | Shows weekly take-home, remaining goal, estimated runs left, reserve total, miles, and hours |
| Export Snapshot | Surfaces month and year-to-date totals used in the CSV report |
| Local Backup Link | Generates a private restore link for browser-to-browser migration |
| Smart Insights | Contextual analysis: "You're 73% to goal — $41.50 to go" |
| PWA Installable | `manifest.json` + icons for standalone mobile app experience |
| Offline-First | All data persists in `localStorage`; no account or backend required |
| Weekly/Monthly Rollups | Aggregated views with trend detection |
| Dark Mode (Default) | VERITAS obsidian-and-gold aesthetic; no light mode toggle required |

---

## Architecture

```
+------------------+     +------------------+     +------------------+
|   PWA SHELL      | ---> |   INDEX.HTML     | ---> |  VANILLA JS LOGIC |
|  Manifest + icons|     |  Gold-and-Obsidian|     |  Earnings calc   |
|  PWA icons       |     |  Glassmorphism UI |     |  Expense tracker |
+------------------+     +------------------+     |  Goal engine     |
                       |                        +------------------+
                       v
              +------------------+
              |  LOCAL STORAGE   |
              |  (only mode)     |
              +------------------+
```

---

## Quickstart

### PWA Install

1. Visit **https://vrtxomega.github.io/veritas-dash/**
2. On mobile, tap **Add to Home Screen**
3. On desktop (Chrome/Edge), click **Install** in the address bar

### Local Development

```bash
git clone https://github.com/VrtxOmega/veritas-dash.git
cd veritas-dash
# Serve with any static server
npx serve .
# Or open index.html directly in browser
```

---

## Data Model

| Entity | Storage | Fields |
|---|---|---|
| Shift | localStorage | id, date, startTime, endTime, earnings, mileage, category |
| Expense | localStorage | id, date, amount, category, note |
| Goal | localStorage | dailyTarget, weeklyTarget, hourlyTarget, currency |
| Settings | localStorage | taxRate, babyFundRate, mileageRate, fixedBills |
| Care Check | localStorage | water, snack, charger, fuel, breakPlan |

---

## Security & Sovereignty

- **No server-side processing**: All logic runs in the browser. No backend API processes your earnings data.
- **Private by default**: Backup/share is link-based and user-triggered; there is no built-in cloud sync.
- **Zero telemetry**: No analytics, no tracking pixels, no crash reporting.
- **Local storage warning**: Browser storage is private to the device/browser profile, but it is not a substitute for an encrypted vault.

---

## Roadmap

| Milestone | Status |
|---|---|
| Core dashboard with shift entry | Complete |
| SVG progress ring + smart insights | Complete |
| PWA installability | Complete |
| Expense categorization engine | Complete |
| Weekly/monthly analytics | Complete |
| Multi-currency support | Planned |
| Tax export (1099) | Planned |
| ShiftForge integration (scheduling + earnings) | Planned |
| Optional encrypted sync | Planned |

---

## Omega Universe

| Repository | Role |
|---|---|
| [shiftforge](https://github.com/VrtxOmega/shiftforge) | Employee scheduling layer — same aesthetic, same operator |
| [veritas-vault](https://github.com/VrtxOmega/veritas-vault) | Session capture and knowledge retention |
| [Gravity-Omega](https://github.com/VrtxOmega/Gravity-Omega) | Desktop AI platform |

---


## 🌐 VERITAS Omega Ecosystem

This project is part of the [VERITAS Omega Universe](https://github.com/VrtxOmega/veritas-portfolio) — a sovereign AI infrastructure stack.

- [VERITAS-Omega-CODE](https://github.com/VrtxOmega/VERITAS-Omega-CODE) — Deterministic verification spec (10-gate pipeline)
- [omega-brain-mcp](https://github.com/VrtxOmega/omega-brain-mcp) — Governance MCP server (Triple-A rated on Glama)
- [Gravity-Omega](https://github.com/VrtxOmega/Gravity-Omega) — Desktop AI operator platform
- [Ollama-Omega](https://github.com/VrtxOmega/Ollama-Omega) — Ollama MCP bridge for any IDE
- [OmegaWallet](https://github.com/VrtxOmega/OmegaWallet) — Desktop Ethereum wallet (renderer-cannot-sign)
- [veritas-vault](https://github.com/VrtxOmega/veritas-vault) — Local-first AI knowledge engine
- [sovereign-arcade](https://github.com/VrtxOmega/sovereign-arcade) — 8-game arcade with VERITAS design system
- [SSWP](https://github.com/VrtxOmega/sswp-mcp) — Deterministic build attestation protocol
## License

Released under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built for sovereign workers by <a href="https://github.com/VrtxOmega">RJ Lopez</a> &nbsp;|&nbsp; VERITAS &amp; Sovereign Ecosystem &mdash; Omega Universe</sub>
</div>
