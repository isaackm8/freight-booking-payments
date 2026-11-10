# Level-Set Notes for the Audience

What to tell an audience before the demo, so everyone reads it the same way. Each point is a decision we've made; add new ones as they come up.

Last updated: Nov 10, 2026.

## Start with Why CashBridge

- **Open on the Why CashBridge tab** (`/why-cashbridge`). It is written for Mastercard leadership who don't know freight and takes about a minute. It opens with the line to repeat: "CashBridge lets forwarders pay carriers within hours of a proven delivery without tying up their own cash." Then: the problem (and how it's pieced together today), what CashBridge does, one load (SHP-10001) today vs CashBridge, including about $15 of manual handling per load today (a placeholder), how it works, why it's safer and more secure, and who wins (with why it matters for Mastercard). It ends by pointing to the Cash Flow Hub and Virtual Card for the live figures; the demo-totals section was dropped as a repeat of those pages. We dropped "the card bill comes due about when the shipper pays" from the line: the bill is due about 32 days after the carrier is paid and the shipper pays at 45, so it overstated the match.
- **The forwarder is the assumed primary buyer; carriers come second.** This is an assumption, so say it as one. Lead with the forwarder's cash gap: shippers pay it on long terms (45 days in the sample data) while it pays carriers in about 30, so its own cash is tied up for weeks on every load, cash it needs for payroll, growth and taking on more loads. On the card, that cash stays in its account until the bill is due, close to when the shipper pays. The carrier's 30–45 day wait and factoring cost are the other side of the same problem.
- **The forwarder's float has a dollar value only under an assumption.** The Virtual Card page values it at a placeholder 9% a year cost of borrowing, which the viewer can change; Why CashBridge no longer puts a dollar figure on it.
- **Say "factoring" with every 6–8%.** Explain it once (selling the invoice to a finance company that pays now but keeps 6–8%), then say "factoring (6–8%)".
- **Don't claim no one else does this.** Competitors such as TriumphPay exist; the claim is that today nothing ties the payment to proof of delivery for both the forwarder and the carrier.
- **Start big, then narrow: "more than US$4 trillion", then about $109B.** Mastercard's white paper says freight and logistics companies spend "more than US$4 trillion" a year (McKinsey Payments Map & Research 2023). Quote it as spend by the industry, as the paper does; don't call it "B2B supply-chain payments", and don't say whether it's global or US, because the paper doesn't. It's the big picture, not CashBridge's market.
- **Market size: about $109B a year, an estimate.** That's what US brokers and other domestic 3PLs paid the carriers that hauled their freight in 2025: their gross revenue ($128.3B) minus their net revenue ($19.6B), from Armstrong & Associates. Brokerage is about 83% of it (about $90B). It counts only intermediary payments to carriers, not all trucking revenue (which includes private fleets), and it leaves out international forwarding ($85.9B gross, mostly ocean and air). The segment also includes some intermodal and dedicated moves, so always say "about" and "estimate".
    - **Every 1% moved onto card is about $1.1B** in new volume: simple arithmetic on the $109B.
    - **Nearly 60% of freight brokers still use paper checks** (Denim, Freight Broker Pulse Report 2022, as cited in Mastercard's own white paper). Say "use paper checks", as the paper does, not "pay carriers by check". Quoting Mastercard's own source is the safest choice in front of Mastercard leadership.
    - **If asked what share is on card today:** "Not publicly reported; checks and ACH still dominate, and that's the headroom." Don't guess a number.

## The Virtual Card page: what "value gained" is measured against

- **The tab is called Virtual Card; the page is headed "Mastercard Virtual Card" and names the issuing bank.** The name says what the page is about (the forwarder's card account and what it is worth) and keeps it distinct from the Cash Flow Hub (is everything paid, what needs attention). A forwarder admin knows the card from their bank; Mastercard is the network it runs on, so the page says both.
- **The baseline is paying carriers same day from the forwarder's own cash** (for example, quick pay), not today's net-30 terms. The page says so: "vs paying carriers same day from your own cash".
- **Why:** against net-30 the card barely changes when the forwarder's cash leaves. The card bill is due about 32 days after the carrier is paid, versus 30 days today, so cash stays put only about 2 days longer. The real gain is that carriers are paid within hours *without* the forwarder using its own cash: the same speed as quick pay, funded by the card for about a month. Comparing with net-30 would undersell that; comparing with same-day pay from own cash measures it.
- **Every figure is an estimate** at placeholder rates the viewer can change: borrowing 9% a year (the build plan's placeholder) and $15 per manual touch.
- **Who pays the fee decides the sign.** Borrowing for about 32 days at 9% is worth roughly 0.8% of a payment, less than the 2.75% fee. So in the sample data the net value is positive when the carrier pays (Great Lakes) or splits the fee (Harborline, with process savings), but negative when the forwarder pays the whole fee (Midwest: about −$2,100 at the placeholders). The break-even borrowing rate for a forwarder paying the whole fee is about 31% a year; on the 60/40 split it is about 12.5% before process savings. Say this plainly if asked: the forwarder's case rests on the carrier paying most of the fee, which the carrier accepts because 2.75% beats factoring (6–8%).
- **The setup is pre-configured and display-only.** The account, card program, rules, terms of service and virtual cards are simulated, and nothing on the page changes a payment decision.

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
- **For the forwarder, the pitch is cash flow, not cost savings.** Its borrowing rate is yearly, while the fee is charged once per load: at 8% a year, 32 days of float is worth about 0.7% of the invoice. Against its fee share that means carrier pays (0%) puts it ahead, a 60/40 split (1.1%) breaks even at about 12.5% a year, and paying the whole fee (2.75%) only at about 31%. So the value is a month of working capital without asking a bank, which matters most to forwarders short of credit, and the fee model is the lever.
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
