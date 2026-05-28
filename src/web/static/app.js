// APP STATE
let state = {
    transactions: [],
    cards: [],
    selectedFile: null,
    charts: {
        category: null,
        merchant: null,
        timeline: null
    }
};

// CATEGORY COLORS FOR CHART.JS (matching CSS design tokens)
const CATEGORY_COLORS = {
    ecommerce: '#a78bfa',     // Purple
    food: '#f97316',          // Orange
    grocery: '#34d399',       // Light Emerald
    petrol: '#f59e0b',        // Amber
    travel: '#22d3ee',        // Cyan
    entertainment: '#f43f5e', // Rose
    utilities: '#3b82f6',     // Blue
    health: '#fb7185',        // Light Red
    shopping: '#ec4899',      // Pink
    other: '#94a3b8'          // Slate
};

// DOM ELEMENTS - FILTERS
const globalCardSelect = document.getElementById('global-card-select');
const globalMonthSelect = document.getElementById('global-month-select');
const btnAddCard = document.getElementById('btn-add-card');

// DOM ELEMENTS - UPLOAD
const uploadCardSelect = document.getElementById('upload-card-select');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const passwordInput = document.getElementById('password-input');
const btnTogglePassword = document.getElementById('toggle-password');
const btnAnalyze = document.getElementById('btn-analyze');
const btnSyncFolder = document.getElementById('btn-sync-folder');

// DOM ELEMENTS - KPIS
const kpiTotalSpend = document.getElementById('val-total-spend');
const kpiTotalCount = document.getElementById('val-total-count');
const kpiTopCategory = document.getElementById('val-top-category');
const kpiTopCategoryAmount = document.getElementById('val-top-category-amount');
const kpiTopMerchant = document.getElementById('val-top-merchant');
const kpiTopMerchantAmount = document.getElementById('val-top-merchant-amount');

// DOM ELEMENTS - LAYOUT SECTIONS
const sectionCharts = document.getElementById('dashboard-charts');
const sectionList = document.getElementById('dashboard-list');
const sectionPlaceholder = document.getElementById('no-data-placeholder');
const apiStatusEl = document.getElementById('api-status');

// DOM ELEMENTS - LIST FILTERS & TABLES
const searchMerchantInput = document.getElementById('search-merchant');
const filterCategorySelect = document.getElementById('filter-category');
const sortBySelect = document.getElementById('sort-by');
const transactionRows = document.getElementById('transaction-rows');
const filteredCountEl = document.getElementById('filtered-count');
const btnExportCSV = document.getElementById('btn-export-csv');
const btnExportJSON = document.getElementById('btn-export-json');

// DOM ELEMENTS - LOADING OVERLAY
const loadingOverlay = document.getElementById('loading-overlay');
const loadingStepText = document.getElementById('loading-step-text');
const loadingProgressBar = document.getElementById('loading-progress-bar');
const toastEl = document.getElementById('toast');

