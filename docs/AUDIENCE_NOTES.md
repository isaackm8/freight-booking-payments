# Level-Set Notes for the Audience

What to tell an audience before the demo, so everyone reads it the same way. Each point is a decision we've made; add new ones as they come up.

Last updated: Oct 29, 2026.

## Who's who

| Role | In the demo | Never |
|---|---|---|
| **Shipper** | The forwarder's customer: the company whose goods are moving. It pays the forwarder, on 45-day terms in the sample data. | Doesn't pay carriers directly in this demo. |
| **Forwarder** | Pays the carrier with its card, then waits for the shipper to pay. The card float closes that cash gap. | A forwarder is never a carrier. |
| **Carrier** | The trucking company that moves the load and gets paid within hours of confirmed delivery. | — |

- **Forwarders acting as brokers count as forwarders.** When a shipper wants limited service, the forwarder acts as a broker. We show that as a service level (`full` or `brokerage only`), not a separate type of company. It doesn't change the hold rules or the economics.
- **Why forwarders:** the Mastercard white paper focuses mainly on forwarders, and the forwarder's cash gap (paying the carrier before the shipper pays) is where the value is largest.

## What forwarders move, and what the demo covers

- **Air and ocean are a forwarder's core business.** Traditionally, forwarders arrange international shipments: booking space on ships and planes, consolidating cargo, handling customs and documents. Most own no ships, planes or trucks; they buy capacity and resell it.
- **Truckload is the leg before and after.** An international shipment usually starts and ends on a truck: factory to port, and port or airport to the warehouse (container moves to and from a port are called drayage). Forwarders arrange and often pay for those legs.
- **Many forwarders also do domestic truckload.** In the US this is legally brokerage and needs FMCSA broker authority, which is why "forwarder acting as a broker" is a real case.
- **The demo is US domestic truckload only.** All 500 sample shipments are truckload. Frame it as "the trucking legs a forwarder pays for."
- **Why truckload first:**
    - Small carriers wait 30–45 days to be paid and often use factoring, so faster payment helps them most.
    - Delivery is easy to confirm with GPS, RFID scans and proof of delivery.
- **Air and ocean are out of scope, for later.** They involve paying airlines and shipping lines (large companies on their own terms), and delivery is confirmed by bills of lading and arrival notices, not truck GPS. They would need different hold rules and data.
- **Possible light step:** label some shipments as drayage (port to warehouse) to show the forwarder's wider business, without changing any rules.

## Milestones and proof of delivery

- **Milestones say where the load is:** booked (tendered), picked up, in transit, delayed, delivered, exception (damaged, refused or short) and on hold.
- **Proof of delivery is a record, not a milestone.** It can be an RFID scan at the dock door, a signature or a photo; any one confirms delivery. It shows on the shipment detail page, under Proof of delivery.
- **"On hold" means the load is held**, for example waiting on a delivery appointment or held at the customer's request. That's different from CashBridge holding a *payment* for review (phase 2), which the app will call "Payment held".
- **Delays are flagged, not held.** A late load is still a valid delivery. Exceptions are held for review, and a load on hold isn't paid until it's delivered.

## How the decision is made

- **Pay or hold is fully automated.** When delivery is confirmed, the CashBridge engine runs the 8 hold rules. If the shipment passes, the forwarder's card is charged and the carrier is paid, with no one involved. If it fails a rule, the payment is held automatically and no money moves.
- **People only handle the holds.** When a payment is held, the forwarder's accounts payable team is notified (by email and in the app; simulated in the demo). Each held payment shows a review status: **awaiting forwarder review**, **released** or **rejected**. A reviewer releases it (CashBridge then pays as usual) or rejects it (nothing is paid and the carrier is told why), with an optional note. Who reviewed it and when is recorded in an audit log that is never edited; an undo is its own entry. A released payment is paid at the invoice amount as it stands. A refused load can't be released, because nothing was delivered; it can only be rejected. Reviewers work from the Review queue: held payments oldest first, with the evidence for each reason next to Release, Reject and Request info (which asks the carrier and keeps the payment held).
- **The forwarder sets the rules.** Thresholds such as the 2-mile off-route limit, 10% room for extras and the 14-day bank-change window are the forwarder's choices; the engine applies them the same way every time.

## Where the data would come from in real life

- **Booked rate:** the forwarder's TMS (transportation management system), by API or EDI 204 load tender, or the signed rate confirmation.
- **Milestones:** the carrier's ELD or app, or a visibility platform, by API or EDI 214.
- **Proof of delivery:** the driver app (signature, photo) or the warehouse's RFID readers.
- **Carrier invoice:** EDI 210, API, or a PDF read by OCR.
- **Payment record:** posted back to the forwarder's ERP or accounting system (SAP, Oracle, NetSuite, QuickBooks) for reconciliation.
- **No TMS or ERP:** a web portal to enter or upload loads (CSV), rate confirmation and invoice uploads, a driver tracking link, and an export to QuickBooks or Excel. In the prototype, the CSVs in `data/` stand in for all of these.

## Who gets what from each payment

