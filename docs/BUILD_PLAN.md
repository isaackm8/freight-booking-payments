# CashBridge Prototype: Build Plan

Oct 28, 2026. Source: [Pay on Delivery Prototype: Build Plan](https://claude.ai/artifact/2xnsf8jpEnymLocYQqpwyX) (the living doc, written before the product was named CashBridge; this file is a snapshot).

## Goal and scope

Build a clickable web app that shows a freight payment triggered at confirmed delivery, with holds for suspect payments, card-to-account settlement and shipment-ID reconciliation, running on the 500-shipment sample data set.

**What the demo must prove**

1. Most invoices (about 90% in the sample) pay automatically when amounts fall inside an approved range and delivery is confirmed.
2. Suspect payments (off route, wrong recipient, bank change, duplicate, missing proof of delivery) are held before money moves, with a clear reason.
3. Carriers receive funds within hours of delivery while payers keep about 30–45 days of float.
4. The unit economics are visible per shipment, and change with the fee model (carrier pays, split, payer pays).

**Demo use case:** a shipper relies on a forwarder, and the forwarder pays small and mid-sized truckload carriers. The forwarder is never a carrier; a forwarder may act as a broker when the shipper wants limited service. Screens say "Forwarder" (code keeps `payer_id`).

**In scope:** simulated shipments, tracking events, invoices, decision engine, simulated card and card-to-account payments, dashboards, a time-replay control.

**Out of scope:** real payment processing, live carrier or visibility feeds, real bank verification, user authentication beyond role switching, production security.

## Users and views

One app with a role switcher at the top; each role sees its own view of the same shipments.

| Role | Key jobs | Main view |
| --- | --- | --- |
| Forwarder finance / AP lead | See what paid automatically, clear exceptions, track float and fees | Cash Flow Hub + exceptions queue |
| Forwarder operations coordinator | Book loads, set booked rate and approved range | Shipment booking and detail |
| Carrier owner / dispatcher | See each load's payment status, when funds arrive, why a payment is held, fees vs. factoring | Carrier portal |
| Risk analyst (payer or issuer) | Review holds, see the shipment signals behind each one, release or reject | Risk review |
| Program / commercial view (Mastercard, issuer) | Volume, approval rate, float, unit economics by segment and fee model | Program analytics |

## Core flow

Each shipment moves through one lifecycle; the app's views, data and replay all follow it.

1. Booked: rate and approved range set.
2. Picked up, then in transit: milestones arrive (delayed, exception or on hold when something goes wrong).
3. Delivered, with proof of delivery.
4. Invoice received and matched by shipment ID.
5. Decision: auto-approved, or held with a reason.
6. Card charged, then card-to-account payout to the carrier's bank account.
7. Reconciled against shipment and invoice.

(The living doc shows this as a diagram.)

Held payments go to the exceptions queue with their evidence; a reviewer releases them into the same payment path or rejects them.

## Screens and features (MVP)

1. **Cash Flow Hub (payer dashboard):** KPI tiles (auto-approval rate, holds by reason, average hours to carrier funds, average float days, fees this period) and a shipment table filterable by status, carrier, segment and scenario.
2. **Shipment detail:** one page per shipment ID that joins booking, approved range, tracking timeline with a map (expected route vs. actual GPS), invoice line items vs. approved maximum, decision with reasons, payment timeline and fee split.
3. **Exceptions queue:** held payments sorted by age, each with its reason, the evidence (off-route map, recipient mismatch, bank-change date, duplicate invoice), and Release / Reject / Request info actions with an audit note.
4. **Carrier portal:** a carrier's loads with status (in transit, delivered, paid, held), funds-arrival time, plain-language hold reasons, and a comparison of fee paid vs. their factoring or credit-line cost.
5. **Fee model simulator:** pick a shipment or segment, switch between carrier pays / split / payer pays, adjust interchange, provider margin and cost of funds, and see who comes out ahead vs. today.
6. **Savings views:** forwarder or payer savings from closing the cash gap, and carrier savings vs. factoring or a credit line, using placeholder rates or the user's own (see Savings views).
7. **Program analytics:** volume, approval and hold rates, float, issuer margin and network fees, broken down by carrier segment and cash preference (factoring / credit line / waits).
8. **Replay control:** step or play the 500 shipments through time so events, decisions and payments appear as they would live.
9. **Why CashBridge (built):** the first tab, a one-minute read for Mastercard leadership who don't know freight, told from the forwarder's side first (the assumed primary buyer), then the carrier's: the problem (the forwarder's cash gap between 45-day shipper terms and 30-day carrier terms; carriers' 30–45 day waits and factoring (6–8%)), today's pieced-together tools vs CashBridge, who wins, why it matters for Mastercard, SHP-10001 today vs CashBridge and the cash and savings for forwarders and carriers (both live from the API), the 8 hold rules, a one-sentence pitch, and the five-step flow and timeline under How it works. Market-size figures are placeholders until sourced.

**Nice to have, after the MVP:** editable hold rules and thresholds, CSV upload of new shipments, a simple carrier onboarding and bank-verification screen.

## Decision engine

A pure, testable function: `decide(shipment, events, invoices, carrier, rules) → {decision, reasons[], amount}`. The prototype's results must match `payments_expected.csv` for all 500 shipments.

**Hold rules (defaults, editable later)**

| # | Check | Hold reason |
| --- | --- | --- |
| 1 | Invoice total > approved maximum | amount_above_approved_range |
| 2 | Any in-transit event > 2 mi off expected route | off_route |
| 3 | Delivery recipient or location ≠ consignee | delivered_to_unexpected_recipient |
| 4 | Carrier bank details changed within 14 days | bank_account_changed_recently |
| 5 | Second invoice for the same shipment | pay once, block duplicate |
| 6 | No proof of delivery (RFID scan, signature or photo) | missing_proof_of_delivery |
| 7 | Delivery exception (damaged, refused, short) | delivery_exception |
| 8 | Load on hold, not yet delivered | shipment_on_hold (awaiting delivery, nothing to pay) |

**Payment and float**

- Card charged 1 hour after confirmed delivery; carrier funds land 4–20 hours later (same-day target). The funding time comes from the simulated provider's report (`provider_payouts.csv`).
- Float days = payer's statement due date − date carrier received funds (statement closes month-end, due 15 days later).

**Fees per shipment (illustrative assumptions)**

- Interchange 2.0%, provider margin 0.75%, network fee 0.13%, issuer cost of funds 5% a year × float days.
- Total fee = interchange + provider margin, split by fee model: carrier pays 100%, split 60/40, or payer pays 100%.
- Carrier break-even: compare fee paid with factoring rate, or credit-line APR × days paid early.

## Data model and loading

Load the synthetic sample set (the CSVs in [`data/`](../data/)) at startup; every record links through `shipment_id`.

| Table | Key | Joins to | Notes |
| --- | --- | --- | --- |
| payers | payer_id | shipments | forwarders: customer terms, fee model, statement cycle |
| shippers | shipper_id | shipments, payers | the forwarders' customers; each uses one forwarder |
| carriers | carrier_id | shipments, invoices | segment, cash preference, factoring rate or credit APR, bank details |
| rate_rules | payer_id + charge_type | payers | allowed extras and caps |
| fuel_index | week_start | shipments | weekly fuel surcharge % |
| shipments | shipment_id | everything | booked rate, approved maximum, factoring rate, consignee, expected route, scenario |
| tracking_events | event_id | shipment_id | milestones: booked, picked up, in transit, delayed, delivered, exception, on hold, with GPS and off-route miles |
| delivery_evidence | evidence_id | shipment_id | proof of delivery: RFID scan, signature or photo |
| invoices | invoice_id | shipment_id | line items; `duplicate_of` marks duplicates |
| payments | payment_id | shipment_id | written by the decision engine at run time |
| holds | hold_id | payment_id | reason, evidence, reviewer action, audit note |
| payments_expected | payment_id | shipment_id | answer key for tests only |

Keep all money in cents as integers, store timestamps in UTC, and label every screen "Synthetic data, illustrative pricing."

## Architecture and tech stack

Keep it simple: a single web app with a small API and a local database, so it runs on a laptop or a free hosting tier.

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | React + TypeScript, Tailwind CSS | Fast to build clean dashboards |
| Charts and map | Recharts; Leaflet with OpenStreetMap tiles | Free, no API keys needed |
| API | Node.js (Express or Next.js API routes) | One language end to end |
| Database | SQLite (Postgres later) | Zero setup; loads the CSVs at start |
| Decision engine | Pure TypeScript module with unit tests | Matches the answer key; reusable |
| Simulation | Replay service that releases events by timestamp | Shows the flow happening live |
| Payments | Simulated ledger (card charge, card-to-account payout, statement) | No real money; swap for sandbox APIs later |
| Hosting | Vercel or similar | Shareable demo link |

**Later integrations (not in MVP):** card-issuing sandbox for virtual cards, bank-verification sandbox, carrier or visibility-platform tracking APIs, FMCSA carrier lookup, EIA diesel index.

## Metrics in the app

Each success metric from the problem framing appears on a screen, computed from the data, not hard-coded.

| Metric | Target (placeholder) | Where it shows |
| --- | --- | --- |
| Shipments paid within 24 hours of confirmed delivery, no manual touch (north star) | Tracked | Cash Flow Hub, program analytics |
| Auto-approval rate | ≥ 80% (sample: 89%) | Cash Flow Hub |
| Hours from delivery to carrier funds | < 24 | Cash Flow Hub, carrier portal |
| Float days kept by payer | 30–45 (sample avg ~32) | Cash Flow Hub, fee simulator, savings view |
| Holds by reason; time to clear a hold | Clear < 24 h | Exceptions queue, risk review |
| False-hold rate | < 2% | Risk review (once reviewers mark outcomes) |
| Duplicate payments | 0 | Program analytics |
| Fee paid vs. factoring / credit cost, by carrier segment | Carrier better off | Carrier portal, fee simulator, savings view |
| Issuer margin per shipment (interchange − funding cost) | Positive | Program analytics |

Targets are assumptions to validate; only the 30–45 day wait and 6–8% factoring cost come from the white paper.

## Savings views

Two views show each side what the flow is worth in dollars. Both start with placeholder rates and let the user type in their own. Every number is labeled as an estimate.

### Rates: placeholders the user can override

| Rate | Placeholder | Who sets it | Used in |
| --- | --- | --- | --- |
| Payer borrowing rate (credit line or cost of capital) | 9% a year | Payer | Forwarder view |
| Customer (shipper) payment terms | 45 days, from `payers.csv` | Forwarder | Forwarder view |
| Today's terms to carriers | From `payers.csv` | Payer | Both views |
| Factoring rate | From `shipments.csv`: 6–8%, randomized per shipment (placeholder 7% if blank) | Carrier | Carrier view |
| Credit-line APR | From `carriers.csv` (placeholder 12% if blank) | Carrier | Carrier view |
| Fee model and fee rate | From `payers.csv`; illustrative pricing | Admin | Both views |
| Process cost per manual match or dispute | $15 per touch | Payer | Forwarder view (optional) |

A small "Rates" panel on each view shows the current values, a "Use my rates" toggle, and a "Reset to placeholders" link. Changes recalculate the view instantly and are saved per user.

### Forwarder or payer view: "What closing the gap saves you"

- **Cash gap before and after:** days between paying the carrier and collecting from the customer (example: 75 days today, about 40 with the card float).
- **Financing cost avoided** = cash paid out × days closed × borrowing rate ÷ 365 (example: $29,500 × 35 days × 9% ≈ $255 per shipment).
- **Minus fees paid** under the payer's fee model (zero under carrier pays).
- **Plus process savings (optional):** fewer manual matches and disputes × cost per touch, and fraud losses avoided on held shipments.
- **Headline:** "Estimated net working-capital savings this month: $X across Y shipments." Breakdown by lane, customer and carrier.

### Carrier view: "What you saved vs. factoring"

- **Days paid sooner:** today's terms minus hours to funds under the new flow (example: 42 days sooner).
- **Cost today vs. fee now:** for factoring carriers, factoring cost vs. the carrier's share of the fee (example: $280 vs. $66 under the split fee model, so $214 saved on a $4,000 load at 7%).
- **Credit-line and waiting carriers:** compare the fee with interest on a credit line for the same days; when waiting is cheaper, the view says so plainly.
- **Headline:** "You saved an estimated $X this month and were paid N days sooner on average."

### Design rules

- Placeholders on first load so the view works with no setup; user rates replace them once entered.
- Both views use the same fee model, so the payer's savings and the carrier's savings reconcile.
- Show the formula behind each number on hover, with the rates used.
- Label every figure "estimate" and every rate "placeholder" or "your rate".

### Data needed

- New payer fields: `borrowing_rate_pct`, `customer_terms_days`, `cost_per_manual_touch_usd`.
- Already in sample data: carrier `cash_preference`, `credit_line_apr_pct`; shipment `factoring_rate_pct`; payer fee model and terms; float days per payment.
- New user setting: `rate_overrides` (per user, per rate), used before placeholders.

## Build phases

Each phase ends with something you can click and a check you can run.

1. **Foundation:** project setup, load the sample CSVs into SQLite, shipment list and shipment detail page.
    - Done when: all 500 shipments, ~3,050 milestones, 634 pieces of delivery evidence and 500 invoices load, and any shipment ID shows its full record.
2. **Decision engine:** implement the eight hold rules, payment timing, float and fees as a tested module.
    - Done when: decisions match `payments_expected.csv` for 500 of 500 shipments, with unit tests per rule.
3. **Payer views:** Cash Flow Hub (payer dashboard), exceptions queue (Review queue) with evidence and Release / Reject / Request info actions. (A route map was planned and dropped.) (Started early: held payments already show a notification, a review status and Release / Reject on the shipment page. Cash Flow Hub built: KPI tiles, card bills, holds by reason, oldest awaiting review and a by-carrier table comparing each carrier's cost of cash today (factoring or credit-line interest) with its CashBridge fee, with what-if sliders for the rates, for one forwarder or all. Released payments are now paid (charged at the demo's current time, funded by the simulated provider) and counted in the Cash Flow Hub's money figures; refused loads can only be rejected. Every review action goes into an append-only audit log, shown on its own page and in each shipment's history. Review queue built: held payments oldest first, filterable by forwarder and status, with the evidence for each hold reason beside Release / Reject / Request info; the next payment opens after each decision. The route map was dropped as unnecessary: the off-route evidence lists each GPS update that left the route. Phase 3 is done.)
    - Done when: auto-approval 89%, 50 holds shown with correct reasons, and actions update status and audit log.
