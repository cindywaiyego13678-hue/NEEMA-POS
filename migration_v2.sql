-- ============================================================
-- Migration: photos, admin-only transaction visibility, date tracking
-- Run this in Supabase SQL Editor
-- ============================================================

-- Product photos
alter table products add column if not exists photo_url text;

-- created_at already tracks "date added" for products and "date/time" for sales —
-- no new column needed there, we just surface it in the UI now.

-- ---------- Restrict full transaction visibility to ADMIN ONLY ----------
-- Managers can still process sales (insert) but can no longer browse
-- the full sales history / other people's transaction details.
drop policy if exists "sales_select_own_or_admin" on sales;
create policy "sales_select_admin_only" on sales for select using (
  cashier_id = auth.uid() or current_role_name() = 'admin'
);

drop policy if exists "sale_items_select" on sale_items;
create policy "sale_items_select_admin_only" on sale_items for select using (
  exists (
    select 1 from sales s
    where s.id = sale_id and (s.cashier_id = auth.uid() or current_role_name() = 'admin')
  )
);

-- ---------- M-Pesa STK Push tracking ----------
alter table sales add column if not exists mpesa_checkout_request_id text;

-- Run this part, then also create the bucket manually in
-- Supabase Dashboard -> Storage -> New bucket -> name: "product-photos" -> Public bucket: ON
-- (Bucket creation itself must be done in the dashboard UI, not SQL)

-- Storage policies (run AFTER creating the bucket above):
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

create policy "product_photos_public_read"
on storage.objects for select
using ( bucket_id = 'product-photos' );

create policy "product_photos_staff_upload"
on storage.objects for insert
with check ( bucket_id = 'product-photos' and auth.uid() is not null );

create policy "product_photos_staff_delete"
on storage.objects for delete
using ( bucket_id = 'product-photos' and auth.uid() is not null );