Example: SHP-10001, a $1,278.52 invoice, forwarder on the 60/40 split.

| Partner | Role | On this load |
|---|---|---|
| Card issuer (the forwarder's bank) | Earns interchange, 2.0% | +$25.57 |
| | Funds the ~31-day float (5% a year) | −$5.43 |
| Card network (Mastercard) | Network fee, ~0.13% | $1.66 |
| Card-to-account provider | Provider margin, 0.75%; pays the carrier's bank account | +$9.59 |

- **The carrier and forwarder see only the total fee:** interchange + provider margin = 2.75% ($35.16): carrier $21.10, forwarder $14.06. The network fee and cost of funds come out of what the issuer and provider earn.
- **The rates are illustrative.** Commercial card interchange is roughly 1.5–2.7%, network fees about 0.13–0.15%, provider margins about 0.5–1.5%. Check current published schedules before quoting real numbers.
- **Room for discounts:**
    - lower interchange for transactions with rich invoice data (Level 2/3) and for large-ticket B2B payments
    - issuer rebates to high-volume forwarders
    - volume pricing on the provider margin
    - who pays (the fee model)
    - a shorter float
- **The comparison that matters:** factoring costs 6–8% and broker quick pay 2–5%, so even 2.75% beats both.
- **Credit-line carriers are a harder sell.** A credit line charges yearly interest only for the days borrowed: invoice × rate × days waiting ÷ 365. At 11.5–19.5% a year for 30 days, that's roughly 0.9–1.6% of the invoice. In the sample data, 4 of the 5 credit-line carriers would pay more in CashBridge fees than in interest. At a 60/40 split and 30-day terms, a credit-line carrier breaks even at about 20% a year. For them the pitch is speed and freeing up their credit line, or a forwarder that covers more of the fee.

## How the carrier pays its share, and agrees to it

- **The carrier never sends a payment.** The card-to-account provider deducts the carrier's share before paying it out, the same way a merchant receives a card sale minus fees. Example (SHP-10001, 60/40 split): the card is charged $1,278.52, and the carrier receives $1,257.42 ($21.10 deducted). The forwarder's share ($14.06) is added to its card charge or billed to it by the provider; the prototype doesn't model which.
- **Carriers opt in.** The forwarder sets its fee model (carrier pays, 60/40 split or forwarder pays) in its carrier agreement or on each rate confirmation. A carrier can:
    - **enroll:** sign up with the provider, verify its bank account and accept the fee terms, then be paid within hours of confirmed delivery, minus its share
    - **decline:** stay on standard terms, paid in full with no fee but after 30–45 days, or factor the invoice at 6–8% as today
- **The split is set by the forwarder, not negotiated per load.** Large carriers may negotiate it like rates; small carriers usually accept, because even the full 2.75% beats factoring. Forwarders that want carriers to enroll often cover part of the fee.
- **Enrollment is also a security step.** The bank account verified at sign-up is what the bank-change rule (rule 4) protects.
- **In the prototype,** all 20 carriers are treated as enrolled with verified bank accounts. A carrier doesn't need to accept cards, because the provider turns the card charge into a bank deposit. A carrier onboarding screen is a nice-to-have after the MVP.

## About the data and numbers

- **All data is synthetic.** Companies, USDOT and MC numbers, and shipments are fictional. No real customer or shipment data from past employers is used, even anonymized.
- **Pricing is illustrative.** Interchange, provider margin, network fees and cost of funds are assumptions, not any bank's or network's real pricing.
- **Sourced vs. assumed figures:**
    - From sources: 30–45 day waits, 6–8% factoring cost, 45%, 52%, 60%, 58% and 63%. The 60% is from a 2022 Denim report cited in the paper; the rest are from Mastercard's survey.
    - Assumptions to test: the 80% auto-approval, 50% time saved, 24-hour and 2% false-hold targets.
- **Factoring rates** are randomized per shipment between 6% and 8%, the white paper's range.
- **Terms to carriers are 30 days** for all three forwarders: the typical "net 30" (the white paper puts carrier waits at 30–45 days).
- **Credit line rates** (11.5–19.5% a year, one per credit-line carrier) are made up for the demo; real small-business credit lines vary widely, so check current rates before quoting. The Cash Flow Hub's sliders let you try other factoring and credit line rates, for every carrier or just one.
- **US units throughout:** distances in miles, money in US dollars, diesel per gallon. An in-transit update more than 2 miles off the expected route is held for review.
- **Approved max** = (booked rate + fuel surcharge) × 1.10, which leaves 10% room for extra charges such as detention or a liftgate.
- **Fraud cases are generated on purpose.** Hold rates show how the mechanism works, not real-world catch rates.

## About the name and look

- The platform is **CashBridge**, tagline "Freight paid faster. Cash gap closed." It bridges the forwarder's cash gap: the carrier is paid within hours, and the forwarder's card covers it until the shipper pays. The early build plan called it "Pay on Delivery".

- The app uses a Mastercard-*inspired* style: warm neutrals, near-black text, orange accents.
- It does **not** use Mastercard logos or marks. Official branding needs Mastercard's brand assets and approval.
