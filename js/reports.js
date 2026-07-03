// ============================================================
// Reports page logic — daily sales report generation
// ============================================================
let currentStaffReports = null;

(async () => {
  currentStaffReports = await requireAuth(['admin']);
  if (!currentStaffReports) return;
  document.getElementById('staff-name').textContent = `${currentStaffReports.full_name} (${currentStaffReports.role})`;

  // Default the date picker to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  document.getElementById('report-date').value = `${yyyy}-${mm}-${dd}`;

  await loadDailyReport();
})();

async function loadDailyReport() {
  const dateInput = document.getElementById('report-date').value;
  if (!dateInput) { alert('Please select a date.'); return; }

  const dayStart = new Date(dateInput + 'T00:00:00');
  const dayEnd = new Date(dateInput + 'T23:59:59.999');

  const { data: sales, error } = await supabaseClient
    .from('sales')
    .select('*, staff(full_name), sale_items(product_id, quantity, unit_price)')
    .in('status', ['completed', 'refunded'])
    .gte('created_at', dayStart.toISOString())
    .lte('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    alert('Error loading report: ' + error.message);
    return;
  }

  renderReport(sales || []);
}

function renderReport(sales) {
  const completedSales = sales.filter(s => s.status === 'completed');
  const transactions = completedSales.length;
  const revenue = completedSales.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const itemsSold = completedSales.reduce((sum, s) =>
    sum + (s.sale_items || []).reduce((isum, item) => isum + (item.quantity || 1), 0), 0);
  const averageSale = transactions > 0 ? revenue / transactions : 0;

  document.getElementById('total-sales').textContent = transactions;
  document.getElementById('total-revenue').textContent = `KSh ${revenue.toLocaleString()}`;
  document.getElementById('items-sold').textContent = itemsSold;
  document.getElementById('average-sale').textContent = `KSh ${Math.round(averageSale).toLocaleString()}`;

  const tbody = document.getElementById('sales-table');
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">No sales for this date.</td></tr>';
    return;
  }

  tbody.innerHTML = sales.map(s => {
    const receipt = s.mpesa_receipt || (s.payment_method === 'cash' ? 'CASH' : '—');
    const cashier = s.staff?.full_name || '—';
    const time = new Date(s.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    const isRefunded = s.status === 'refunded';
    return `
      <tr style="${isRefunded ? 'opacity:0.6;' : ''}">
        <td>${escapeHtmlReports(receipt)}</td>
        <td>${escapeHtmlReports(cashier)}</td>
        <td>KSh ${Number(s.total_amount).toLocaleString()}</td>
        <td>${escapeHtmlReports(s.payment_method)}</td>
        <td>${time}</td>
        <td>
          ${isRefunded
            ? '<span class="badge low">refunded</span>'
            : `<button class="danger" style="padding:4px 8px; font-size:0.75rem;" onclick='processRefund(${JSON.stringify(s.id)})'>Refund</button>`}
        </td>
      </tr>`;
  }).join('');
}

async function processRefund(saleId) {
  const reason = prompt('Reason for refund (optional):', '');
  if (reason === null) return;
  if (!confirm('Refund this sale and restock the items? This cannot be undone.')) return;

  const { data: sale, error: fetchError } = await supabaseClient
    .from('sales').select('*, sale_items(product_id, quantity)').eq('id', saleId).single();
  if (fetchError || !sale) { alert('Error loading sale: ' + (fetchError?.message || 'not found')); return; }

  // Restock each item
  for (const item of sale.sale_items || []) {
    const { data: product } = await supabaseClient
      .from('products').select('stock_quantity').eq('id', item.product_id).single();
    if (product) {
      await supabaseClient.from('products')
        .update({ stock_quantity: product.stock_quantity + item.quantity })
        .eq('id', item.product_id);
    }
  }

  const { error: updateError } = await supabaseClient
    .from('sales')
    .update({ status: 'refunded', refunded_at: new Date().toISOString(), refund_reason: reason || null })
    .eq('id', saleId);

  if (updateError) { alert('Error processing refund: ' + updateError.message); return; }

  alert('Refund processed and stock restored.');
  await loadDailyReport();
}

function escapeHtmlReports(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
