# Greeneration · Order desk (B2B prototype)

Clickable front-end prototype of the **Order desk** — the coordinator workspace for Greeneration's restaurant and hotel orders. It follows the Figma file "B2B Pages" screen by screen: requests coming in from WhatsApp / email, turning them into orders, amendments after confirmation, payment states, the product catalog and customer balances.

**Live:** https://green-b2b.vifine.tech

**Login:** `test` / `test`

## What you can click through

| Route | Screen |
| --- | --- |
| `#/login` | Sign in (session is kept in `localStorage`) |
| `#/` | Home — "Needs your decision" cards and "At a glance" tiles link to the journals with the matching tab |
| `#/crm/requests` | Requests journal — tabs with counts, search, delivery filter |
| `#/crm/requests/:id` | Request card — client message (drag/click the grip to expand), download-only attachments, summary, "Becomes an order when" checklist computed from the request, editable lines. ✓ accepts the agent suggestion, the magnifier picks a product from the catalog, "+ Add line" opens the catalog popup. **Create order** stays disabled until every check passes (try #46412: accept the suggestion and open the unread attachment). |
| `#/crm/orders` | Orders journal — stage and payment as dot + text, Payment and Delivery filters |
| `#/crm/orders/:id` | Order card — progress (Received → … → Paid), amendment alert, Delivery block (DN pdf, Change delivery), Payment block (INV pdf, Resend invoice / link, Send SOA), lines with amended ("was 1") and removed rows. **Apply changes** applies them and clears the alert (try #46388). |
| `#/references/catalog` | Catalog — order for a client from the catalog; packs with steppers, custom weight in grams (price per 10 g, "To be confirmed", sums with ≈) |
| `#/customers/balances` | Customer balances — KPIs, tabs, terms / sort filters; a row opens the detail |
| `#/customers/balances/:id` | Balance detail — status, KPIs, collection cycle, open invoices with PDF downloads |

Sections that are not designed yet (Leads, Issues, Claims, Clients, Stock, Prices, Delivery zones, Audit log) open a "Coming soon" page inside the shell. The Bitrix24 icon after the breadcrumb on the request, order and balance cards is a placeholder link.

Payment states on orders follow the "Payment states" spec in Figma: on account (not due / due soon / overdue), payment link sent, awaiting prepayment, prepaid, cash on delivery, cash collected, paid.

## Data

- **Products** (SKU, name, category, pack, base price) come from the Greeneration catalog; product photos are hot-linked from the public website CDN.
- **Everything else is fictional**: clients, people, phone numbers, messages, requests, orders, invoices, balances and payments are invented for the demo. Availability is generated.
- There is no backend. Changes live in memory and reset on reload; downloaded PDFs are generated in the browser.

## Run locally

```bash
npm ci
npm run dev       # http://localhost:5173
npm run build     # type-check + production build into dist/
npm run preview   # serve dist/ on http://localhost:4173
```

Vite + React + TypeScript, `HashRouter`, plain CSS with design tokens as CSS variables (`src/styles.css`), Heebo from Google Fonts.

## Deploy

Every push to `main` builds and deploys to GitHub Pages via `.github/workflows/pages.yml`. The custom domain is set by `public/CNAME` (`green-b2b.vifine.tech`), so the Vite `base` is `/`.

Screenshots of every screen at 1440 × 900 are in [`docs/screens`](docs/screens).
