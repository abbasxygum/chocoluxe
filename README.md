# Chocoluxe by Iram — E-commerce + Admin Order Manager

A mobile-first e-commerce site for handcrafted artisan chocolates, backed by an
Express + SQLite API with a **separate admin login** and an **order manager** that
shows the custom messages customers leave while ordering.

## Features

### Storefront
- Cosy, handcrafted look — warm cream/clay palette, Fraunces serif with hand-written
  Caveat accents, "made fresh daily" announcement bar
- Products are loaded live from the API — add or edit them in the admin and they appear
  on the site straight away
- **33 products across 9 categories**: Chocolate Bars, Truffles & Bonbons, Lollipops,
  Bites & Bark, Fudge & Brittle, Hot Chocolate, Combo Packs, Gift Boxes, Seasonal
- Category filter chips (with live counts) plus a search box
- Product cards show tagline, price range, star rating, stock level
  ("Only 5 left today") and badges (Bestseller / New / Limited)
- **Per-item custom message** — when you add a product you can write a short
  personalisation (max 50 chars) that is hand-written onto a kraft card
- **Order-level note** — an optional gift message / delivery note at checkout
- Products without a photo show an on-brand placeholder tile, so the grid never looks
  broken while you are still shooting the new range
- Size + quantity selection per product, slide-out cart, two-step checkout
- Cash on Delivery and Cashfree online payment (cards, UPI, net banking, wallets)
- Cart persisted in `localStorage`

### Admin order manager
- **Separate login page** (`admin-login.html`) that only accepts `role = 'admin'`
  accounts. A customer account cannot sign in to the admin page (403).
- JWT auth (bcrypt password hashing); requests without a valid admin token are
  rejected (401/403)
- **Overview** — revenue, total/pending/processing/shipped/delivered/cancelled
  counts, recent orders, status breakdown
- **Orders** — searchable + filterable list (status, payment), pagination
- **Order detail** — customer info, items with their **custom messages**, the
  customer's **gift/delivery note**, and a full status history timeline
- **Custom Messages** page — every per-item message and order note in one place
- **Products** — full product management: search, filter by category/stock, create,
  edit, hide. Photos can be attached by picking from the `Pictures/` folder in the browser.
  New categories can be created from the editor.
- Manage orders: **Update status**, **Accept**, **Reject** (with reason)


## Setup

### 1. Requirements
- Node.js 18+ (developed on Node 26)

### 2. Install & run
```bash
npm install          # installs dependencies
npm run init-db      # creates server/chocoluxe.db + seeds admin, a demo customer and 7 products
npm start            # starts the server on http://localhost:5500
```

- Storefront: <http://localhost:5500/>
- Admin login: <http://localhost:5500/admin-login.html>
- Admin panel: <http://localhost:5500/admin.html>

### Default accounts
| Role     | Email                   | Password     |
|----------|-------------------------|--------------|
| Admin    | admin@chocoluxe.com     | `admin123`   |
| Customer | customer@test.com       | `customer123`|

> Change the admin password before going live. The customer account is only a
> demo and is not used by the storefront (guest checkout works without login).

### 3. Environment (`.env`)
Copy the keys you need and set your own values:
```
PORT=5500
NODE_ENV=development
WEBSITE_URL=http://localhost:5500
CASHFREE_APP_ID=...
CASHFREE_SECRET_KEY=...
JWT_SECRET=<long random string>   # signs admin/customer auth tokens
WEBHOOK_SECRET=...                # verifies Cashfree webhooks
```

## How custom messages reach the admin

1. Customer adds a product and enters a personalisation message in the
   "Personalise your chocolates" popup (or clicks "Add without message").
2. The message is stored on that cart item (max 50 chars, server-validated).
3. At checkout the cart is `POST`ed to `/api/orders`; the server normalises and
   saves each item's `message` plus the order-level `special_instructions`.
4. In the admin panel the message shows up in three places:
   - the order detail modal (per item),
   - the order-level "Gift message / delivery note" box,
   - the **Custom Messages** page (`GET /api/admin/messages`).

## Adding products and photos

You do not need to touch any code to change the catalog.

1. Drop a photo into `Pictures/`.
2. Open **Admin > Products > + New product**. Click **Choose from Pictures/** to pick
   the photo, or type the path.
3. Fill in the name, tagline, description, category, sizes/prices and stock, then save.
   It appears on the storefront immediately.

Products with no photo yet render a gradient placeholder tile so the grid stays tidy.

Prices entered on a product card become the single source of truth: the order API
re-prices every item from the `products` table, so a tampered browser payload cannot
change what an order costs.

## API (summary)

Public:
- `GET /api/products`, `GET /api/products/:id`
- `GET /api/products/categories`
- `POST /api/orders` (guest or logged-in; stores per-item messages + note)
- `GET /api/orders/guest/:orderId`
- `POST /api/auth/login`, `POST /api/auth/register`

Admin (require `Authorization: Bearer <admin token>`):
- `POST /api/auth/admin/login` — admin-only login
- `GET /api/admin/dashboard`
- `GET /api/admin/orders` (filters: `status`, `paymentStatus`, `search`, paging)
- `GET /api/admin/orders/:orderId`
- `GET /api/admin/messages` — all custom messages + order notes
- `PATCH /api/admin/orders/:orderId/status` / `/accept` / `/reject`
- `GET /api/products?active=all` — includes hidden products
- `GET /api/products/library` — lists the photos in `Pictures/`
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id` (hides)
- `POST /api/products/categories`


## File structure

```
chocoluxe/
├── index.html            # redesigned storefront
├── style.css             # storefront styles
├── script.js             # catalog, cart, personalisation, checkout, API calls
├── admin-login.html      # separate admin login
├── admin.html            # admin order manager UI
├── admin.css             # admin styles
├── admin.js              # admin logic (auth, orders, messages, products)
├── payment-status.html   # post-payment status page
├── server/
│   ├── index.js          # express app, rate limits, static serving
│   ├── db.js             # sqlite helpers
│   ├── init-db.js        # schema, migrations, categories + product seed
│   ├── middleware/auth.js# JWT + role middleware
│   └── routes/           # auth, orders, products, admin, payment, webhook
└── Pictures/             # product imagery
```

## Notes / gotchas

- `better-sqlite3` needs a version that supports your Node version (this project
  uses v13, which builds on Node 26). If you see a `C++20 required` build error,
  upgrade `better-sqlite3`.
- SQLite stores the DB at `server/chocoluxe.db`. Deleting it and re-running
  `npm run init-db` resets everything. Re-running it on an existing database is safe:
  it only adds what's missing and never duplicates products.
- Prices are validated against the `products` table when an order is created — the
  browser's numbers are ignored.
- For production: set `NODE_ENV=production`, use real Cashfree credentials and a
  strong `JWT_SECRET`, and serve behind HTTPS.

