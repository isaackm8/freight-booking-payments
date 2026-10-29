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

## About the data and numbers

- **All data is synthetic.** Companies, USDOT and MC numbers, and shipments are fictional. No real customer or shipment data from past employers is used, even anonymized.
- **Pricing is illustrative.** Interchange, provider margin, network fees and cost of funds are assumptions, not any bank's or network's real pricing.
- **Sourced vs. assumed figures:**
    - From sources: 30–45 day waits, 6–8% factoring cost, 45%, 52%, 60%, 58% and 63%. The 60% is from a 2022 Denim report cited in the paper; the rest are from Mastercard's survey.
    - Assumptions to test: the 80% auto-approval, 50% time saved, 24-hour and 2% false-hold targets.
- **Factoring rates** are randomized per shipment between 6% and 8%, the white paper's range.
- **Approved max** = (booked rate + fuel surcharge) × 1.10, which leaves 10% room for extra charges such as detention or a liftgate.
- **Fraud cases are generated on purpose.** Hold rates show how the mechanism works, not real-world catch rates.

## About the look

- The app uses a Mastercard-*inspired* style: warm neutrals, near-black text, orange accents.
- It does **not** use Mastercard logos or marks. Official branding needs Mastercard's brand assets and approval.
