-- ============================================================
-- Migration: switch from per-serial-number stock tracking
-- to a simple stock quantity per product.
-- Run this in Supabase SQL Editor.
-- ============================================================

alter table products
  add column if not exists stock_quantity integer not null default 0;

-- category column already exists and will now be used as "Type"
-- (no rename needed, just used differently in the app)

-- Note: the old product_units / warranty_claims tables are left in place
-- and untouched, in case you want per-serial tracking again later.
-- The app no longer reads from them for stock counts.
