# CashBridge

**Freight paid faster. Cash gap closed.**

A prototype for paying freight carriers through a payment tied to the shipment ID.

Sources: Mastercard's freight payments white paper (including the page 11 scenario), plus additions from the project brief.

## Status

Early prototype — work in progress.

## Problem Statement

Freight payments slow down when the shipment record and the payment record drift apart.

- **The cost is large.** Freight and logistics companies spend over $4 trillion a year. Even so, 45% of survey participants wait more than 30 days to get paid, and 52% of forwarders have cash gaps of more than 20 days. Factoring to get paid sooner costs 6–8% per transaction.
- **The price isn't final at booking.** Detention, liftgate, reweighs, fuel and currency change the amount after delivery. 45% of participants call invoice reconciliation a significant pain.
- **Payment isn't tied to delivery.** Carriers invoice by PDF, paper or EDI (electronic data interchange). Payers check each invoice against the contract and proof of delivery by hand. About 60% of freight brokers still pay by paper check.
- **Fraud is hard to catch.** Money can go to the wrong party through double brokering, changed bank details, or a shipment that went off route or was never delivered. Today's process rarely checks shipment data before money moves.
- **Cards don't fit freight as they are.** A single-use card for the exact booked amount breaks when the price changes. 58% of carriers and 63% of forwarders have never considered accepting cards. Some carriers also charge fees that depend on how a payment arrives.

**Opportunity:** a payment tied to the shipment ID. It would:

- allow a flexible amount within an approved range
- be triggered by confirmed delivery
- be held when shipment signals look wrong
- settle to the carrier's bank account
- reconcile automatically

## Users

### Primary

1. **Forwarder's accounts payable or finance lead** (a forwarder may also act as a broker when the shipper wants limited service)
   - *Job:* pay carriers accurately and on time, and hold on to cash for 30–45 days.
   - *Pain:* manual invoice matching, disputes over extra charges, and exposure to fraud.
   - *Needs:* a queue that shows only exceptions, one record per shipment ID, and an audit trail.
2. **Owner or dispatcher at a small or mid-sized carrier**
   - *Job:* get paid quickly and predictably for completed loads.
   - *Pain:* 30–45 day waits, factoring fees, chasing paperwork, and short payments.
   - *Needs:* the payment status of every load, money paid into their bank account without having to accept cards, and clear reasons when a payment is held.

### Secondary

3. **Operations or freight coordinator at the payer:** books loads, sets the rate and the approved range, and resolves exceptions.
4. **Risk and compliance analyst** (at the payer or card issuer): reviews held payments and fraud signals such as route deviations, wrong recipients and changed bank details.
5. **API partners** (no user interface): transport management systems, visibility platforms, carrier tracking and RFID feeds, card issuers, and card-to-account providers.

**Demo use case:** a shipper relies on a forwarder, and the forwarder pays small and mid-sized truckload carriers. The forwarder is never a carrier. This is where the value is largest: the card closes the gap between the forwarder paying the carrier and the shipper paying the forwarder.

## Hypotheses

1. **Flexible amount:** compared with a fixed-amount card, a shipment card with an approved price range will let at least 80% of invoices go through without manual review.
2. **Delivery-triggered payment:** releasing payment when delivery is confirmed (by milestones, proof of delivery or RFID) will cut how long carriers wait from 30–45 days to under 2 days. The goal is same-day receipt.
3. **Fraud and accuracy holds:** checking shipment signals before releasing funds will stop most fraudulent or wrong payments. The signals are route, recipient, duplicate invoice and changed bank account. Few enough legitimate payments will be held that carriers keep trusting the system.
4. **Reconciliation:** matching payment, shipment and invoice by shipment ID will cut the payer's finance time per invoice by more than 50%.
5. **Willingness to pay:** small carriers will pay a fee lower than factoring (6–8%) to be paid at confirmed delivery. Payers will pay for 30–45 days of card float. Together, these must cover funding, processing and integration costs.
6. **Carrier segments:** large carriers already paid on short terms, as at UPS, will see limited benefit. Adoption will concentrate among small and mid-sized carriers.
7. **Billing rules:** at most target carriers, card-to-account payments will arrive without added fees and without failing to match the invoice.

## Success Metrics

**North star:** the share of shipments paid within 24 hours of confirmed delivery, with no manual step.

### Carrier outcomes

- Days from delivery to funds in the carrier's account: target under 1 day (baseline 30–45).
- Share of carriers who stop factoring the loads paid this way.
- How satisfied carriers are with how fast and how clearly they are paid.

### Payer outcomes

- Invoices approved without review: target at least 80%.
- Finance minutes per invoice: target a reduction of at least 50%.
- Dispute rate, and average days to resolve a dispute.
- Days of float kept: target 30–45.

### Fraud and risk

- Fraudulent or wrong payments caught before release: baseline set during the pilot.
- Legitimate payments held by mistake (false holds): target under 2%.
- Time to clear a held payment: target under 24 hours.
- Payments sent to unverified bank accounts: target zero.

### Commercial viability

- Revenue per shipment compared with funding, processing and integration costs: target positive unit economics.
- The fee carriers accept, compared with what factoring costs them.
- Moving from pilot to production: the share of carriers and payers who continue after the pilot.

### Guardrails

- Duplicate payments: target zero.
- Payments that fail to post at the carrier because of billing rules.
- Delivery-data coverage: the share of shipments with usable tracking or proof of delivery.

## Assumptions and Data

