// ============================================================
// Offline-first sync: queues sales in IndexedDB when offline,
// pushes to Supabase when connection returns.
// ============================================================
const DB_NAME = 'appliance_pos_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_sales';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'localId', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function queueSaleOffline(saleData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add({ ...saleData, queuedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getPendingSales() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function removePendingSale(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(localId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

// Attempts to push any queued offline sales to Supabase.
// Call this on page load and whenever the browser comes back online.
async function syncPendingSales() {
  if (!navigator.onLine) return;
  const pending = await getPendingSales();
  if (!pending.length) return;

  for (const sale of pending) {
    try {
      const { localId, queuedAt, items, ...saleFields } = sale;

      const { data: insertedSale, error: saleError } = await supabaseClient
        .from('sales')
        .insert(saleFields)
        .select()
        .single();

      if (saleError) throw saleError;

      const itemsToInsert = items.map(it => ({ ...it, sale_id: insertedSale.id }));
      const { error: itemsError } = await supabaseClient.from('sale_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Decrement stock quantity for each item sold
      for (const it of items) {
        const { data: product } = await supabaseClient
          .from('products').select('stock_quantity').eq('id', it.product_id).single();
        if (product) {
          const newQty = Math.max(0, product.stock_quantity - it.quantity);
          await supabaseClient.from('products').update({ stock_quantity: newQty }).eq('id', it.product_id);
        }
      }

      await removePendingSale(localId);
      console.log('Synced offline sale', localId);
    } catch (err) {
      console.error('Failed to sync sale, will retry later', err);
      break;
    }
  }

  const remaining = await getPendingSales();
  updateSyncBadge(remaining.length);
}

function updateSyncBadge(count) {
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = `${count} sale${count > 1 ? 's' : ''} waiting to sync`;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

window.addEventListener('online', syncPendingSales);
document.addEventListener('DOMContentLoaded', async () => {
  const pending = await getPendingSales();
  updateSyncBadge(pending.length);
  syncPendingSales();
});
