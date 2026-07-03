let currentStaff = null;

(async () => {
    currentStaff = await requireAuth(['admin']);

    if (!currentStaff) return;

    document.getElementById('staff-name').textContent =
        `${currentStaff.full_name} (Owner)`;

    // Default to today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('report-date').value = today;

    // Load report immediately for today
    loadDailyReport();
})();

// Make sure this is global so HTML onclick can find it
window.loadDailyReport = async function() {
    const selectedDate = document.getElementById("report-date").value;

    // Fetch sales data from backend API
    try {
        const response = await fetch(`/api/reports?date=${selectedDate}`);
        const data = await response.json();

        // Update summary boxes
        document.getElementById("transactions").textContent = data.transactions;
        document.getElementById("revenue").textContent = `KSh ${data.revenue}`;
        document.getElementById("items-sold").textContent = data.items_sold;
        document.getElementById("average-sale").textContent = `KSh ${data.average_sale}`;

        // Populate sales list table
        const tableBody = document.getElementById("sales-list");
        tableBody.innerHTML = ""; // clear old rows

        data.sales.forEach(sale => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${sale.receipt}</td>
                <td>${sale.cashier}</td>
                <td>KSh ${sale.amount}</td>
                <td>${sale.payment}</td>
                <td>${sale.time}</td>
            `;
            tableBody.appendChild(row);
        });

    } catch (err) {
        console.error("Error loading report:", err);
        alert("Failed to load report. Check API or server logs.");
    }
};