- **The targets are placeholders.** The 80%, 50%, 24-hour and 2% figures are assumptions to test, not findings. Only these figures come from sources: 30–45 days, 45%, 52%, 6–8%, 60%, 58% and 63%. The 60% figure comes from a 2022 Denim report cited in the paper. The rest come from Mastercard's survey.
- **Data the prototype needs:**
  - shipment ID
  - booked rate and approved range
  - shipment milestones: booked, picked up, in transit, delayed, delivered, exception, on hold
  - proof of delivery: an RFID scan, a signature or a photo
  - invoice
  - the carrier's verified bank account
  - hold rules

  The prototype simulates all of these with sample data rather than live feeds.

## Sample Data

The approach: synthetic data generated from a defined schema, and live partner feeds later. Everything is in [`data/`](data/), as CSVs plus a combined `all_data.json`. [`data/README.md`](data/README.md) documents every field. All names, USDOT/MC numbers and fees are fictional.

### Data sets

| File | Rows | Holds |
|---|---|---|
| `payers.csv` | 3 | Forwarders (one acting as a broker): service level, card program, credit limit, customer terms, terms to carriers, statement cycle, fee model |
| `shippers.csv` | 9 | The forwarders' customers, 3 per forwarder |
| `carriers.csv` | 20 | Fleet size, segment (12 small, 5 mid, 3 large), how they get cash today (factoring, credit line or waiting), verified bank account |
| `rate_rules.csv` | 15 | Allowed extra charges and caps per payer |
| `fuel_index.csv` | 10 | Weekly diesel price and fuel surcharge |
| `shipments.csv` | 500 | Shipper, lane, dates, booked rate, approved maximum, factoring rate (6–8%, randomized per shipment), virtual card ID, test scenario |
| `tracking_events.csv` | 3,053 | Shipment milestones: booked, picked up, in transit, delayed, delivered, exception and on hold, with GPS, off-route distance and a reason for delays, exceptions and holds |
| `delivery_evidence.csv` | 634 | Proof of delivery: RFID scans, signatures and photos |
| `invoices.csv` | 500 | Itemized charges, including 5 duplicate invoices. Loads on hold aren't invoiced yet. |
| `payments_expected.csv` | 500 | **Answer key:** expected decision, hold reasons, timing, float and fee split |

### Scenario mix

| Scenario | Shipments | Expected decision |
|---|---|---|
| Clean | 340 | Paid automatically |
| Extras within approved range | 100 | Paid automatically |
| Above approved range | 25 | Held |
| Off route, wrong recipient, recent bank change | 5 each | Held |
| Missing proof of delivery | 5 | Held |
| Duplicate invoice | 5 | Original paid, duplicate blocked |
| Delivery exception (2 damaged, 2 refused, 1 short) | 5 | Held |
| Shipment on hold | 5 | Not paid yet: awaiting delivery |

Result: 445 paid automatically (89%), 50 held (10%) and 5 awaiting delivery (1%). The decision engine matches this for 500 of 500 shipments.

### Default hold rules

1. The invoice total is above the approved maximum, which is (booked rate + fuel) × 1.10.
2. Any in-transit event is more than 2 miles off the expected route.
3. The delivery recipient doesn't match the consignee.
4. The carrier's bank details changed within 14 days before payment.
5. The same shipment is invoiced twice: pay once, block the duplicate.
6. There is no proof of delivery (RFID scan, signature or photo).
7. The carrier reports a delivery exception (damaged, refused or short).
8. The load is on hold and not yet delivered: nothing to pay until it is.

### Real sources to add later

- **Carrier identity:** FMCSA's carrier registry (SAFER / QCMobile)
- **Fuel:** EIA weekly diesel prices
- **Lanes:** BTS Freight Analysis Framework
- **Routes:** OpenStreetMap with OSRM
- **Currency:** central bank exchange rates
- **EDI formats:** sample EDI 204, 214 and 210 files

Sandboxes worth exploring:

- **Payments:** Mastercard Developers, Stripe Issuing (test mode)
- **Bank verification:** Plaid
- **Tracking:** UPS, project44 and FourKites. Some of these require a partner agreement.

No real customer or shipment data from past employers is used, even anonymized.

## Getting Started

You need [Node.js](https://nodejs.org) 24 or later. Then, from the project folder:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3001 and rebuilds a local SQLite database (`var/freight.db`) from the CSVs in `data/` every time it starts.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API and the web app together |
| `npm test` | Runs the checks, including the "done when" checks for phases 1 and 2 |
| `npm run db:load` | Rebuilds `var/freight.db` without starting the app |
| `npm run typecheck` | Checks TypeScript types |
| `npm run build` | Builds the web app into `dist/` |

**Project layout**

- `server/`: the API (Express) and the loader that puts the CSVs into SQLite. Money is stored as integer cents and timestamps in UTC.
- `server/engine.ts`: the decision engine. It runs the 8 hold rules, then works out payment timing, float and fees. It is pure functions, so each rule is unit tested.
- `server/reviews.ts`: the forwarder's release or reject of a held payment, saved to `var/reviews.json` so it survives restarts.
- `web/`: the React app (Vite, Tailwind).
- `shared/`: types used by both.
- `docs/BUILD_PLAN.md`: the build plan and its phases.
- [`docs/AUDIENCE_NOTES.md`](docs/AUDIENCE_NOTES.md): what to level-set with an audience before a demo (who's who, truckload-only scope, synthetic data).

**Progress:** phase 1 (foundation) is done: shipment list with filters, and a detail page per shipment ID.
