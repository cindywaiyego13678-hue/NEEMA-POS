let currentStaff = null;

(async () => {
    currentStaff = await requireAuth(['admin']);

    if (!currentStaff) return;

    document.getElementById('staff-name').textContent =
        `${currentStaff.full_name} (Owner)`;

    // Default to today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('report-date').value = today;

    loadDailyReport();
})();
