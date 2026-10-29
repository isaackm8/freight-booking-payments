# CashBridge – Sample Data for the Prototype

All data is **synthetic**. Company names are fictional, USDOT/MC numbers are made up, and fees are illustrative assumptions, not any bank's or network's real pricing. Load the CSVs or `all_data.json` directly.

## Contents

| File | Rows | What it holds |
|---|---|---|
| `payers.csv` | 3 | Three forwarders (the payers in this demo); card program, credit limit, customer (shipper) terms, today's terms to carriers, statement cycle, fee model |
| `shippers.csv` | 9 | The forwarders' customers (3 per forwarder): name, industry, and which forwarder they use |
| `carriers.csv` | 20 | Fleet size, segment (small/mid/large), how they get cash today (factoring / credit line / waits), factoring rate or credit APR, verified bank account |
| `rate_rules.csv` | 15 | Allowed extra charges and caps per payer (detention, liftgate, reweigh, lumper, fuel) |
| `fuel_index.csv` | 10 | Weekly diesel price and fuel surcharge % (synthetic; real index = EIA weekly diesel) |
| `shipments.csv` | 500 | Shipper, lane, pickup and scheduled delivery, booked rate, fuel surcharge, **approved maximum**, factoring rate, virtual card ID, test **scenario** |
| `tracking_events.csv` | 3,053 | Shipment milestones: BOOKED, PICKED_UP, IN_TRANSIT, DELAYED, DELIVERED, EXCEPTION, ON_HOLD with GPS, source, off-route distance and reason |
| `delivery_evidence.csv` | 634 | Proof of delivery: `rfid_scan`, `signature` or `photo`, with time, GPS, source and recipient |
| `invoices.csv` | 500 | Base, fuel, detention, liftgate, reweigh and total; includes 5 duplicate invoices (`duplicate_of`). Loads on hold have no invoice yet. |
| `payments_expected.csv` | 500 | **Answer key**: expected decision, hold reasons, timing, float and fee split under default rules |
| `all_data.json` | – | Everything above in one file, plus `assumptions` |

## Key fields

- **shipments.approved_max_usd**: (booked rate + fuel) × 1.10. Invoices at or under this amount can be auto-approved if the other checks pass.
- **shipments.factoring_rate_pct**: what factoring this load would cost, randomized per shipment between 6% and 8% (the white paper's range). `carriers.factoring_rate_pct` is the average across that carrier's shipments.
- **shipments.scenario**: the test case the row was built for (see mix below). Use it to check the prototype's decisions against `payments_expected.csv`.
- **shipments.carrier_bank_change_request_date**: only on `fraud_bank_changed` rows; a bank-detail change requested days before delivery.
- **tracking_events.off_route_mi**: distance from the expected route, in miles. Above 30 mi is the default hold threshold.
- **shipments.expected_route_mi**: expected route length, in miles. All distances in the data are in miles.
- **tracking_events.event_type**: milestones only. A load is BOOKED 1–3 days before pickup. DELAYED is sent at the scheduled delivery time when the load arrives more than 2 hours late. A load ends DELIVERED, EXCEPTION (refused) or ON_HOLD.
- **tracking_events.reason**: why a DELAYED ("ETA +3.1 h"), EXCEPTION (`damaged`, `refused`, `shortage`) or ON_HOLD ("delivery appointment not set", "held at customer request") event happened.
- **tracking_events.recipient**: on DELIVERED, where the load was delivered; compare with `shipments.consignee`.
- **delivery_evidence.kind**: proof of delivery is an RFID dock-door scan when the load is unloaded, a signature or a photo. Any one confirms delivery. Proof is a record, not a milestone.
- **delivery_evidence.recipient**: who signed or where the photo was taken; blank for RFID scans.
- **carriers.cash_preference**: `factoring`, `credit_line` or `waits`, which drives the carrier's break-even fee.
- **shipments.shipper_id**: the shipper whose goods are moving; always one of that shipment's forwarder's customers (`shippers.payer_id` = `shipments.payer_id`).
- **payers.service_level**: `full` (full forwarding) or `brokerage_only` (the forwarder acts as a broker because the shipper wants limited service). Every payer is a forwarder, never a carrier; the service level doesn't change the hold rules or the economics.
- **payers.customer_terms_days**: days the shipper (the forwarder's customer) takes to pay the forwarder.
- **payers.fee_model**: `carrier_pays`, `split` (60% carrier / 40% payer) or `payer_pays`.

## Scenario mix (500 shipments)

| Scenario | Count | Expected decision |
|---|---|---|
| clean | 340 | auto_approved |
| in_range_extras | 100 | auto_approved (extras within approved range) |
| out_of_range | 25 | held: amount_above_approved_range |
| fraud_off_route | 5 | held: off_route |
| fraud_wrong_recipient | 5 | held: delivered_to_unexpected_recipient |
| fraud_bank_changed | 5 | held: bank_account_changed_recently |
| error_duplicate_invoice | 5 | original paid; duplicate blocked |
| error_missing_pod | 5 | held: missing_proof_of_delivery |
| delivery_exception | 5 | held: delivery_exception (2 damaged, 1 short); refused loads (2) also missing_proof_of_delivery |
| shipment_on_hold | 5 | awaiting_delivery: shipment_on_hold (no invoice yet) |

Result: 445 paid automatically (89%), 50 held (10%), 5 awaiting delivery (1%). When more than one rule fires, `hold_reasons` lists them separated by `;`.

## Default hold rules

1. Invoice total > approved maximum
2. Any in-transit event > 30 mi off the expected route
3. Delivery recipient or location doesn't match the consignee
4. Carrier bank details changed within 14 days before payment
5. Same shipment invoiced twice → pay once, block the duplicate
6. No proof of delivery (RFID scan, signature or photo)
7. Delivery exception reported (damaged, refused or short)
8. Load on hold, not yet delivered: nothing to pay until it is

## Money and timing assumptions (illustrative)

| Assumption | Value |
|---|---|
| Interchange to issuer | 2.0% |
| Issuer cost of funds | 5% a year, for the float days |
| Network fee | 0.13% |
| Card-to-account provider margin | 0.75% |
| Card statement | Closes last day of month, due 15 days later |

- **Payment trigger:** card charged 1 hour after confirmed delivery; carrier funds arrive 4–20 hours later (same-day target).
- **Float days** = payer's statement due date − date carrier received funds. Averages about 32 days, range 14–44.
- **Total fee** = interchange + provider margin, split by the payer's fee model.
- **carrier_factoring_avoided_usd** = what a factoring carrier would have paid at the shipment's factoring rate (amount paid × `shipments.factoring_rate_pct`).

## Metrics the data supports

- Auto-approval rate, holds by reason, false-hold rate (once the prototype's own rules run)
- Hours from delivery to carrier funds
- Float days kept by payers
- Unit economics per shipment: interchange − funding cost − network fee, and fee paid by each side
- Carrier break-even: fee paid vs. factoring rate or credit-line cost, by `cash_preference`