// DOM ELEMENTS - ADD CARD MODAL
const addCardModal = document.getElementById('add-card-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelCard = document.getElementById('btn-cancel-card');
const btnSaveCard = document.getElementById('btn-save-card');
const newCardNameInput = document.getElementById('new-card-name');

// INIT
window.addEventListener('DOMContentLoaded', async () => {
    await checkBackendStatus();
    await loadCards();
    await loadMonths();
    await fetchTransactions();
    
    setupUploadEventListeners();
    setupFilterEventListeners();
    setupActionEventListeners();
    setupModalEventListeners();
});

// CHECK BACKEND STATUS & API KEYS
async function checkBackendStatus() {
    try {
        const res = await fetch('/api/status');
        if (!res.ok) throw new Error("Server error");
        const data = await res.json();
        
        if (data.api_key_set) {
            apiStatusEl.className = 'status-pill status-active';
            apiStatusEl.querySelector('.status-text').textContent = 'OpenRouter Connected';
        } else {
            apiStatusEl.className = 'status-pill status-error';
            apiStatusEl.querySelector('.status-text').textContent = 'API Key Missing';
            showToast("Warning: OPENROUTER_API_KEY is not set in your .env file!", "error");
        }
    } catch (e) {
        apiStatusEl.className = 'status-pill status-error';
        apiStatusEl.querySelector('.status-text').textContent = 'Server Offline';
        showToast("Cannot connect to backend server. Make sure FastAPI is running.", "error");
    }
}

// FETCH CARDS
async function loadCards() {
    try {
        const res = await fetch('/api/cards');
        if (!res.ok) throw new Error("Failed to load cards.");
        state.cards = await res.json();
        
        // Save current selections
        const currentGlobalVal = globalCardSelect.value;
        const currentUploadVal = uploadCardSelect.value;

        // Reset Options
        globalCardSelect.innerHTML = '<option value="all">All Cards</option>';
        uploadCardSelect.innerHTML = '<option value="" disabled selected>Choose a card profile...</option>';

        state.cards.forEach(card => {
            const optGlobal = document.createElement('option');
            optGlobal.value = card.id;
            optGlobal.textContent = card.name;
            globalCardSelect.appendChild(optGlobal);

            const optUpload = document.createElement('option');
            optUpload.value = card.id;
            optUpload.textContent = card.name;
            uploadCardSelect.appendChild(optUpload);
        });

        // Restore selections if valid
        if (state.cards.some(c => c.id == currentGlobalVal)) {
            globalCardSelect.value = currentGlobalVal;
        }
        if (state.cards.some(c => c.id == currentUploadVal)) {
            uploadCardSelect.value = currentUploadVal;
        }
    } catch (err) {
        showToast(err.message, "error");
    }
}

// FETCH DISTINCT MONTHS
async function loadMonths() {
    try {
        const res = await fetch('/api/months');
        if (!res.ok) throw new Error("Failed to load distinct months.");
        const months = await res.json();
        
        const currentMonthVal = globalMonthSelect.value;
        globalMonthSelect.innerHTML = '<option value="all">All Months</option>';

        months.forEach(month => {
            const opt = document.createElement('option');
            opt.value = month;
            // Format YYYY-MM into readable month names (e.g. May 2026)
            const [year, monthNum] = month.split('-');
            const dateObj = new Date(year, parseInt(monthNum) - 1, 1);
            const label = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
            
            opt.textContent = label;
            globalMonthSelect.appendChild(opt);
        });

        if (months.includes(currentMonthVal)) {
            globalMonthSelect.value = currentMonthVal;
        }
    } catch (err) {
        showToast(err.message, "error");
    }
}

// FETCH TRANSACTIONS FROM DATABASE
async function fetchTransactions() {
    const cardId = globalCardSelect.value;
    const month = globalMonthSelect.value;

    try {
        const res = await fetch(`/api/transactions?card_id=${cardId}&month=${month}`);
        if (!res.ok) throw new Error("Failed to fetch transactions.");
        state.transactions = await res.json();
        renderDashboard();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// DRAG & DROP & FILE SELECTION
function setupUploadEventListeners() {
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files[0]);
        }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    // Password visibility toggle
    btnTogglePassword.addEventListener('click', () => {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        btnTogglePassword.classList.toggle('active');
    });

    // Analyze statement trigger
    btnAnalyze.addEventListener('click', () => {
        if (!uploadCardSelect.value) {
            showToast("Please select a credit card profile first.", "error");
            uploadCardSelect.focus();
            return;
        }
        if (state.selectedFile) {
            uploadAndProcessStatement();
        }
    });
}

function handleFileSelection(file) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
        showToast("Please select a PDF file.", "error");
        return;
    }
    state.selectedFile = file;
    dropZone.querySelector('.drop-title').textContent = file.name;
    dropZone.querySelector('.drop-subtitle').textContent = `Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    btnAnalyze.disabled = false;
    showToast(`Loaded: ${file.name}`, "success");
}

// UPLOAD API CALL WITH DATABASE STORAGE
async function uploadAndProcessStatement() {
    const cardId = uploadCardSelect.value;
    const formData = new FormData();
    formData.append('file', state.selectedFile);
    formData.append('card_id', cardId);
    
    const password = passwordInput.value.trim();
    if (password) {
        formData.append('password', password);
    }

    loadingOverlay.classList.add('active');
    
    updateLoadingProgress(10, "Uploading PDF statement to server...");
    let progressTimer = setTimeout(() => updateLoadingProgress(30, "Decrypting and converting PDF pages to images..."), 2000);
    let parsingTimer = setTimeout(() => updateLoadingProgress(60, "Running Gemini 3.5 Multimodal AI statement extraction..."), 6000);
    let finalizingTimer = setTimeout(() => updateLoadingProgress(85, "Saving parsed spends into SQLite database..."), 15000);

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        clearTimeout(progressTimer);
        clearTimeout(parsingTimer);
        clearTimeout(finalizingTimer);

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Error extracting transactions");
        }

        updateLoadingProgress(100, "Done!");
        const data = await response.json();
        
        // Refresh cards and months filters
        await loadMonths();
        
        // Switch global view to this card
        globalCardSelect.value = cardId;
        globalMonthSelect.value = 'all';
        
        // Fetch new data list
        await fetchTransactions();
        showToast(`Parsed and saved ${data.transactions.length} spends.`, "success");
        
    } catch (err) {
        showToast(err.message, "error");
        console.error(err);
    } finally {
        setTimeout(() => {
            loadingOverlay.classList.remove('active');
        }, 800);
    }
}

function updateLoadingProgress(percent, label) {
    loadingProgressBar.style.width = `${percent}%`;
    loadingStepText.textContent = label;
}

// RENDER DASHBOARD (KPIS, CHARTS, TABLE)
function renderDashboard() {
    if (state.transactions.length === 0) {
        sectionCharts.style.display = 'none';
        sectionList.style.display = 'none';
        sectionPlaceholder.style.display = 'flex';
        return;
    }

    sectionPlaceholder.style.display = 'none';
    sectionCharts.style.display = 'grid';
    sectionList.style.display = 'block';

    calculateKPIs();
    renderCharts();
    renderTransactionTable();
}

// CALCULATE STATS
function calculateKPIs() {
    const totalSpend = state.transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalCount = state.transactions.length;

    // Category aggregate
    const catAgg = {};
    const merchAgg = {};
    state.transactions.forEach(t => {
        catAgg[t.category] = (catAgg[t.category] || 0) + parseFloat(t.amount || 0);
        merchAgg[t.merchant] = (merchAgg[t.merchant] || 0) + parseFloat(t.amount || 0);
    });

    // Find top category
    let topCat = "N/A";
    let topCatVal = 0;
    Object.keys(catAgg).forEach(cat => {
        if (catAgg[cat] > topCatVal) {
            topCat = cat;
            topCatVal = catAgg[cat];
        }
    });

    // Find top merchant
    let topMerch = "N/A";
    let topMerchVal = 0;
    Object.keys(merchAgg).forEach(m => {
        if (merchAgg[m] > topMerchVal) {
            topMerch = m;
            topMerchVal = merchAgg[m];
        }
    });

    // Populate DOM
    kpiTotalSpend.textContent = formatCurrency(totalSpend);
    kpiTotalCount.textContent = totalCount;
    
    kpiTopCategory.textContent = topCat.charAt(0).toUpperCase() + topCat.slice(1);
    kpiTopCategoryAmount.textContent = formatCurrency(topCatVal);
    
    kpiTopMerchant.textContent = topMerch.length > 20 ? topMerch.slice(0, 18) + '...' : topMerch;
    kpiTopMerchantAmount.textContent = formatCurrency(topMerchVal);
}

// CHART RENDERINGS
function renderCharts() {
    // 1. Group spends by Category
    const catData = {};
    state.transactions.forEach(t => {
        catData[t.category] = (catData[t.category] || 0) + parseFloat(t.amount || 0);
    });

    const catLabels = Object.keys(catData);
    const catValues = Object.values(catData);
    const catColors = catLabels.map(cat => CATEGORY_COLORS[cat] || CATEGORY_COLORS.other);

    if (state.charts.category) state.charts.category.destroy();
    
    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    state.charts.category = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: catLabels.map(l => l.toUpperCase()),
            datasets: [{
                data: catValues,
                backgroundColor: catColors,
                borderWidth: 2,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: (item) => ` Rs. ${item.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    }
                }
            }
        }
    });

    // 2. Group spends by Merchant (Top 8)
    const merchData = {};
    state.transactions.forEach(t => {
        merchData[t.merchant] = (merchData[t.merchant] || 0) + parseFloat(t.amount || 0);
    });

    const sortedMerchants = Object.entries(merchData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    const merchLabels = sortedMerchants.map(m => m[0]);
    const merchValues = sortedMerchants.map(m => m[1]);

    if (state.charts.merchant) state.charts.merchant.destroy();

    const ctxMerch = document.getElementById('merchantChart').getContext('2d');
    state.charts.merchant = new Chart(ctxMerch, {
        type: 'bar',
        data: {
            labels: merchLabels,
            datasets: [{
                label: 'Spend Amount',
                data: merchValues,
                backgroundColor: 'rgba(99, 102, 241, 0.75)',
                hoverBackgroundColor: 'rgba(99, 102, 241, 1)',
                borderRadius: 6,
                borderWidth: 0
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => ` Rs. ${item.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                }
            }
        }
    });

    // 3. Timeline chart (Daily aggregate)
    const timeData = {};
    state.transactions.forEach(t => {
        timeData[t.date] = (timeData[t.date] || 0) + parseFloat(t.amount || 0);
    });

    const sortedDates = Object.keys(timeData).sort();
    const timeValues = sortedDates.map(date => timeData[date]);

    if (state.charts.timeline) state.charts.timeline.destroy();

    const ctxTime = document.getElementById('timelineChart').getContext('2d');
    const gradient = ctxTime.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.35)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.00)');

    state.charts.timeline = new Chart(ctxTime, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [{
                label: 'Daily Spends',
                data: timeValues,
                borderColor: '#6366f1',
                borderWidth: 3,
                pointBackgroundColor: '#ec4899',
                pointBorderColor: '#fff',
                pointHoverRadius: 7,
                pointRadius: 4,
                fill: true,
                backgroundColor: gradient,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => ` Rs. ${item.raw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                }
            }
        }
    });
}

// FILTER & SORT LISTENERS
function setupFilterEventListeners() {
    globalCardSelect.addEventListener('change', fetchTransactions);
    globalMonthSelect.addEventListener('change', fetchTransactions);
    
    searchMerchantInput.addEventListener('input', renderTransactionTable);
    filterCategorySelect.addEventListener('change', renderTransactionTable);
    sortBySelect.addEventListener('change', renderTransactionTable);
}

// TRANSACTION LOG RENDER
function renderTransactionTable() {
    const query = searchMerchantInput.value.toLowerCase().trim();
    const catFilter = filterCategorySelect.value;
    const sortBy = sortBySelect.value;

    let filtered = state.transactions.filter(t => {
        const matchesMerchant = t.merchant.toLowerCase().includes(query);
        const matchesCategory = catFilter === 'all' || t.category === catFilter;
        return matchesMerchant && matchesCategory;
    });

    filtered.sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.date) - new Date(a.date);
        if (sortBy === 'date-asc') return new Date(a.date) - new Date(b.date);
        if (sortBy === 'amount-desc') return parseFloat(b.amount) - parseFloat(a.amount);
        if (sortBy === 'amount-asc') return parseFloat(a.amount) - parseFloat(b.amount);
        return 0;
    });

    filteredCountEl.textContent = `${filtered.length} of ${state.transactions.length} items`;
    transactionRows.innerHTML = '';

    if (filtered.length === 0) {
        transactionRows.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
                    No matching transactions found.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${t.date}</td>
            <td>
                <input type="text" class="merchant-edit-input" value="${escapeHtml(t.merchant)}" 
                       data-id="${t.id}">
            </td>
            <td class="td-amount">Rs. ${parseFloat(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>
                <select class="cat-tag-select cat-tag-${t.category}" data-id="${t.id}">
                    <option value="ecommerce" ${t.category === 'ecommerce' ? 'selected' : ''}>Ecommerce</option>
                    <option value="food" ${t.category === 'food' ? 'selected' : ''}>Food</option>
                    <option value="grocery" ${t.category === 'grocery' ? 'selected' : ''}>Grocery</option>
                    <option value="petrol" ${t.category === 'petrol' ? 'selected' : ''}>Petrol</option>
                    <option value="travel" ${t.category === 'travel' ? 'selected' : ''}>Travel</option>
                    <option value="entertainment" ${t.category === 'entertainment' ? 'selected' : ''}>Entertainment</option>
                    <option value="utilities" ${t.category === 'utilities' ? 'selected' : ''}>Utilities</option>
                    <option value="health" ${t.category === 'health' ? 'selected' : ''}>Health</option>
                    <option value="shopping" ${t.category === 'shopping' ? 'selected' : ''}>Shopping</option>
                    <option value="other" ${t.category === 'other' ? 'selected' : ''}>Other</option>
                </select>
            </td>
            <td>
                <button class="btn-icon btn-delete" data-id="${t.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                </button>
            </td>
        `;

        // Bind interactive inline edits with database PUT request
        const inputMerchant = tr.querySelector('.merchant-edit-input');
        inputMerchant.addEventListener('blur', async (e) => {
            const val = e.target.value.trim();
            const txId = parseInt(e.target.dataset.id);
            if (val) {
                // Find matching tx in state and save
                const txObj = state.transactions.find(item => item.id == txId);
                if (txObj && txObj.merchant !== val) {
                    txObj.merchant = val;
                    await updateTransactionInDB(txId, val, null);
                }
            }
        });

        // Category Tag dropdown edit persistence
        const selectCategory = tr.querySelector('.cat-tag-select');
        selectCategory.addEventListener('change', async (e) => {
            const val = e.target.value;
            const txId = parseInt(e.target.dataset.id);
            
            // Instantly visually match category style
            selectCategory.className = `cat-tag-select cat-tag-${val}`;
            
            const txObj = state.transactions.find(item => item.id == txId);
            if (txObj) {
                txObj.category = val;
                await updateTransactionInDB(txId, null, val);
            }
        });

        // Row delete click
        const btnDel = tr.querySelector('.btn-delete');
        btnDel.addEventListener('click', async (e) => {
            const txId = parseInt(e.currentTarget.dataset.id);
            await deleteTransactionFromDB(txId);
        });

        transactionRows.appendChild(tr);
    });
}

// PERSIST EDIT IN DATABASE
async function updateTransactionInDB(id, merchant, category) {
    try {
        const body = {};
        if (merchant !== null) body.merchant = merchant;
        if (category !== null) body.category = category;

        const res = await fetch(`/api/transactions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error("Failed to save changes.");
        
        calculateKPIs();
        renderCharts();
        showToast("Transaction updated successfully", "success");
    } catch (e) {
        showToast(e.message, "error");
        // Reload transactions to undo UI mismatch
        await fetchTransactions();
    }
}

// DELETE FROM DATABASE
async function deleteTransactionFromDB(id) {
    try {
        const res = await fetch(`/api/transactions/${id}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error("Failed to delete transaction.");
        
        // Remove locally from state
        state.transactions = state.transactions.filter(item => item.id !== id);
        
        await loadMonths(); // Re-read month filter in case this was the last tx for a month
        renderDashboard();
        showToast("Transaction deleted successfully", "success");
    } catch (e) {
        showToast(e.message, "error");
    }
}

// EXPORTS
function setupActionEventListeners() {
    btnExportCSV.addEventListener('click', () => {
        if (state.transactions.length === 0) return;
        exportToCSV();
    });

    btnExportJSON.addEventListener('click', () => {
        if (state.transactions.length === 0) return;
        exportToJSON();
    });
    
    btnSyncFolder.addEventListener('click', triggerFolderSync);
}

function exportToCSV() {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Date,Merchant,Amount,Category,Source File\n";
    
    state.transactions.forEach(t => {
        const m = t.merchant.includes(',') ? `"${t.merchant}"` : t.merchant;
        const src = t.source_file ? (t.source_file.includes(',') ? `"${t.source_file}"` : t.source_file) : '';
        csvContent += `${t.date},${m},${t.amount},${t.category},${src}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Spend_Analysis_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloaded CSV report successfully", "success");
}

function exportToJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.transactions, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `Spend_Analysis_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Downloaded JSON report successfully", "success");
}

async function triggerFolderSync() {
    try {
        btnSyncFolder.disabled = true;
        loadingOverlay.classList.add('active');
        updateLoadingProgress(30, "Scanning ~/Downloads/cc_statements for new files...");
        
        const res = await fetch('/api/sync', { method: 'POST' });
        if (!res.ok) throw new Error("Sync failed.");
        const data = await res.json();
        
        updateLoadingProgress(80, "Refreshing transaction lists...");
        await loadCards();
        await loadMonths();
        await fetchTransactions();
        
        if (data.processed_files > 0) {
            showToast(`Sync complete! Processed ${data.processed_files} new files, imported ${data.new_transactions} spends.`, "success");
        } else {
            showToast("Sync complete. No new statement files found.", "success");
        }
    } catch (e) {
        showToast("Sync failed: " + e.message, "error");
    } finally {
        btnSyncFolder.disabled = false;
        setTimeout(() => {
            loadingOverlay.classList.remove('active');
        }, 500);
    }
}

// MODAL CONTROLLER
function setupModalEventListeners() {
    btnAddCard.addEventListener('click', () => {
        newCardNameInput.value = '';
        addCardModal.classList.add('active');
        newCardNameInput.focus();
    });
    
    const closeModal = () => addCardModal.classList.remove('active');
    
    btnCloseModal.addEventListener('click', closeModal);
    btnCancelCard.addEventListener('click', closeModal);
    
    btnSaveCard.addEventListener('click', createCardProfile);
    newCardNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createCardProfile();
    });
}

async function createCardProfile() {
    const name = newCardNameInput.value.trim();
    if (!name) {
        showToast("Card profile name cannot be blank.", "error");
        return;
    }
    
    try {
        const res = await fetch('/api/cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (!res.ok) throw new Error("Card profile already exists or failed to save.");
        const card = await res.json();
        
        showToast(`Card profile "${card.name}" created!`, "success");
        addCardModal.classList.remove('active');
        
        await loadCards();
        
        // Auto-select this card
        globalCardSelect.value = card.id;
        uploadCardSelect.value = card.id;
        
        await fetchTransactions();
    } catch (e) {
        showToast(e.message, "error");
    }
}

// UTILS
function showToast(message, type = "success") {
    toastEl.textContent = message;
    toastEl.className = `toast toast-${type} active`;
    
    setTimeout(() => {
        toastEl.classList.remove('active');
    }, 3500);
}

function formatCurrency(amount) {
    return 'Rs. ' + parseFloat(amount).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