4. **Carrier and risk views:** carrier portal with payment status and fee vs. factoring; risk review screen. Only the forwarder can release or reject a held payment; carriers see status and reasons and can respond (upload proof, explain, dispute), and the API enforces the role.
    - Done when: switching role to any carrier shows only its loads, funds timing and plain-language hold reasons.
5. **Economics and analytics:** fee model simulator, payer and carrier savings views with editable rates, and program analytics by segment and cash preference. The by-carrier cost what-if (factoring and credit line rates, now on the Cash Flow Hub for the demo) moves here, as part of choosing a fee model; a real forwarder won't know each carrier's rates, so it uses market-rate estimates.
    - Done when: changing the fee model updates who pays and the break-even comparison for every segment.
6. **Replay and polish:** time-replay control, synthetic-data labels, responsive layout, shareable demo link.
    - Done when: a 3-minute demo can walk from booking to paid, held and reconciled shipments without explanation.

## Risks, assumptions and hand-off

**Risks and assumptions**

Points to level-set with an audience are tracked in [AUDIENCE_NOTES.md](AUDIENCE_NOTES.md).

- **Illustrative economics:** fees, interchange and funding costs are assumptions; label them on screen so the demo isn't read as real pricing.
- **Synthetic fraud:** fraud cases are generated, so hold rates show the mechanism, not real-world catch rates.
- **Real names:** keep payers, carriers and banks fictional; use Mastercard only as the network.
- **No UPS data:** nothing from UPS customers or shipments, even anonymized.
- **Scope creep:** finish phases 1–3 before adding integrations or editable rules.

**Hand-off to Claude**

Give Claude, in order:

1. This plan.
2. The four framing sections: problem statement, users, hypotheses, success metrics (in the [README](../README.md)).
3. The sample data in [`data/`](../data/) and its README.

Then ask it to build one phase at a time, starting with: "Build phase 1 of this plan: set up the project, load the sample data into SQLite and create the shipment list and detail pages. Stop when the phase's 'done when' check passes." Review each phase before moving on.
