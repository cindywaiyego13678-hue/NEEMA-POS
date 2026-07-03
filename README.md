# Home Appliances Shop POS

A lightweight, offline-capable point-of-sale system for a home appliances shop, with a mobile-friendly owner dashboard for remote management.

## Features
- **POS screen** — cashiers sell products by serial number, with offline queueing (IndexedDB) if the internet drops
- **Serial number + warranty tracking** — every physical unit has its own serial and warranty window
- **Owner Dashboard** — mobile-first live view: today's/week's revenue, recent sales, low stock alerts, open warranty claims, top sellers — works from any phone, anywhere
- **Role-based access** — Admin (owner), Manager, Cashier via Supabase RLS
- **Inventory management** — add products and bulk-add serial numbers per product

## Setup

### 1. Supabase
1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor, paste the contents of `schema.sql`, and run it
3. Go to Authentication > Providers, make sure Email is enabled
4. Create your first user: Authentication > Users > Add User (use the owner's email)
5. Then in SQL Editor, add that user to the `staff` table as admin:
   ```sql
   insert into staff (id, full_name, role)
   values ('PASTE_USER_UUID_HERE', 'Owner Name', 'admin');
   ```
   (Find the UUID in Authentication > Users)
6. Go to Settings > API, copy your **Project URL** and **anon public key**

### 2. Configure the app
Open `js/supabase-config.js` and replace:
```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```
with your actual values.

### 3. Deploy to Netlify
- Drag-and-drop the whole `appliance-pos` folder into Netlify, or connect via GitHub
- No build step needed — it's static HTML/JS

### 4. Add staff
As admin, insert manager/cashier accounts the same way as step 5 above (create user in Supabase Auth, then insert into `staff` table with role `manager` or `cashier`).

### 5. Add products & stock
Log in as admin or manager → Inventory tab → add a product → click "Manage Units" → paste in serial numbers (one per line). Warranty dates are auto-calculated from the product's warranty period.

## Offline capabilities (true offline app)

- **App loads with zero internet** after the first visit — a service worker caches the app shell (all pages, styles, scripts)
- **Already-logged-in users stay logged in offline** — session and staff role are cached locally
- **POS**: product list is cached for offline viewing; sales made offline are queued and sync automatically once back online
- **Inventory**: product list is cached for offline *viewing*; adding new products or adjusting stock still requires a connection (not queued offline)
- **Dashboard & Staff pages**: require a connection every time (live data only)

To install as an app icon on a phone: open the site in Chrome/Safari → menu → "Add to Home Screen" / "Install app".


- M-Pesa Daraja STK Push (payment_method is already tracked; needs a serverless function to call Daraja API and update `mpesa_receipt`)
- Installment/layaway payments
- Printable receipts
- Push notifications to owner's phone for big sales or low stock (could use Supabase Realtime + a notification service)

## File structure
```
appliance-pos/
├── index.html          # Login
├── pos.html            # Cashier POS screen
├── dashboard.html       # Owner mobile dashboard (admin only)
├── inventory.html       # Product & serial number management
├── schema.sql            # Supabase database schema + RLS
├── css/style.css
└── js/
    ├── supabase-config.js
    └── offline-sync.js
```
