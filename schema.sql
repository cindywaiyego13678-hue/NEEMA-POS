-- ============================================================
-- Home Appliances Shop POS - Supabase Schema
-- ============================================================

-- ---------- STAFF / ROLES ----------
create table if not exists staff (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin','manager','cashier')),
  phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- PRODUCTS (catalog / model level) ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  category text,               -- e.g. Fridges, TVs, Microwaves, Blenders
  price numeric(12,2) not null,
  cost numeric(12,2) default 0,
  reorder_level int default 2,
  warranty_months int default 12,
  photo_url text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- PRODUCT UNITS (physical item / serial level) ----------
create table if not exists product_units (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  serial_number text unique not null,
  status text not null default 'in_stock'
    check (status in ('in_stock','sold','returned','warranty_claim','damaged')),
  warranty_start date,
  warranty_end date,
  received_at timestamptz default now(),
  notes text
);

create index if not exists idx_units_product on product_units(product_id);
create index if not exists idx_units_status on product_units(status);

-- ---------- SALES ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid references staff(id),
  customer_name text,
  customer_phone text,
  payment_method text check (payment_method in ('mpesa','cash','card')),
  mpesa_receipt text,
  total_amount numeric(12,2) not null,
  status text default 'completed' check (status in ('completed','refunded','void')),
  synced boolean default true,      -- false when created offline then synced
  created_at timestamptz default now()
);

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references sales(id) on delete cascade,
  product_id uuid references products(id),
  unit_id uuid references product_units(id),  -- specific serial sold
  unit_price numeric(12,2) not null,
  quantity int default 1
);

-- ---------- WARRANTY CLAIMS ----------
create table if not exists warranty_claims (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references product_units(id),
  reported_by text,
  issue_description text,
  status text default 'open' check (status in ('open','in_progress','resolved','rejected')),
  resolution_notes text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table staff enable row level security;
alter table products enable row level security;
alter table product_units enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;
alter table warranty_claims enable row level security;

-- Helper: get current user's role
create or replace function current_role_name() returns text as $$
  select role from staff where id = auth.uid();
$$ language sql stable security definer;

-- Staff: everyone logged in can read staff list (for cashier names etc), only admin can modify
create policy "staff_select" on staff for select using (auth.uid() is not null);
create policy "staff_admin_write" on staff for all using (current_role_name() = 'admin');

-- Products: all logged-in staff can read; admin & manager can write
create policy "products_select" on products for select using (auth.uid() is not null);
create policy "products_write" on products for insert with check (current_role_name() in ('admin','manager'));
create policy "products_update" on products for update using (current_role_name() in ('admin','manager'));
create policy "products_delete" on products for delete using (current_role_name() = 'admin');

-- Product units: all staff read; admin & manager write; cashier can update status on sale (handled via app logic/service role or a narrower policy)
create policy "units_select" on product_units for select using (auth.uid() is not null);
create policy "units_write" on product_units for insert with check (current_role_name() in ('admin','manager'));
create policy "units_update" on product_units for update using (auth.uid() is not null);
create policy "units_delete" on product_units for delete using (current_role_name() = 'admin');

-- Sales: all staff can insert; cashier can see own sales, manager/admin see all
create policy "sales_select_own_or_admin" on sales for select using (
  cashier_id = auth.uid() or current_role_name() in ('admin','manager')
);
create policy "sales_insert" on sales for insert with check (auth.uid() is not null);
create policy "sales_update_admin" on sales for update using (current_role_name() in ('admin','manager'));

-- Sale items follow sales visibility
create policy "sale_items_select" on sale_items for select using (
  exists (select 1 from sales s where s.id = sale_id and (s.cashier_id = auth.uid() or current_role_name() in ('admin','manager')))
);
create policy "sale_items_insert" on sale_items for insert with check (auth.uid() is not null);

-- Warranty claims: all staff read/write, admin can update status
create policy "claims_select" on warranty_claims for select using (auth.uid() is not null);
create policy "claims_insert" on warranty_claims for insert with check (auth.uid() is not null);
create policy "claims_update" on warranty_claims for update using (current_role_name() in ('admin','manager'));

-- ============================================================
-- USEFUL VIEWS for dashboard
-- ============================================================
create or replace view v_daily_sales as
select
  date_trunc('day', created_at) as day,
  count(*) as num_sales,
  sum(total_amount) as revenue
from sales
where status = 'completed'
group by 1
order by 1 desc;

create or replace view v_low_stock as
select p.id, p.name, p.category, p.reorder_level,
  count(u.id) filter (where u.status = 'in_stock') as in_stock_count
from products p
left join product_units u on u.product_id = p.id
group by p.id, p.name, p.category, p.reorder_level
having count(u.id) filter (where u.status = 'in_stock') <= p.reorder_level;
