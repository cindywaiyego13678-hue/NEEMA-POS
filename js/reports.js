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
    .select('*, staff(full_name), sale_items(quantity, unit_price)')
    .eq('status', 'completed')
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
  const transactions = sales.length;
  const revenue = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
  const itemsSold = sales.reduce((sum, s) =>
    sum + (s.sale_items || []).reduce((isum, item) => isum + (item.quantity || 1), 0), 0);
  const averageSale = transactions > 0 ? revenue / transactions : 0;

  document.getElementById('total-sales').textContent = transactions;
  document.getElementById('total-revenue').textContent = `KSh ${revenue.toLocaleString()}`;
  document.getElementById('items-sold').textContent = itemsSold;
  document.getElementById('average-sale').textContent = `KSh ${Math.round(averageSale).toLocaleString()}`;

  const tbody = document.getElementById('sales-table');
  if (!sales.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:20px;">No sales for this date.</td></tr>';
    return;
  }

  tbody.innerHTML = sales.map(s => {
    const receipt = s.mpesa_receipt || (s.payment_method === 'cash' ? 'CASH' : '—');
    const cashier = s.staff?.full_name || '—';
    const time = new Date(s.created_at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
    return `
      <tr>
        <td>${escapeHtmlReports(receipt)}</td>
        <td>${escapeHtmlReports(cashier)}</td>
        <td>KSh ${Number(s.total_amount).toLocaleString()}</td>
        <td>${escapeHtmlReports(s.payment_method)}</td>
        <td>${time}</td>
      </tr>`;
  }).join('');
}

function escapeHtmlReports(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
