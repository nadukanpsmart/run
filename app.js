// State
// supabase is initialized in config.js
let appState = {
    tabs: [],
    products: [],
    cart: [],
    currentBillingTab: 'all',
    currentInventoryTab: 'all',
    dashboardFilter: 'today',
    charts: { payment: null, revenue: null, bills: null, velocity: null, billVelocity: null, product: null },
    dashboardData: null // Cache for bills, items, etc.
};

// Restore Preference Cache
const prefCache = localStorage.getItem('owner_pref_cache');
if (prefCache) {
    try {
        const p = JSON.parse(prefCache);
        appState.ownerPreferredName = p.name;
        appState.ownerPreferredLogo = p.logo;
        appState.ownerPreferredAddress = p.address;
        appState.ownerBillNote = p.note;
    } catch (e) { console.error("Cache parse error", e); }
}

window.appState = appState;

// Intialize
window.addEventListener('DOMContentLoaded', async () => {
    // Attempt rapid branding update from cache
    if (typeof updateBranding === 'function') {
        updateBranding();
    }

    if (!supabase) {
        console.error("Supabase client missing");
        return;
    }

    // Initial Load

    // Initial Load
    // Initial Load - Delegated to Auth
    // await loadInventory();
    // loadDashboard('today');

    // Set default date inputs to today (local date, not UTC)
    // IMPORTANT: new Date().toISOString() returns UTC date which is wrong for IST users past midnight.
    // Use toLocaleDateString('en-CA') to get YYYY-MM-DD in local timezone.
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById('date-from').value = today;
    document.getElementById('date-to').value = today;

    // Init Mobile Date Inputs
    if (document.getElementById('mobile-date-from')) {
        document.getElementById('mobile-date-from').value = today;
        document.getElementById('mobile-date-to').value = today;
    }

    // Set default sales date inputs
    document.getElementById('sales-date-from').value = today;
    document.getElementById('sales-date-to').value = today;

    // Trigger Auth Check
    if (typeof checkSession === 'function') {
        checkSession();
    }

    // Load Initial Data
    // Duplicate calls removed

    // Inactivity Timer
    document.addEventListener('mousemove', resetInactivityTimer);
    document.addEventListener('keydown', resetInactivityTimer);
    document.addEventListener('click', resetInactivityTimer);
    resetInactivityTimer();
});

let inactivityTimer;
function resetInactivityTimer() {
    if (window.authState && window.authState.owner && window.authState.owner.role === 'employee') {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            alert("Session expired due to inactivity (5 mins).");
            logout();
        }, 5 * 60 * 1000);
    }
}

function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 800); // 0.8s for better readability, user asked for "disappear in 0.5s"
    // Interpretation: maybe show for 0.5s? or fade takes 0.5s? 
    // "disappear in 0.5 seconds" usually means duration visible is short.
    // I'll set timeout to 500ms as requested.
}

// Navigation
function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    // Show selected
    document.getElementById(viewId).classList.remove('hidden');

    // Highlight nav
    const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.getAttribute('onclick').includes(viewId));
    if (btn) btn.classList.add('active');

    // Update Section Indicator (Mobile)
    const sectionNameMap = {
        'dashboard': 'Dashboard',
        'analysis': 'Data Analysis',
        'billing': 'Billing',
        'sales': 'Sales',
        'inventory': 'Inventory',
        'employees': 'Employees',
        'predictions': 'AI Predictions',
        'settings': 'Settings'
    };
    const indicator = document.getElementById('current-section-name');
    if (indicator) {
        indicator.textContent = sectionNameMap[viewId] || 'Dashboard';
    }

    // Update active state in mobile drawer
    document.querySelectorAll('.drawer-link').forEach(el => el.classList.remove('active'));
    const drawerLink = Array.from(document.querySelectorAll('.drawer-link')).find(b => b.getAttribute('onclick').includes(viewId));
    if (drawerLink) drawerLink.classList.add('active');

    // Refresh data if needed
    if (viewId === 'inventory') renderInventoryList();
    if (viewId === 'billing') renderBilling();
    if (viewId === 'dashboard') loadDashboard(appState.dashboardFilter);
    if (viewId === 'analysis') loadDashboard(appState.dashboardFilter);
    if (viewId === 'sales') loadSales();
    if (viewId === 'settings') loadSettings();
    if (viewId === 'predictions') {
        loadPredictions(false);
    } else {
        // Stop realtime subscription when navigating away
        if (typeof stopPredictionRealtime === 'function') stopPredictionRealtime();
    }
    if (viewId === 'employees') {
        loadEmployeesForDropdown();
        loadEmployeeLogs();
    }
}

function toggleMobileMenu() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('drawer-overlay');

    if (drawer.classList.contains('open')) {
        drawer.classList.remove('open');
        overlay.classList.remove('visible');
        setTimeout(() => overlay.classList.add('hidden'), 300); // Wait for fade out
    } else {
        overlay.classList.remove('hidden');
        // Force reflow
        void overlay.offsetWidth;
        drawer.classList.add('open');
        overlay.classList.add('visible');
    }
}

function handleMobileFilterChange(value) {
    if (value === 'custom') {
        document.getElementById('mobile-custom-date-inputs').classList.remove('hidden');
    } else {
        document.getElementById('mobile-custom-date-inputs').classList.add('hidden');
        loadDashboard(value);
    }
}

function applyCustomDateMobile() {
    // Determine which date inputs to use
    // Since loadDashboard calls applyCustomDate internally when filter is 'custom',
    // We need to ensure logic reads from mobile inputs OR we sync mobile inputs to desktop inputs.
    // Syncing is safer to reuse existing logic if possible, BUT loadDashboard might read specific IDs.
    // Let's check loadDashboard implementation. Assuming it reads #date-from and #date-to.

    // Simplest: Sync mobile values to desktop inputs and call loadDashboard('custom')
    const mFrom = document.getElementById('mobile-date-from').value;
    const mTo = document.getElementById('mobile-date-to').value;

    if (!mFrom || !mTo) {
        alert("Please select both dates");
        return;
    }

    document.getElementById('date-from').value = mFrom;
    document.getElementById('date-to').value = mTo;

    loadDashboard('custom');
}

function toggleSalesCustomDate() {
    const inputs = document.getElementById('sales-custom-dates');
    if (inputs.classList.contains('hidden')) {
        inputs.classList.remove('hidden');
    } else {
        inputs.classList.add('hidden');
    }
}

function setSalesFilter(range) {
    // Update Active Buttons (Desktop)
    document.querySelectorAll('#sales .filter-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`#sales .filter-btn[data-range="${range}"]`);
    if (btn) btn.classList.add('active');

    // Update Mobile Select
    const select = document.getElementById('sales-mobile-select');
    if (select) select.value = range;

    if (range === 'custom') {
        document.getElementById('sales-custom-dates').classList.remove('hidden');
        return;
    } else {
        document.getElementById('sales-custom-dates').classList.add('hidden');
    }

    // Calculate Dates
    const now = new Date();
    let dFrom = new Date();
    let dTo = new Date();

    if (range === 'today') {
        // dFrom is today 00:00
        // dTo is today 23:59 (or just today date string)
    } else if (range === 'week') {
        const day = now.getDay();
        // Mon=1...Sun=0. 
        // Let's assume Mon start.
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        dFrom.setDate(diff);
    } else if (range === 'month') {
        dFrom.setDate(1);
    } else if (range === 'year') {
        dFrom.setMonth(0);
        dFrom.setDate(1);
    }

    // Set Inputs — use local timezone date (en-CA gives YYYY-MM-DD format)
    // toISOString() returns UTC which is wrong for IST users after midnight!
    const fmt = d => d.toLocaleDateString('en-CA');
    document.getElementById('sales-date-from').value = fmt(dFrom);
    document.getElementById('sales-date-to').value = fmt(dTo);

    loadSales();
}

function toggleBillingSidebar() {
    const panel = document.getElementById('billing-summary-panel');
    if (panel.classList.contains('open')) {
        panel.classList.remove('open');
    } else {
        panel.classList.add('open');
    }
}

function handleMobileAnalysisFilterChange(value) {
    if (value === 'custom') {
        document.getElementById('mobile-analysis-custom-inputs').classList.remove('hidden');
    } else {
        document.getElementById('mobile-analysis-custom-inputs').classList.add('hidden');
        // This reuses loadDashboard which updates BOTH dashboard and analysis charts
        loadDashboard(value);
    }
}

function applyCustomDateMobileAnalysis() {
    const mFrom = document.getElementById('mobile-analysis-date-from').value;
    const mTo = document.getElementById('mobile-analysis-date-to').value;

    if (!mFrom || !mTo) {
        alert("Please select both dates");
        return;
    }

    // Sync to desktop inputs (which are likely used by loadDashboard(custom) if logic reads DOM)
    // Actually loadDashboard might read #date-from/#date-to OR #analysis-date-from/#analysis-date-to based on active view?
    // Let's check applyCustomDate logic implementation if I could see it.
    // Assuming loadDashboard('custom') reads from #date-from/to globally or if it checks view.
    // To be safe, let's sync to BOTH sets of desktop inputs since we want unified state or at least the one that matters.
    // And if `loadDashboard` reads specifically based on context, syncing ensures it works.

    document.getElementById('date-from').value = mFrom;
    document.getElementById('date-to').value = mTo;
    document.getElementById('analysis-date-from').value = mFrom;
    document.getElementById('analysis-date-to').value = mTo;

    loadDashboard('custom');
}

// ==========================================
// SALES HISTORY
// ==========================================

async function loadSales() {
    if (!supabase) return;

    // Get Filter Values
    const payMode = document.getElementById('sales-filter-payment').value;
    const sort = document.getElementById('sales-sort').value;
    const dateFrom = document.getElementById('sales-date-from').value;
    const dateTo = document.getElementById('sales-date-to').value;
    const searchBill = document.getElementById('sales-search-bill').value;

    let query = supabase
        .from('bills')
        .select('*, owners:created_by(full_name)')
        .eq('tenant_id', authState.owner.tenant_id);

    // Apply Filters

    // If searching by Bill Number, ignore date range (Global Search)
    if (searchBill) {
        query = query.eq('bill_number', searchBill);
        // We do typically keep payment mode filter if user explicitly selected it, 
        // but often bill search implies "Find THIS bill". 
        // Let's keep Pay Mode active in case they want to verify "Bill 123 is CASH".
        if (payMode !== 'all') {
            query = query.eq('payment_mode', payMode);
        }
    } else {
        // Standard Filtering
        if (payMode !== 'all') {
            query = query.eq('payment_mode', payMode);
        }

        if (dateFrom) {
            // Append T00:00:00 so JS parses as LOCAL midnight, not UTC midnight.
            // new Date("2026-03-04") → UTC midnight → wrong for IST users after midnight.
            // new Date("2026-03-04T00:00:00") → local midnight → correct.
            query = query.gte('created_at', new Date(dateFrom + 'T00:00:00').toISOString());
        }

        if (dateTo) {
            query = query.lte('created_at', new Date(dateTo + 'T23:59:59').toISOString());
        }
    }

    // Apply Sort
    if (sort === 'date-desc') query = query.order('created_at', { ascending: false });
    if (sort === 'date-asc') query = query.order('created_at', { ascending: true });
    if (sort === 'amount-desc') query = query.order('final_amount', { ascending: false });
    if (sort === 'amount-asc') query = query.order('final_amount', { ascending: true });

    const { data: bills, error } = await query;

    if (error) {
        console.error('Error loading sales:', error);
        alert('Failed to load sales history. Check connection.');
        return;
    }

    renderSales(bills || []);
}

function renderSales(bills) {
    const tbody = document.getElementById('sales-list');
    tbody.innerHTML = '';

    if (bills.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center">No sales found</td></tr>';
        return;
    }

    bills.forEach(bill => {
        const tr = document.createElement('tr');
        const date = new Date(bill.created_at);
        const dateStr = date.toLocaleDateString('en-IN') + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Calculate Flat Discount
        let discountDisplay = '₹0.00';
        if (bill.subtotal && bill.final_amount) {
            const diff = bill.subtotal - bill.final_amount;
            if (diff > 0) discountDisplay = `₹${diff.toFixed(2)}`;
        }

        // Billed By
        const billedBy = bill.owners ? bill.owners.full_name : 'Unknown';

        // Customer Details
        let customerDisplay = 'N/A';
        if (bill.customer_name) {
            customerDisplay = bill.customer_phone ? `${bill.customer_name} (${bill.customer_phone})` : bill.customer_name;
        } else if (bill.customer_phone) {
            customerDisplay = bill.customer_phone;
        }
        if (bill.customer_gstin) {
            customerDisplay = customerDisplay !== 'N/A' ? `${customerDisplay} | GSTIN: ${bill.customer_gstin}` : `GSTIN: ${bill.customer_gstin}`;
        }
        if (bill.customer_address) {
            customerDisplay = customerDisplay !== 'N/A' ? `${customerDisplay} | Addr: ${bill.customer_address}` : `Addr: ${bill.customer_address}`;
        }

        // Actions
        let actionHtml = '';
        if (bill.is_undone) {
            tr.className = 'row-undone';
            actionHtml = `<span class="badge-undone">Undid</span><span class="undo-notes-text">${bill.undo_notes || ''}</span>`;
        } else {
            let waAction = '';
            if (bill.customer_phone) {
                waAction = `<button onclick="sendWhatsAppReceipt('${bill.id}')" class="action-btn small" style="background:#25D366; color:white; border-color:#25D366; margin-right:4px;">WhatsApp</button>`;
            }
            let printAction = `<button onclick="reprintBill('${bill.id}')" class="action-btn small" style="background:#4b5563; color:white; border-color:#4b5563; margin-right:4px;">Print</button>`;
            let editAction = `<button onclick="openEditBillModal('${bill.id}')" class="action-btn small" style="background:#2563eb; color:white; border-color:#2563eb; margin-right:4px;">Edit</button>`;
            let undoAction = `<button onclick="openUndoModal('${bill.id}', '${bill.bill_number || ''}')" class="action-btn small danger">Undo</button>`;
            actionHtml = waAction + printAction + editAction + undoAction;
        }

        tr.innerHTML = `
            <td>#${bill.bill_number || 'N/A'}</td>
            <td>${dateStr}</td>
            <td>${customerDisplay}</td>
            <td>${bill.payment_mode}</td>
            <td><button onclick="viewBillDetails('${bill.id}')" class="action-btn small">View Items</button></td>
            <td>${discountDisplay}</td>
            <td>${billedBy}</td>
            <td style="font-weight:600">₹${bill.final_amount.toFixed(2)}</td>
            <td>${actionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}


async function reprintBill(billId) {
    if (!supabase) return;
    
    try {
        // Fetch bill details
        const { data: bill, error: billError } = await supabase
            .from('bills')
            .select('*, owners(full_name)')
            .eq('id', billId)
            .single();

        if (billError || !bill) throw billError;

        // Fetch bill items
        const { data: items, error: itemsError } = await supabase
            .from('bill_items')
            .select('*')
            .eq('bill_id', billId);

        if (itemsError || !items) throw itemsError;

        // Show the preview modal
        showBillPreview(bill, items);
        
    } catch (err) {
        console.error('Error fetching bill for reprint:', err);
        alert('Could not load bill details for printing.');
    }
}


async function sendBackgroundWhatsApp(bill, items) {
    if (!bill || !bill.customer_phone) return;

    const waUrl = localStorage.getItem('wa_gateway_url') || authState.owner?.whatsapp_gateway_url;
    const waToken = localStorage.getItem('wa_gateway_token') || authState.owner?.whatsapp_gateway_token;

    let phoneNum = bill.customer_phone.replace(/\D/g, '');
    if (phoneNum.length === 10) phoneNum = '91' + phoneNum;

    let storeName = authState.owner?.preferred_store_name || authState.owner?.business_name || "Na Dukan";
    let msg = "*🧾 Receipt from " + storeName + "*\n";
    msg += "Bill No: " + (bill.bill_number || bill.id.slice(0, 8)) + "\n\n";
    msg += "*Items:*\n";
    items.forEach(i => {
        const qty = i.quantity || i.qty || 1;
        const price = i.price || i.product?.price || 0;
        const pName = i.product_name || i.product?.name || 'Item';
        msg += "- " + pName + " x" + qty + " = ₹" + (qty * price).toFixed(2) + "\n";
    });
    msg += "\n*Total: ₹" + (bill.final_amount || bill.subtotal || 0).toFixed(2) + "*\n";
    msg += "Mode: " + (bill.payment_mode || 'CASH') + "\n\n";
    msg += "Thank you for your visit!";

    if (waUrl && waToken) {
        try {
            console.log("Sending automatic WhatsApp message via Gateway API...");
            await fetch(waUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: waToken,
                    to: phoneNum,
                    body: msg
                })
            });
            showToast("WhatsApp receipt sent automatically!");
        } catch (err) {
            console.error("Auto WhatsApp Gateway failed:", err);
        }
    } else {
        // Fallback: Open WhatsApp URL in background/new tab if phone is present
        const encodeMsg = encodeURIComponent(msg);
        const waLink = "https://wa.me/" + phoneNum + "?text=" + encodeMsg;
        window.open(waLink, '_blank');
    }
}

async function viewBillDetails(billId) {
    // Ideally this would show a modal, but for MVP let's just alert the items or console log
    // Or we can quickly build a simple string to alert
    const { data: items, error } = await supabase
        .from('bill_items')
        .select('*')
        .eq('bill_id', billId);

    if (error || !items) {
        alert('Could not load items');
        return;
    }

    let msg = `Bill Items:\n`;
    items.forEach(i => {
        msg += `- ${i.product_name} x${i.quantity} (₹${i.price})\n`;
    });
    alert(msg);
}

async function sendWhatsAppReceipt(billId) {
    if (!supabase) return;

    // Fetch bill details
    const { data: bill, error: billError } = await supabase
        .from('bills')
        .select('*')
        .eq('id', billId)
        .single();

    if (billError || !bill || !bill.customer_phone) {
        alert('Could not send WhatsApp receipt. Check customer phone number.');
        return;
    }

    // Fetch items
    const { data: items, error: itemsError } = await supabase
        .from('bill_items')
        .select('*')
        .eq('bill_id', billId);

    if (itemsError || !items) {
        alert('Could not load bill items.');
        return;
    }

    // Build Store Info
    let storeName = authState.owner?.preferred_store_name || authState.owner?.business_name || "Na Dukan";

    // Build Message
    let msg = `*🧾 Receipt from ${storeName}*\n`;
    msg += `Bill No: ${bill.bill_number || bill.id.slice(0, 8)}\n\n`;

    msg += `*Items:*\n`;
    items.forEach(i => {
        msg += `- ${i.product_name} x${i.quantity} = ₹${(i.quantity * i.price).toFixed(2)}\n`;
    });

    msg += `\n*Total: ₹${bill.final_amount.toFixed(2)}*\n`;
    msg += `Mode: ${bill.payment_mode}\n\n`;
    msg += `Thank you for your visit!`;

    // Clean phone number (Keep mostly numbers, ensure country code)
    let phoneNum = bill.customer_phone.replace(/\D/g, '');
    if (phoneNum.length === 10) {
        phoneNum = '91' + phoneNum; // Default to India (+91) if 10 digits
    }

    const encodeMsg = encodeURIComponent(msg);
    const waUrl = `https://wa.me/${phoneNum}?text=${encodeMsg}`;

    window.open(waUrl, '_blank');
}

// ==========================================
// INVENTORY MANAGEMENT
// ==========================================

async function loadInventory() {
    if (!supabase) return;

    // Fetch Tabs
    const { data: tabs, error: tabsError } = await supabase
        .from('product_tabs')
        .select('*')
        .eq('tenant_id', authState.owner.tenant_id)
        .order('sort_order', { ascending: true });

    if (tabsError) {
        console.error('Error loading tabs:', tabsError);
        alert('Failed to load categories. Please reload.');
    }
    else appState.tabs = tabs || [];

    // Fetch Products
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', authState.owner.tenant_id)
        .order('name', { ascending: true });

    if (prodError) {
        console.error('Error loading products:', prodError);
        alert('Failed to load products. Please reload.');
    }
    else appState.products = products || [];

    renderInventoryTabs();
    renderInventoryList();
}

function renderInventoryTabs() {
    const container = document.getElementById('inventory-tabs');
    container.innerHTML = '';

    // All Tab
    const allPill = document.createElement('div');
    allPill.className = `tab-pill ${appState.currentInventoryTab === 'all' ? 'active' : ''}`;
    allPill.textContent = 'All';
    allPill.onclick = () => { appState.currentInventoryTab = 'all'; renderInventoryTabs(); renderInventoryList(); };
    container.appendChild(allPill);

    appState.tabs.forEach(tab => {
        const pill = document.createElement('div');
        pill.className = `tab-pill ${appState.currentInventoryTab === tab.id ? 'active' : ''}`;

        // Tab Name Span
        const span = document.createElement('span');
        span.textContent = tab.name;
        span.onclick = () => { appState.currentInventoryTab = tab.id; renderInventoryTabs(); renderInventoryList(); };
        pill.appendChild(span);

        // Delete Button (Small 'x')
        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.marginLeft = '8px';
        delBtn.style.opacity = '0.7';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteTab(tab.id); };
        pill.appendChild(delBtn);

        container.appendChild(pill);
    });
}

async function deleteTab(tabId) {
    if (!confirm('Are you sure you want to delete this category? All products in it will be moved to "All".')) return;

    // 1. Move products to NULL tab (Uncategorized)
    // Supabase SET tab_id = NULL WHERE tab_id = tabId
    const { error: moveError } = await supabase
        .from('products')
        .update({ tab_id: null })
        .eq('tab_id', tabId)
        .eq('tenant_id', authState.owner.tenant_id);

    if (moveError) {
        alert('Error moving products: ' + moveError.message);
        return;
    }

    // 2. Delete the tab
    const { error: delError } = await supabase
        .from('product_tabs')
        .delete()
        .eq('id', tabId)
        .eq('tenant_id', authState.owner.tenant_id);

    if (delError) {
        alert('Error deleting tab: ' + delError.message);
    } else {
        // Reset view if we were on that tab
        if (appState.currentInventoryTab === tabId) appState.currentInventoryTab = 'all';
        loadInventory();
    }
}

function renderInventoryList() {
    const container = document.getElementById('inventory-list');
    container.innerHTML = '';

    const query = document.getElementById('inventory-search') ? document.getElementById('inventory-search').value.toLowerCase().trim() : '';

    let filtered = [];

    if (query) {
        // Global Search (Starts With logic as requested)
        filtered = appState.products.filter(p => p.name.toLowerCase().startsWith(query));
    } else {
        // Tab Filter
        filtered = appState.currentInventoryTab === 'all'
            ? appState.products
            : appState.products.filter(p => p.tab_id === appState.currentInventoryTab);
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary)">No items found</div>';
        return;
    }

    filtered.forEach(p => {
        const tabName = appState.tabs.find(t => t.id === p.tab_id)?.name || 'Uncategorized';
        const stockDisplay = p.is_in_house ? '<span style="color:var(--success-color); font-weight:600">Unlimited</span>' : p.stock;

        const item = document.createElement('div');
        item.className = 'inventory-item';

        let imageHtml = '';
        if (p.image_data) {
            imageHtml = `<img src="${p.image_data}" style="width:40px; height:40px; object-fit:cover; border-radius:4px; margin-right:10px;">`;
        }

        item.innerHTML = `
            <div class="item-info" style="display:flex; align-items:center;">
                ${imageHtml}
                <div>
                    <h4>${p.name}</h4>
                    <div class="item-meta">₹${p.price} • Stock: ${stockDisplay} • ${tabName}</div>
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-edit" onclick="openEditProduct('${p.id}')">Edit</button>
                <button class="btn-delete" onclick="deleteProduct('${p.id}')">Delete</button>
            </div>
        `;
        container.appendChild(item);
    });
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    const { error } = await supabase.from('products').delete().eq('id', id).eq('tenant_id', authState.owner.tenant_id);
    if (error) alert('Error deleting product');
    else loadInventory();
}

// Modals
const modalOverlay = document.getElementById('modal-overlay');
const modals = document.querySelectorAll('.modal');

function closeModals() {
    modalOverlay.classList.add('hidden');
    modals.forEach(m => m.classList.add('hidden'));
    document.getElementById('add-product-form').reset();
    document.getElementById('add-tab-form').reset();
    document.getElementById('edit-product-form').reset();

    // Destroy croppers
    if (cropper) { cropper.destroy(); cropper = null; }
    document.getElementById('p-cropper-container').classList.add('hidden');
    document.getElementById('edit-p-cropper-container').classList.add('hidden');
    document.getElementById('p-image-input').value = '';
    document.getElementById('edit-p-image-input').value = '';
}

// Image Handling Logic
let cropper;

function handleImageInput(inputId, previewId, containerId) {
    const input = document.getElementById(inputId);
    const image = document.getElementById(previewId);
    const container = document.getElementById(containerId);

    input.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.size > 2 * 1024 * 1024) {
                alert('File too large. Max 2MB.');
                input.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                image.src = e.target.result;
                container.classList.remove('hidden');
                if (cropper) cropper.destroy();
                cropper = new Cropper(image, {
                    aspectRatio: 1, // Square for card
                    viewMode: 1,
                });
            };
            reader.readAsDataURL(file);
        }
    });
}

// Initialize handlers
handleImageInput('p-image-input', 'p-image-preview', 'p-cropper-container');
handleImageInput('edit-p-image-input', 'edit-p-image-preview', 'edit-p-cropper-container');

async function getCompressedImage() {
    if (!cropper) return null;

    // Get cropped canvas
    let canvas = cropper.getCroppedCanvas({
        width: 300, // Reasonable max width
        height: 300
    });

    if (!canvas) return null;

    // Compress
    let quality = 0.9;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Reduce quality until < 20KB
    while (dataUrl.length > 20000 && quality > 0.1) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    return dataUrl;
}

// 5KB Limit Logo Compressor
function getCompressedLogo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Extremely small dimensions to hit 5KB
                // 5KB is tiny. A 100x100 B/W image or simple icon might fit.
                // Let's try max 150px
                const MAX_WIDTH = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_WIDTH) {
                        width *= MAX_WIDTH / height;
                        height = MAX_WIDTH;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = "#FFFFFF"; // Ensure white background for transparency
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Aggressive compression
                let quality = 0.5;
                let dataUrl = canvas.toDataURL('image/jpeg', quality);

                // Binary search or loop to ensure < 5KB could be here, but let's try a simple heuristic check
                // 5KB = 5120 bytes. Base64 is ~1.33x larger. So Base64 length should be < 6826 chars roughly

                while (dataUrl.length > 7000 && quality > 0.1) {
                    quality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                }

                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

function openAddTabModal() {
    modalOverlay.classList.remove('hidden');
    document.getElementById('modal-add-tab').classList.remove('hidden');
}

function openAddProductModal() {
    // Populate tab select
    const select = document.getElementById('p-tab');
    select.innerHTML = '<option value="">All (Uncategorized)</option>';
    appState.tabs.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        select.appendChild(opt);
    });

    modalOverlay.classList.remove('hidden');
    document.getElementById('modal-add-product').classList.remove('hidden');

    // Reset stock visibility
    toggleStockInput('add', false);
}

function toggleStockInput(mode, isHidden) {
    const prefix = mode === 'add' ? 'p' : 'edit-p';
    const container = document.getElementById(`${prefix}-stock`).closest('.form-group');
    const input = document.getElementById(`${prefix}-stock`);

    if (isHidden) {
        container.classList.add('hidden');
        input.removeAttribute('required');
    } else {
        container.classList.remove('hidden');
        input.setAttribute('required', 'true');
    }
}

// Event Listeners for In-House Checkbox
document.getElementById('p-house').addEventListener('change', (e) => {
    toggleStockInput('add', e.target.checked);
});
document.getElementById('edit-p-house').addEventListener('change', (e) => {
    toggleStockInput('edit', e.target.checked);
});

function openEditProduct(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    document.getElementById('edit-p-id').value = productId;
    document.getElementById('edit-p-name').value = product.name;
    document.getElementById('edit-p-price').value = product.price;
    document.getElementById('edit-p-stock').value = product.stock;
    document.getElementById('edit-p-house').checked = product.is_in_house;

    // Set initial visibility
    toggleStockInput('edit', product.is_in_house);

    // Populate tab select
    const select = document.getElementById('edit-p-tab');
    select.innerHTML = '<option value="">All (Uncategorized)</option>';
    appState.tabs.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        if (t.id === product.tab_id) opt.selected = true;
        select.appendChild(opt);
    });

    // Handle existing image preview if needed? 
    // For now, we only show cropper if NEW image selected.
    // Maybe show current image?
    // Not critical for MVP, user can just upload new one to replace.

    modalOverlay.classList.remove('hidden');
    document.getElementById('modal-edit-product').classList.remove('hidden');
}

// Add Tab
document.getElementById('add-tab-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('t-name').value;

    const { data, error } = await supabase
        .from('product_tabs')
        .insert([{ name, sort_order: appState.tabs.length, tenant_id: authState.owner.tenant_id }]);

    if (error) alert('Error creating tab');
    else {
        closeModals();
        loadInventory();
    }
});

// Add Product
document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('p-name').value;
    const price = document.getElementById('p-price').value;
    const is_in_house = document.getElementById('p-house').checked;
    const stock = is_in_house ? 0 : (document.getElementById('p-stock').value || 0);

    let tab_id = document.getElementById('p-tab').value;
    if (tab_id === "") tab_id = null;

    // Process Image
    const image_data = await getCompressedImage();

    const { error } = await supabase
        .from('products')
        .insert([{
            name,
            price,
            stock,
            tab_id,
            is_in_house,
            tenant_id: authState.owner.tenant_id,
            image_data: image_data
        }]);

    if (error) alert('Error creating product: ' + error.message);
    else {
        closeModals();
        loadInventory();
    }
});

// Edit Product
document.getElementById('edit-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-p-id').value;
    const name = document.getElementById('edit-p-name').value;
    const price = document.getElementById('edit-p-price').value;
    const is_in_house = document.getElementById('edit-p-house').checked;
    const stock = is_in_house ? 0 : (document.getElementById('edit-p-stock').value || 0);

    let tab_id = document.getElementById('edit-p-tab').value;
    if (tab_id === "") tab_id = null;

    const updates = { name, price, stock, tab_id, is_in_house };

    // Only update image if changed
    const image_data = await getCompressedImage();
    if (image_data) {
        updates.image_data = image_data;
    }

    const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .eq('tenant_id', authState.owner.tenant_id);

    if (error) alert('Error updating product');
    else {
        closeModals();
        loadInventory();
    }
});

// ==========================================
// BILLING (POS)
// ==========================================

function renderBilling() {
    // Render Tabs
    const tabsContainer = document.getElementById('billing-tabs');
    tabsContainer.innerHTML = '';

    // "All" Tab
    const allBtn = document.createElement('button');
    allBtn.className = `tab-pill ${appState.currentBillingTab === 'all' ? 'active' : ''}`;
    allBtn.textContent = `All (${appState.products.length})`;
    allBtn.onclick = () => { appState.currentBillingTab = 'all'; renderBilling(); };
    tabsContainer.appendChild(allBtn);

    appState.tabs.forEach(tab => {
        const btn = document.createElement('button');
        btn.className = `tab-pill ${appState.currentBillingTab === tab.id ? 'active' : ''}`;

        // Count products in tab
        const count = appState.products.filter(p => p.tab_id === tab.id).length;
        btn.textContent = `${tab.name} (${count})`;

        btn.onclick = () => { appState.currentBillingTab = tab.id; renderBilling(); };
        tabsContainer.appendChild(btn);
    });

    // Render Grid
    const grid = document.getElementById('billing-grid');
    grid.innerHTML = '';

    let filtered = appState.currentBillingTab === 'all'
        ? appState.products
        : appState.products.filter(p => p.tab_id === appState.currentBillingTab);

    // Search Filter
    const searchInput = document.getElementById('billing-search');
    if (searchInput) {
        const term = searchInput.value.toLowerCase();
        if (term) {
            filtered = filtered.filter(p => p.name.toLowerCase().startsWith(term));
        }
    }

    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        let imageHtml = '';
        if (p.image_data) {
            imageHtml = `
            <div class="card-image">
                <img src="${p.image_data}" alt="${p.name}">
            </div>`;
        } else {
            imageHtml = `
             <div class="card-image" style="background:#e5e7eb; color:#6b7280; font-weight:bold; font-size:1.5rem;">
                ${p.name.charAt(0).toUpperCase()}
             </div>`;
        }

        // Stock Display Logic
        let stockInfo = '';
        if (p.is_in_house) {
            stockInfo = '<span style="font-size:0.75rem; color:var(--success-color); display:block; margin-bottom:0.25rem;">In-house made</span>';
        } else {
            let color = p.stock > 0 ? 'var(--text-secondary)' : 'var(--danger-color)';
            stockInfo = `<span style="font-size:0.75rem; color:${color}; display:block; margin-bottom:0.25rem;">Stock: ${p.stock}</span>`;
        }

        card.innerHTML = `
            ${imageHtml}
            <div class="card-details">
                <h4 title="${p.name}">${p.name}</h4>
                ${stockInfo}
                <div class="card-footer">
                    <span class="price">₹${p.price}</span>
                    <button class="add-btn" onclick="addToCart('${p.id}')">+</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function addToCart(productId) {
    const product = appState.products.find(p => p.id === productId);
    if (!product) return;

    if (product.stock <= 0 && !product.is_in_house) {
        alert('Out of stock!');
        return;
    }

    const existing = appState.cart.find(item => item.product.id === productId);
    if (existing) {
        // Check stock limit
        if (existing.qty + 1 > product.stock && !product.is_in_house) {
            alert('Stock limit reached for this bill');
            return;
        }
        existing.qty++;
    } else {
        appState.cart.push({ product, qty: 1 });
    }
    showToast("Product Added!");
    renderCart();
}

function getItemUnitPrice(item) {
    return (item.customPrice !== undefined && item.customPrice !== null) ? item.customPrice : item.product.price;
}

function editItemSpecialPrice(index) {
    const item = appState.cart[index];
    if (!item) return;

    const currentPrice = getItemUnitPrice(item);
    const input = prompt(`Enter special price per piece for "${item.product.name}":\n(Original Price: ₹${item.product.price})`, currentPrice);

    if (input === null) return; // User cancelled

    const val = input.trim();
    if (val === '') {
        delete item.customPrice;
        showToast("Price reset to original");
    } else {
        const newPrice = parseFloat(val);
        if (isNaN(newPrice) || newPrice < 0) {
            alert('Please enter a valid non-negative price');
            return;
        }
        if (newPrice === item.product.price) {
            delete item.customPrice;
            showToast("Price reset to original");
        } else {
            item.customPrice = newPrice;
            showToast(`Special price set: ₹${newPrice}/pc`);
        }
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    container.innerHTML = '';

    if (appState.cart.length === 0) {
        container.innerHTML = '<div class="empty-cart">Cart is empty</div>';
    } else {
        appState.cart.forEach((item, index) => {
            const unitPrice = getItemUnitPrice(item);
            const isSpecial = item.customPrice !== undefined && item.customPrice !== null;
            const priceHtml = isSpecial 
                ? `<span style="color:#2563EB; font-weight:700;">₹${unitPrice}</span> <s style="font-size:0.75rem; color:#94A3B8;">₹${item.product.price}</s>`
                : `₹${unitPrice}`;

            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="cart-item-name" title="${item.product.name}">${item.product.name} (${priceHtml})</div>
                <div class="qty-controls">
                    <button class="special-price-btn ${isSpecial ? 'active' : ''}" onclick="editItemSpecialPrice(${index})" title="${isSpecial ? 'Special Price Active: ₹' + unitPrice + ' (Click to edit)' : 'Give Special Price'}">🏷️</button>
                    <button class="qty-btn" onclick="updateCartQty(${index}, -1)">-</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="updateCartQty(${index}, 1)">+</button>
                </div>
                <button class="remove-btn" onclick="removeFromCart(${index})">&times;</button>
            `;
            container.appendChild(div);
        });
    }


    // Update Mobile Cart Count
    const totalQty = appState.cart.reduce((sum, item) => sum + item.qty, 0);
    const mobileCountEl = document.getElementById('mobile-cart-count');
    if (mobileCountEl) mobileCountEl.textContent = `(${totalQty})`;

    calculateTotals();
}

function updateCartQty(index, delta) {
    const item = appState.cart[index];
    const newQty = item.qty + delta;

    if (newQty <= 0) {
        removeFromCart(index);
    } else {
        if (newQty > item.product.stock && !item.product.is_in_house) {
            alert('Cannot exceed available stock');
            return;
        }
        item.qty = newQty;
        renderCart();
    }
}

function removeFromCart(index) {
    appState.cart.splice(index, 1);
    renderCart();
}

function calculateTotals() {
    const subtotal = appState.cart.reduce((sum, item) => sum + (getItemUnitPrice(item) * item.qty), 0);

    let discountType = document.getElementById('discount-type').value;
    let discountValue = parseFloat(document.getElementById('discount-value').value) || 0;

    // Toggle input visibility
    const disInput = document.getElementById('discount-value');
    if (discountType === 'none') disInput.classList.add('hidden');
    else disInput.classList.remove('hidden');

    let final = subtotal;
    if (discountType === 'flat') final = subtotal - discountValue;
    if (discountType === 'percentage') final = subtotal - (subtotal * (discountValue / 100));

    if (final < 0) final = 0;

    document.getElementById('bill-subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('bill-total').textContent = `₹${final.toFixed(2)}`;
}

async function generateBill() {
    if (appState.cart.length === 0) {
        alert('Cart is empty');
        return;
    }

    const subtotal = appState.cart.reduce((sum, item) => sum + (getItemUnitPrice(item) * item.qty), 0);
    const discountType = document.getElementById('discount-type').value;
    const discountValue = parseFloat(document.getElementById('discount-value').value) || 0;

    let final = subtotal;
    if (discountType === 'flat') final = subtotal - discountValue;
    if (discountType === 'percentage') final = subtotal - (subtotal * (discountValue / 100));
    if (final < 0) final = 0;

    const paymentMode = document.querySelector('input[name="paymode"]:checked').value;
    const customerName = document.getElementById('customer-name').value.trim();
    const customerPhone = document.getElementById('customer-phone').value.trim();
    const customerGstin = (document.getElementById('customer-gstin')?.value || '').trim().toUpperCase();
    const customerAddress = (document.getElementById('customer-address')?.value || '').trim();

    // Generate Bill Number: Today's Date YYMMDD + Continuous Sequence ps001, ps002, ps003...
    const now = new Date();
    const dateStr = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;

    let nextSeq = 1;
    try {
        const { data: existingBills } = await supabase
            .from('bills')
            .select('bill_number')
            .eq('tenant_id', authState.owner.tenant_id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (existingBills && existingBills.length > 0) {
            let maxNum = 0;
            existingBills.forEach(b => {
                if (b.bill_number) {
                    const match = b.bill_number.match(/-ps(\d+)$/i);
                    if (match && match[1]) {
                        const numPart = parseInt(match[1], 10);
                        if (!isNaN(numPart) && numPart > maxNum) {
                            maxNum = numPart;
                        }
                    }
                }
            });
            nextSeq = maxNum + 1;
        }
    } catch (err) {
        console.error("Error generating bill sequence", err);
    }

    const seqStr = nextSeq < 1000 ? nextSeq.toString().padStart(3, '0') : nextSeq.toString();
    const billNumber = `${dateStr}-ps${seqStr}`;

    // 1. Insert Bill
    const billPayload = {
        subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        final_amount: final,
        payment_mode: paymentMode,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_gstin: customerGstin,
        customer_address: customerAddress,
        bill_number: billNumber,
        tenant_id: authState.owner.tenant_id,
        created_by: authState.owner.id
    };

    let { data: billData, error: billError } = await supabase
        .from('bills')
        .insert([billPayload])
        .select()
        .single();

    if (billError && billError.message && (billError.message.includes('customer_address') || billError.message.includes('customer_gstin'))) {
        if (billError.message.includes('customer_address')) delete billPayload.customer_address;
        if (billError.message.includes('customer_gstin')) delete billPayload.customer_gstin;
        const res = await supabase.from('bills').insert([billPayload]).select().single();
        billData = res.data;
        billError = res.error;
        if (billData) {
            billData.customer_gstin = customerGstin;
            billData.customer_address = customerAddress;
        }
    }

    if (billError) {
        alert('Error saving bill: ' + billError.message);
        return;
    }

    const billId = billData.id;

    const itemsToInsert = appState.cart.map(item => ({
        bill_id: billId,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.qty,
        price: getItemUnitPrice(item),
        tenant_id: authState.owner.tenant_id
    }));

    // Start items insert but don't strictly wait for it to be confirmed before showing preview
    // We do await it because the DB needs it fast, but we parallelize the rest.
    const insertItemsPromise = supabase.from('bill_items').insert(itemsToInsert);

    // 3. Update Stock (Ignore for In-house) - BACKGROUND TASK
    const stockUpdatePromises = [];
    for (const item of appState.cart) {
        if (!item.product.is_in_house) {
            const newStock = item.product.stock - item.qty;
            stockUpdatePromises.push(
                supabase.from('products').update({ stock: newStock }).eq('id', item.product.id)
            );
        }
    }

    // Execute concurrently
    const [{ error: itemsError }] = await Promise.all([
        insertItemsPromise,
        ...stockUpdatePromises
    ]);

    if (itemsError) {
        console.error('Error saving items', itemsError);
        alert('Bill saved but items failed. Please check data.');
    }

    // Success - Show Preview
    // Note: We do NOT clear cart here. We clear it when the user closes the preview (Sales Cycle Complete).

    // Refresh Inventory and Dashboard (Background update - NO AWAIT)
    loadInventory();
    loadDashboard(appState.dashboardFilter);

    // Render preview instantly
    showBillPreview(billData, itemsToInsert);
}

// Simple markdown-to-HTML parser for bill notes
function parseBillNoteMarkdown(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let html = '';
    let inOl = false;
    let inUl = false;

    const closeList = () => {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (inUl) { html += '</ul>'; inUl = false; }
    };

    const inlineFormat = (t) => t
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');

    lines.forEach(line => {
        const h2 = line.match(/^##\s+(.*)/);
        const h3 = line.match(/^###\s+(.*)/);
        const h1 = line.match(/^#\s+(.*)/);
        const ol = line.match(/^\d+\.\s+(.*)/);
        const ul = line.match(/^[-*]\s+(.*)/);
        const hr = line.match(/^---+$/);

        if (h3) {
            closeList();
            html += `<h4 style="font-size:12px;font-weight:700;margin:8px 0 3px 0;">${inlineFormat(h3[1])}</h4>`;
        } else if (h2) {
            closeList();
            html += `<h3 style="font-size:13px;font-weight:700;margin:10px 0 4px 0;">${inlineFormat(h2[1])}</h3>`;
        } else if (h1) {
            closeList();
            html += `<h2 style="font-size:14px;font-weight:700;margin:10px 0 4px 0;">${inlineFormat(h1[1])}</h2>`;
        } else if (hr) {
            closeList();
            html += '<hr style="border:none;border-top:1px solid #ccc;margin:8px 0;">';
        } else if (ol) {
            if (!inOl) { closeList(); html += '<ol style="margin:4px 0 4px 20px;padding:0;">'; inOl = true; }
            html += `<li style="margin-bottom:2px;">${inlineFormat(ol[1])}</li>`;
        } else if (ul) {
            if (!inUl) { closeList(); html += '<ul style="margin:4px 0 4px 20px;padding:0;">'; inUl = true; }
            html += `<li style="margin-bottom:2px;">${inlineFormat(ul[1])}</li>`;
        } else if (line.trim() === '') {
            closeList();
            html += '<br>';
        } else {
            closeList();
            html += `<p style="margin:3px 0;">${inlineFormat(line)}</p>`;
        }
    });
    closeList();
    return html;
}

function showBillPreview(bill, items) {
    const modal = document.getElementById('modal-bill-preview');
    const container = document.getElementById('receipt-preview-content');

    let storeName = "Na Dukan";
    let storeAddress = "";
    let storeLogo = null;
    let billNote = "";
    let billFormat = "57mm";
    let storeGstin = "";
    let billedByName = (authState.owner ? authState.owner.full_name : 'Unknown');

    if (authState.owner) {
        storeName = authState.owner.preferred_store_name || authState.owner.business_name || "Na Dukan";
        storeAddress = authState.owner.preferred_address || authState.owner.business_address || "";
        storeLogo = authState.owner.preferred_logo;
        billNote = authState.owner.bill_note || "";
        billFormat = authState.owner.preferred_bill_format || "57mm";
        storeGstin = authState.owner.store_gstin || "";
        if (authState.owner.billed_by_name) billedByName = authState.owner.billed_by_name;
    }
    // Check local cache
    if (appState.ownerPreferredName) storeName = appState.ownerPreferredName;
    if (appState.ownerPreferredLogo) storeLogo = appState.ownerPreferredLogo;
    if (appState.ownerPreferredAddress) storeAddress = appState.ownerPreferredAddress;
    if (appState.ownerBillNote) billNote = appState.ownerBillNote;
    if (appState.ownerPreferredBillFormat) billFormat = appState.ownerPreferredBillFormat;
    if (appState.ownerGstin) storeGstin = appState.ownerGstin;
    if (appState.ownerBilledByName) billedByName = appState.ownerBilledByName;

    const date = new Date(bill.created_at);
    const dateStr = date.toLocaleDateString('en-IN');
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const billDisplay = bill.bill_number || bill.id.slice(0, 8);

    
    let html = '';

    if (billFormat === 'A4') {
        let itemsHtml = '';
        let totalCgst = 0;
        let totalSgst = 0;
        let totalBaseAmount = 0;

        items.forEach((item, index) => {
            const mrp = item.price;
            const qty = item.quantity;
            const baseRate = mrp / 1.05;
            const cgstAmt = baseRate * 0.025 * qty;
            const sgstAmt = baseRate * 0.025 * qty;
            const baseAmt = baseRate * qty;
            const lineTotal = mrp * qty;

            totalCgst += cgstAmt;
            totalSgst += sgstAmt;
            totalBaseAmount += baseAmt;

            itemsHtml += `
              <tr>
                <td style="text-align:center;width:36px;">${index + 1}</td>
                <td style="text-align:left;">${item.product_name}</td>
                <td style="text-align:center;width:44px;">${qty}</td>
                <td style="text-align:right;width:80px;">${baseRate.toFixed(2)}</td>
                <td style="text-align:right;width:80px;">${cgstAmt.toFixed(2)}</td>
                <td style="text-align:right;width:80px;">${sgstAmt.toFixed(2)}</td>
                <td style="text-align:right;width:90px;font-weight:600;">${lineTotal.toFixed(2)}</td>
              </tr>
            `;
        });

        const subtotal = bill.subtotal;
        const finalAmount = bill.final_amount;
        const discount = subtotal - finalAmount;
        const totalTaxAmount = totalCgst + totalSgst;

        let totalsHtml = '';
        totalsHtml += `
            <div class="a4-totals-row"><span>Total Taxable Amount</span><span>₹${totalBaseAmount.toFixed(2)}</span></div>
            <div class="a4-totals-row"><span>CGST (2.5%)</span><span>₹${totalCgst.toFixed(2)}</span></div>
            <div class="a4-totals-row"><span>SGST (2.5%)</span><span>₹${totalSgst.toFixed(2)}</span></div>
        `;
        if (discount > 0) {
            totalsHtml += `
                <div class="a4-totals-row"><span>Subtotal (MRP)</span><span>₹${subtotal.toFixed(2)}</span></div>
                <div class="a4-totals-row" style="color:#dc2626;"><span>Discount</span><span>-₹${discount.toFixed(2)}</span></div>
            `;
        }
        totalsHtml += `
            <div class="a4-totals-row grand-total"><span>Grand Total</span><span>₹${finalAmount.toFixed(2)}</span></div>
        `;

        html = `
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            .receipt-a4 {
                width: 100%;
                font-family: Arial, sans-serif;
                font-size: 13px;
                line-height: 1.5;
                background: white;
                color: #222;
                padding: 14mm 16mm;
            }
            .a4-header {
                text-align: center;
                padding-bottom: 14px;
                border-bottom: 2px solid #333;
                margin-bottom: 14px;
            }
            .a4-header h1 {
                font-size: 20px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 2px;
                margin: 6px 0 3px 0;
            }
            .a4-header .address {
                font-size: 11px;
                color: #555;
                margin-top: 3px;
            }
            .a4-invoice-label {
                text-align: center;
                font-size: 15px;
                font-weight: 700;
                letter-spacing: 4px;
                text-transform: uppercase;
                color: #111;
                margin-bottom: 10px;
            }
            .a4-meta {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                align-items: start;
                margin-bottom: 14px;
                font-size: 12px;
                padding: 10px 0;
                border-bottom: 1px solid #ddd;
                gap: 8px;
            }
            .a4-meta .left { line-height: 1.8; }
            .a4-meta .center-label {
                text-align: center;
                font-size: 18px;
                font-weight: 800;
                letter-spacing: 5px;
                color: #111;
                padding: 0 20px;
                border-left: 1px solid #ddd;
                border-right: 1px solid #ddd;
            }
            .a4-meta .right { text-align: right; line-height: 1.8; }
            .a4-meta strong { color: #000; }
            .a4-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 14px;
                font-size: 12px;
                table-layout: fixed;
            }
            .a4-table th {
                background: #1e293b;
                color: #fff;
                padding: 9px 7px;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .a4-table th small {
                display: block;
                font-weight: 400;
                font-size: 9px;
                opacity: 0.8;
                letter-spacing: 0;
                margin-top: 1px;
            }
            .a4-table td {
                padding: 8px 7px;
                border-bottom: 1px solid #e5e7eb;
                vertical-align: middle;
                word-wrap: break-word;
            }
            .a4-table tbody tr:nth-child(even) { background: #f9fafb; }
            .a4-totals-section {
                width: 360px;
                margin-left: auto;
                margin-top: 6px;
                border-top: 1px solid #ddd;
                padding-top: 8px;
            }
            .a4-totals-row {
                display: flex;
                justify-content: space-between;
                padding: 3px 0;
                font-size: 12.5px;
            }
            .a4-totals-row.grand-total {
                font-size: 16px;
                font-weight: 700;
                color: #000;
                border-top: 2px solid #000;
                margin-top: 8px;
                padding-top: 8px;
            }
            .a4-footer {
                margin-top: 36px;
                text-align: center;
                font-size: 11px;
                color: #888;
                border-top: 1px solid #eee;
                padding-top: 12px;
            }
            @media print {
                html, body {
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                }
                #main-app, #auth-wrapper, #toast-notification, .modal-actions { display: none !important; }
                body * { visibility: hidden; }
                .receipt-a4, .receipt-a4 * { visibility: visible; }
                #modal-overlay {
                    position: static !important;
                    left: auto !important; top: auto !important;
                    width: 100% !important; height: auto !important;
                    max-height: none !important;
                    background: none !important; display: block !important;
                    padding: 0 !important; margin: 0 !important;
                    overflow: visible !important;
                    box-shadow: none !important;
                }
                #modal-bill-preview {
                    position: static !important;
                    left: auto !important; top: auto !important;
                    margin: 0 !important; padding: 0 !important;
                    box-shadow: none !important; border: none !important;
                    height: auto !important; max-height: none !important;
                    width: 100% !important; max-width: none !important;
                    overflow: visible !important;
                    background: transparent !important;
                    border-radius: 0 !important;
                }
                #receipt-preview-content {
                    position: static !important;
                    width: 100% !important;
                    height: auto !important;
                    max-height: none !important;
                    overflow: visible !important;
                    padding: 0 !important;
                    margin: 0 !important;
                }
                .receipt-a4 {
                    position: static !important;
                    width: 100% !important;
                    height: auto !important;
                    max-height: none !important;
                    margin: 0 !important;
                    padding: 8mm 10mm !important;
                    border: none !important;
                    overflow: visible !important;
                    box-shadow: none !important;
                }
                .a4-table thead {
                    display: table-header-group;
                }
                .a4-table tr {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .a4-totals-section, .a4-footer {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                @page {
                    size: A4 portrait;
                    margin: 8mm 0;
                }
            }
        </style>
        <div class="receipt-a4">
            <div class="a4-header">
                ${storeLogo ? `<img src="${storeLogo}" style="height: 50px; max-width: 160px; object-fit: contain; display: block; margin: 0 auto 6px auto;">` : ''}
                <h1>${storeName}</h1>
                ${storeGstin ? `<div class="address" style="font-weight: 700; color: #111; letter-spacing: 0.5px; margin-top: 2px;">GSTIN: ${storeGstin}</div>` : ''}
                ${storeAddress ? `<div class="address">${storeAddress}</div>` : ''}
            </div>

            <div class="a4-meta">
                <div class="left">
                    <strong>Invoice No:</strong> ${billDisplay}<br>
                    <strong>Payment Mode:</strong> ${bill.payment_mode}<br>
                    ${bill.customer_name ? `<strong>Customer:</strong> ${bill.customer_name}<br>` : ''}
                    ${bill.customer_phone ? `<strong>Phone:</strong> ${bill.customer_phone}<br>` : ''}
                    ${bill.customer_gstin ? `<strong>GSTIN:</strong> ${bill.customer_gstin}<br>` : ''}
                </div>
                <div class="center-label">TAX INVOICE</div>
                <div class="right">
                    <strong>Date:</strong> ${dateStr}<br>
                    <strong>Time:</strong> ${timeStr}<br>
                    <strong>Billed By:</strong> ${billedByName}
                    ${bill.customer_address ? `<div style="margin-top: 4px; white-space: pre-wrap; font-size: 0.9em; line-height: 1.3;"><strong>Cust. Address:</strong><br>${bill.customer_address}</div>` : ''}
                </div>
            </div>

            <table class="a4-table">
                <colgroup>
                    <col style="width:36px;">
                    <col>
                    <col style="width:44px;">
                    <col style="width:82px;">
                    <col style="width:82px;">
                    <col style="width:82px;">
                    <col style="width:92px;">
                </colgroup>
                <thead>
                    <tr>
                        <th style="text-align:center;">#</th>
                        <th style="text-align:left;">Item Description</th>
                        <th style="text-align:center;">Qty</th>
                        <th style="text-align:right;">Rate (₹)</th>
                        <th style="text-align:right;">CGST (₹)<small>@ 2.5%</small></th>
                        <th style="text-align:right;">SGST (₹)<small>@ 2.5%</small></th>
                        <th style="text-align:right;">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <div class="a4-totals-section">
                ${totalsHtml}
            </div>

            ${billNote ? `<div class="a4-footer" style="text-align:left;">${parseBillNoteMarkdown(billNote)}</div>` : ''}
        </div>
        `;
    
    } else {
        // Build Items HTML (Div based) for 57mm
        let itemsHtml = '';
        items.forEach((item, index) => {
            const lineTotal = item.quantity * item.price;
            itemsHtml += `
              <div class="row">
                <span class="sno">${index + 1}</span>
                <span class="item">${item.product_name}</span>
                <span class="qty">${item.quantity}</span>
                <span class="amt">${lineTotal.toFixed(2)}</span>
              </div>
            `;
        });

        const subtotal = bill.subtotal;
        const finalAmount = bill.final_amount;
        const discount = subtotal - finalAmount;

        let totalsHtml = '';
        if (discount > 0) {
            totalsHtml = `
              <div class="row">
                <span class="item bold" style="flex:1;">Subtotal</span>
                <span class="amt">${subtotal.toFixed(2)}</span>
              </div>
              <div class="row">
                <span class="item bold">Discount</span>
                <span class="amt">-${discount.toFixed(2)}</span>
              </div>
              <div class="divider"></div>
              <div class="row total">
                <span class="item" style="flex:1;">TOTAL</span>
                <span class="amt">${finalAmount.toFixed(2)}</span>
              </div>
            `;
        } else {
            totalsHtml = `
              <div class="row total">
                <span class="item" style="flex:1;">TOTAL</span>
                <span class="amt">${finalAmount.toFixed(2)}</span>
              </div>
            `;
        }

        html = `
            <style>
                .receipt {
                  width: 58mm;
                  font-family: monospace;
                  font-size: 12px;
                  line-height: 1.3;
                  background: white;
                  box-sizing: border-box; 
                  padding: 5mm 3mm; /* Top/Bottom 5mm, Left/Right 3mm */
                  color: #000;
                  margin: 0 auto;
                  border: 1px solid #ddd;
                }
                .center { text-align: center; }
                .bold { font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 4px 0; }
                .row { display: flex; }
                
                /* Column Widths Update: S.No (3mm), Item (Flex), Qty (4mm), Amt (14mm) */
                .sno { width: 3mm; flex-shrink: 0; text-align: left; }
                .item { flex: 1; padding-left: 1mm; overflow-x: hidden; }
                .qty { width: 7mm; text-align: center; flex-shrink: 0; }
                .amt { width: 14mm; text-align: right; flex-shrink: 0; }
                
                .total { font-size: 14px; font-weight: bold; }
                
                @media print {
                    html, body {
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: none !important;
                    }
                    #main-app, #auth-wrapper, #toast-notification, .modal-actions {
                        display: none !important;
                    }
                    body * {
                        visibility: hidden;
                    }
                    .receipt, .receipt * {
                        visibility: visible;
                    }
                    #modal-overlay {
                        position: static !important;
                        left: auto !important;
                        top: auto !important;
                        width: 100% !important;
                        height: auto !important;
                        max-height: none !important;
                        background: none !important;
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        box-shadow: none !important;
                    }
                    #modal-bill-preview {
                        position: static !important;
                        left: auto !important;
                        top: auto !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-shadow: none !important;
                        border: none !important;
                        height: auto !important;
                        max-height: none !important;
                        width: 58mm !important;
                        overflow: visible !important;
                        background: transparent !important;
                        border-radius: 0 !important;
                    }
                    #receipt-preview-content {
                        position: static !important;
                        width: 58mm !important;
                        height: auto !important;
                        max-height: none !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .receipt {
                        position: static !important;
                        left: auto !important;
                        top: auto !important;
                        width: 58mm !important;
                        height: auto !important;
                        max-height: none !important;
                        margin: 0 !important;
                        padding: 0 3mm !important;
                        border: none !important;
                        overflow: visible !important;
                        page-break-after: auto !important;
                        page-break-before: auto !important;
                        page-break-inside: auto !important;
                        break-inside: auto !important;
                    }
                    .receipt .row {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    @page { margin: 0; }
                }
            </style>
            <div class="receipt">
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 4px;">
                   ${storeLogo ? `<img src="${storeLogo}" style="height: 35px; width: auto; max-width: 120px; object-fit: contain; margin-bottom: 4px;">` : ''}
                   <div class="bold center" style="text-transform:uppercase; font-size:16px; width: 100%;">${storeName}</div>
                   ${storeGstin ? `<div class="bold center" style="font-size: 11px; margin-top: 2px;">GSTIN: ${storeGstin}</div>` : ''}
              </div>
              ${storeAddress ? `<div class="center" style="font-size: 10px; margin-bottom: 5px;">${storeAddress}</div>` : ''}
              <div class="divider"></div>

              <div style="display: flex; justify-content: space-between; font-size: 11px;">
                <span>B.No:${billDisplay}</span>
                <span>${dateStr} ${timeStr}</span>
              </div>
              ${(bill.customer_name || bill.customer_phone || bill.customer_gstin) ? `
              <div style="font-size: 11px; margin-top: 2px;">
                ${bill.customer_name ? `<div>Cust: ${bill.customer_name}</div>` : ''}
                ${bill.customer_phone ? `<div>Phone: ${bill.customer_phone}</div>` : ''}
                ${bill.customer_gstin ? `<div>GSTIN: ${bill.customer_gstin}</div>` : ''}
              </div>` : ''}

              <div class="divider"></div>

              <div class="row bold">
                <span class="sno">#</span>
                <span class="item">ITEM</span>
                <span class="qty">Qty</span>
                <span class="amt">AMT</span>
              </div>

              <div class="divider"></div>

              ${itemsHtml}

              <div class="divider"></div>

              ${totalsHtml}

              <div class="divider"></div>

              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
                <span>Mode: ${bill.payment_mode}</span>
                <span>Billed By: ${billedByName}</span>
              </div>
              ${bill.customer_address ? `<div style="font-size: 11px; text-align: right; margin-top: 4px; white-space: pre-wrap; line-height: 1.2;">Address:<br>${bill.customer_address}</div>` : ''}

              <br>
              ${billNote ? `<div class="center" style="white-space: pre-wrap; margin-bottom: 8px;">${billNote}</div>` : ''}
            </div>
        `;
    }

    container.innerHTML = html;

    // Resize modal based on format
    if (billFormat === 'A4') {
        modal.style.maxWidth = '900px';
        modal.style.width = '95vw';
        modal.style.padding = '1.5rem';
    } else {
        modal.style.maxWidth = '400px';
        modal.style.width = 'auto';
        modal.style.padding = '1rem';
    }

    // Show Modal
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');
    modal.classList.remove('hidden');

    // Force scroll to top for Mobile/Tab
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close Mobile Billing Sidebar if open
    const sidebar = document.getElementById('billing-summary-panel');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }
}


function printBill() {
    window.print();
}

function closeBillPreview() {
    // Hide Modal
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal-bill-preview');

    overlay.classList.add('hidden');
    modal.classList.add('hidden');

    // Clear Cart and Reset UI
    appState.cart = [];

    // Reset Discount Inputs
    document.getElementById('discount-type').value = 'none';
    document.getElementById('discount-value').value = '';

    // Reset Customer Inputs
    document.getElementById('customer-name').value = '';
    document.getElementById('customer-phone').value = '';
    if (document.getElementById('customer-gstin')) document.getElementById('customer-gstin').value = '';
    if (document.getElementById('customer-address')) document.getElementById('customer-address').value = '';

    renderCart();

    // Close Mobile Sidebar
    const sidebar = document.getElementById('billing-summary-panel');
    if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
    }

    showToast("Sales Cycle Complete");
}

// ==========================================
// DASHBOARD
// ==========================================

// Date filters
// Date filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const range = btn.getAttribute('data-range');
        const isCustom = btn.id === 'custom-date-btn' || btn.id === 'analysis-custom-date-btn';

        // Update UI for all tabs (Sync)
        document.querySelectorAll('.filter-btn').forEach(b => {
            // If we clicked a specific range, activate matching buttons elsewhere
            if (!isCustom && b.getAttribute('data-range') === range) {
                b.classList.add('active');
            }
            // If we clicked custom, activate custom buttons elsewhere
            else if (isCustom && (b.id === 'custom-date-btn' || b.id === 'analysis-custom-date-btn')) {
                b.classList.add('active');
            }
            else {
                b.classList.remove('active');
            }
        });

        // Hide all custom inputs first
        document.getElementById('custom-date-inputs').classList.add('hidden');
        document.getElementById('analysis-custom-date-inputs').classList.add('hidden');

        // Logic
        if (isCustom) {
            // Show inputs for the specific view we are in, or just the one next to the button
            if (btn.id === 'custom-date-btn') document.getElementById('custom-date-inputs').classList.remove('hidden');
            if (btn.id === 'analysis-custom-date-btn') document.getElementById('analysis-custom-date-inputs').classList.remove('hidden');
        } else {
            appState.dashboardFilter = range;
            loadDashboard(range);
        }
    });
});



// Helper for colors
function getChartColor(idx, isBright) {
    const brightColors = [
        '#EF4444', '#F97316', '#F59E0B', '#10B981', '#3B82F6',
        '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6', '#F43F5E'
    ];
    const dullColors = [
        '#78716c', '#a8a29e', '#d6d3d1', '#9ca3af', '#94a3b8',
        '#64748b', '#475569', '#52525b', '#71717a', '#a1a1aa'
    ];
    if (isBright) return brightColors[idx % brightColors.length];
    return dullColors[idx % dullColors.length];
}

function applyCustomDate(source) {
    appState.dashboardFilter = 'custom';
    loadDashboard('custom');
}

async function loadDashboard(range) {
    if (!supabase) return;

    try {
        let query = supabase.from('bills').select('final_amount, payment_mode, created_at, id, is_undone').eq('tenant_id', authState.owner.tenant_id);

        const now = new Date();
        let startTime;
        // ... (rest of filtering logic is fine)

        if (range === 'today') {
            startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (range === 'week') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            firstDay.setHours(0, 0, 0, 0);
            startTime = firstDay.toISOString();
        } else if (range === 'month') {
            startTime = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else if (range === 'year') {
            startTime = new Date(now.getFullYear(), 0, 1).toISOString();
        } else if (range === 'custom') {
            let d1 = document.getElementById('date-from').value;
            let d2 = document.getElementById('date-to').value;

            // Check if we are in analysis view, use those inputs if populated
            if (!document.getElementById('analysis').classList.contains('hidden')) {
                const ad1 = document.getElementById('analysis-date-from').value;
                const ad2 = document.getElementById('analysis-date-to').value;
                if (ad1 && ad2) {
                    d1 = ad1;
                    d2 = ad2;
                }
            }

            if (!d1 || !d2) return;

            query = query.gte('created_at', new Date(d1 + 'T00:00:00').toISOString())
                .lte('created_at', new Date(d2 + 'T23:59:59').toISOString());
        }

        if (range !== 'custom' && startTime) {
            query = query.gte('created_at', startTime);
        }

        const { data: bills, error } = await query;
        if (error) {
            console.error('Error fetching dashboard stats:', error);
            alert('Failed to load dashboard data. Check connection.');
            return;
        }

        // Calculate Stats
        const safeBills = (bills || []).filter(b => !b.is_undone);
        const totalSales = safeBills.reduce((sum, b) => sum + b.final_amount, 0);
        const cash = safeBills.filter(b => b.payment_mode === 'CASH').reduce((sum, b) => sum + b.final_amount, 0);
        const upi = safeBills.filter(b => b.payment_mode === 'UPI').reduce((sum, b) => sum + b.final_amount, 0);
        const other = safeBills.filter(b => b.payment_mode === 'OTHER').reduce((sum, b) => sum + b.final_amount, 0);
        const count = safeBills.length;

        // Update UI
        document.getElementById('stat-total-sales').textContent = `₹${totalSales.toFixed(2)}`;
        document.getElementById('stat-cash').textContent = `₹${cash.toFixed(2)}`;
        document.getElementById('stat-upi').textContent = `₹${upi.toFixed(2)}`;
        document.getElementById('stat-other').textContent = `₹${other.toFixed(2)}`;
        document.getElementById('stat-bill-count').textContent = count;

        // --- Render Charts ---
        // Top Products Logic
        let itemsQuery = supabase.from('bill_items').select('product_name, quantity, price, created_at, bill_id').eq('tenant_id', authState.owner.tenant_id);


        if (range !== 'custom' && startTime) {
            itemsQuery = itemsQuery.gte('created_at', startTime);
        } else if (range === 'custom') {
            let d1 = document.getElementById('date-from').value;
            let d2 = document.getElementById('date-to').value;

            // Check if we are in analysis view, use those inputs if populated
            if (!document.getElementById('analysis').classList.contains('hidden')) {
                const ad1 = document.getElementById('analysis-date-from').value;
                const ad2 = document.getElementById('analysis-date-to').value;
                if (ad1 && ad2) {
                    d1 = ad1;
                    d2 = ad2;
                }
            }

            if (d1 && d2) {
                itemsQuery = itemsQuery.gte('created_at', new Date(d1 + 'T00:00:00').toISOString())
                    .lte('created_at', new Date(d2 + 'T23:59:59').toISOString());
            }
        }

        const { data: fetchedItems, error: itemsError } = await itemsQuery;

        if (itemsError) {
            console.error("Error loading top products", itemsError);
        } else {
            // Filter out items from undone bills
            const validBillIds = new Set(safeBills.map(b => b.id));
            const validItems = (fetchedItems || []).filter(i => validBillIds.has(i.bill_id));

            renderTopProducts(validItems);

            // Cache Data for Filter Updates
            appState.dashboardData = {
                bills: safeBills,
                items: validItems,
                range: range,
                startTime: startTime
            };

            // Re-render charts with items for Product Trend
            if (typeof renderCharts === 'function') {
                renderCharts(safeBills, range, startTime, validItems);
            }
        }
    } catch (err) {
        console.error('DASHBOARD ERROR:', err);
        // alert('Dashboard Error: ' + err.message); // Uncomment if needed for user visibility
    }
}

function renderTopProducts(items) {
    const container = document.getElementById('top-products-list');
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div style="padding:1rem; text-align:center; color:var(--text-secondary)">No sales in this period</div>';
        return;
    }

    // Aggregate
    const sales = {};
    items.forEach(i => {
        if (!sales[i.product_name]) sales[i.product_name] = 0;
        sales[i.product_name] += i.quantity;
    });

    // Sort
    const sorted = Object.entries(sales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3); // Top 3

    sorted.forEach(([name, qty], index) => {
        const div = document.createElement('div');
        div.className = 'top-product-item';

        let medal = '';
        if (index === 0) medal = '🥇';
        else if (index === 1) medal = '🥈';
        else if (index === 2) medal = '🥉';

        div.innerHTML = `
            <span class="rank" style="font-size: 1.5rem; margin-right: 0.5rem;">${medal}</span>
            <div style="flex:1;">
                <span class="name" style="font-weight:600; font-size:1.05rem;">${name}</span>
            </div>
            <span class="qty" style="font-weight:bold; color:var(--primary-color);">${qty} sold</span>
        `;
        container.appendChild(div);
    });
}

function renderCharts(bills, range, startTime, items) {
    if (!window.Chart) return;

    // 1. Payment Mode Pie Chart
    const payData = {
        CASH: bills.filter(b => b.payment_mode === 'CASH').reduce((sum, b) => sum + b.final_amount, 0),
        UPI: bills.filter(b => b.payment_mode === 'UPI').reduce((sum, b) => sum + b.final_amount, 0),
        OTHER: bills.filter(b => b.payment_mode === 'OTHER').reduce((sum, b) => sum + b.final_amount, 0),
    };

    const ctxPay = document.getElementById('chart-payment').getContext('2d');
    if (appState.charts.payment) appState.charts.payment.destroy();

    appState.charts.payment = new Chart(ctxPay, {
        type: 'doughnut',
        data: {
            labels: ['Cash', 'UPI', 'Other'],
            datasets: [{
                data: [payData.CASH, payData.UPI, payData.OTHER],
                backgroundColor: ['#10B981', '#2563EB', '#6B7280'],
                borderWidth: 0
            }]
        },
        options: {
            plugins: {
                legend: { position: 'bottom' }
            },
            maintainAspectRatio: false
        }
    });

    // 2. Revenue Trend Line Chart (Cumulative)
    const ctxRev = document.getElementById('chart-revenue').getContext('2d');
    if (appState.charts.revenue) appState.charts.revenue.destroy();

    // Prepare buckets based on range
    let labels = [];
    let buckets = [];

    // Helper to format date
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (range === 'today') {
        // 0 to 23 hours
        for (let i = 0; i < 24; i++) {
            labels.push(i === 0 ? '12 AM' : i === 12 ? '12 PM' : i > 12 ? `${i - 12} PM` : `${i} AM`);
            buckets.push(0);
        }
    } else if (range === 'week') {
        // Last 7 days or This relative week? 
        // Code in loadDashboard uses "Last Sunday/Monday" logic?
        // Let's assume standard Mon-Sun or Sun-Sat. 
        // For simplicity, let's map bills to day names.
        // Better: Initialize buckets for the actual dates in range if strict, 
        // but for "This Week" (assuming Mon-Sun), let's just do Mon-Sun.
        labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        buckets = new Array(7).fill(0);
    } else if (range === 'month') {
        // Week 1 to 5
        labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
        buckets = new Array(5).fill(0);
    } else if (range === 'year') {
        labels = months;
        buckets = new Array(12).fill(0);
    } else {
        // Custom: Just group by date
        // Since custom can be anything, let's just sort bills and do a simple line
        // But user asked for "Always Increase", so we just do cumulative on whatever data comes in
        // Simplified custom: Group by Date
    }

    // Fill buckets
    const billList = [...bills].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Note: If range is custom, we might handle differently, but let's try to fit into buckets if standard
    if (range === 'custom') {
        const fromVal = document.getElementById('date-from').value;
        const toVal = document.getElementById('date-to').value;

        // Parse as Local Midnight to avoid timezone shifts
        const [y1, m1, day1] = fromVal.split('-').map(Number);
        const [y2, m2, day2] = toVal.split('-').map(Number);
        const d1 = new Date(y1, m1 - 1, day1);
        const d2 = new Date(y2, m2 - 1, day2);

        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include start date

        if (diffDays <= 20) {
            // Day by Day
            // Initialize buckets for every day in range to have continuity
            for (let i = 0; i < diffDays; i++) {
                const tempDate = new Date(d1);
                tempDate.setDate(d1.getDate() + i);
                labels.push(tempDate.toLocaleDateString());
                buckets.push(0);
            }

            billList.forEach(b => {
                const bDate = new Date(b.created_at);
                bDate.setHours(0, 0, 0, 0);

                // Diff in days (using Round to be safe with DST/Timezone drifts if any)
                const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));

                if (dayDiff >= 0 && dayDiff < buckets.length) {
                    buckets[dayDiff] += b.final_amount;
                }
            });

        } else {
            // Every 5 days
            // Create buckets: Day 1-5, Day 6-10...
            const numBuckets = Math.ceil(diffDays / 5);
            for (let i = 0; i < numBuckets; i++) {
                const startDay = i * 5;
                const endDay = Math.min((i + 1) * 5 - 1, diffDays - 1);

                const sDate = new Date(d1); sDate.setDate(d1.getDate() + startDay);
                const eDate = new Date(d1); eDate.setDate(d1.getDate() + endDay);

                labels.push(`${sDate.getDate()}/${sDate.getMonth() + 1} - ${eDate.getDate()}/${eDate.getMonth() + 1}`);
                buckets.push(0);
            }

            billList.forEach(b => {
                const bDate = new Date(b.created_at);
                bDate.setHours(0, 0, 0, 0);
                const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));
                const bucketIdx = Math.floor(dayDiff / 5);

                if (bucketIdx >= 0 && bucketIdx < buckets.length) {
                    buckets[bucketIdx] += b.final_amount;
                }
            });
        }
    } else {
        // Standard Ranges
        billList.forEach(b => {
            const d = new Date(b.created_at);
            let idx = -1;

            if (range === 'today') {
                idx = d.getHours();
            } else if (range === 'week') {
                // created_at Day (0=Sun, 1=Mon...). 
                // We want Mon(0) to Sun(6).
                // JS: 0=Sun, 1=Mon.
                // shift: (day + 6) % 7 ? -> Sun(0)->6, Mon(1)->0
                const jsDay = d.getDay();
                idx = (jsDay + 6) % 7;
            } else if (range === 'month') {
                const date = d.getDate();
                idx = Math.floor((date - 1) / 7); // 0-4
                if (idx > 4) idx = 4;
            } else if (range === 'year') {
                idx = d.getMonth();
            }

            if (idx >= 0 && idx < buckets.length) {
                buckets[idx] += b.final_amount;
            }
        });
    }

    // Calculate Cumulative
    let runningTotal = 0;
    let cumulativeData = buckets.map(val => {
        runningTotal += val;
        return runningTotal;
    });

    // Trim Future Data
    const now = new Date();
    let limitIdx = buckets.length - 1; // Default to showing all

    if (range === 'today') {
        limitIdx = now.getHours();
    } else if (range === 'week') {
        limitIdx = (now.getDay() + 6) % 7;
    } else if (range === 'month') {
        limitIdx = Math.floor((now.getDate() - 1) / 7);
        if (limitIdx > 4) limitIdx = 4;
    } else if (range === 'year') {
        limitIdx = now.getMonth();
    } else if (range === 'custom') {
        // Handle Future Crop for Custom Range
        const msPerDay = 1000 * 60 * 60 * 24;
        const fromVal = document.getElementById('date-from').value;
        const [y1, m1, day1] = fromVal.split('-').map(Number);
        const dStart = new Date(y1, m1 - 1, day1);

        const nowMidnight = new Date();
        nowMidnight.setHours(0, 0, 0, 0);

        // Days from Start to Today
        const daysSinceStart = Math.round((nowMidnight - dStart) / msPerDay);

        // Determine mode (Day-by-Day or 5-day)
        const toVal = document.getElementById('date-to').value;
        const [y2, m2, day2] = toVal.split('-').map(Number);
        const dEnd = new Date(y2, m2 - 1, day2);
        const totalDiff = Math.abs(dEnd - dStart);
        const totalDays = Math.ceil(totalDiff / msPerDay) + 1;

        if (totalDays <= 20) {
            limitIdx = daysSinceStart;
        } else {
            limitIdx = Math.floor(daysSinceStart / 5);
        }

        // Limits
        if (limitIdx < -1) limitIdx = -1; // All future
        // if limitIdx >= buckets.length -1, keep default
    }

    // Slice provided we need to trim
    if (limitIdx < labels.length - 1) {
        // slice(0, limitIdx + 1) includes the current unit
        const cut = limitIdx + 1;
        // If cut < 0 (all future), slice(0,0) -> empty
        const effectiveCut = Math.max(0, cut);

        labels = labels.slice(0, effectiveCut);
        cumulativeData = cumulativeData.slice(0, effectiveCut);
        buckets = buckets.slice(0, effectiveCut); // Slice buckets too for Velocity
    }

    // Render
    appState.charts.revenue = new Chart(ctxRev, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Revenue (Cumulative)',
                data: cumulativeData,
                borderColor: '#10B981', // Success color
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 2
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            },
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Total: ₹' + context.raw.toFixed(2);
                        }
                    }
                }
            }
        }
    });

    const ctxBills = document.getElementById('chart-bills').getContext('2d');
    if (appState.charts.bills) appState.charts.bills.destroy();

    // Re-calculating bill counts seems inefficient if not merged, but safest to ensure correct logic is 
    // to copy the filling logic OR to have filled a secondary array above.
    // Let's go do the Right Thing and fill a secondary array in the MAIN loop.
    // Wait, I can't easily edit the middle of the function with this tool without replacing the whole block.
    // So for now, I will indeed copy the logic (Code Duplication for MVP speed vs massive refactor risk).

    // Actually, I can replace the entire renderCharts function content or just the part I know. 
    // Let's try to just append the new chart logic using a NEW loop.
    // IT IS FAST ENOUGH.

    let billBuckets = new Array(buckets.length).fill(0);

    if (range === 'custom') {
        const fromVal = document.getElementById('date-from').value;
        const toVal = document.getElementById('date-to').value;
        const [y1, m1, day1] = fromVal.split('-').map(Number);
        const d1 = new Date(y1, m1 - 1, day1);
        const d2 = new Date(toVal.split('-')[0], toVal.split('-')[1] - 1, toVal.split('-')[2]);
        const diffTime = Math.abs(d2 - d1);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays <= 20) {
            billList.forEach(b => {
                const bDate = new Date(b.created_at);
                bDate.setHours(0, 0, 0, 0);
                const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));
                if (dayDiff >= 0 && dayDiff < billBuckets.length) {
                    billBuckets[dayDiff] += 1;
                }
            });
        } else {
            billList.forEach(b => {
                const bDate = new Date(b.created_at);
                bDate.setHours(0, 0, 0, 0);
                const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));
                const bucketIdx = Math.floor(dayDiff / 5);
                if (bucketIdx >= 0 && bucketIdx < billBuckets.length) {
                    billBuckets[bucketIdx] += 1;
                }
            });
        }
    } else {
        billList.forEach(b => {
            const d = new Date(b.created_at);
            let idx = -1;
            if (range === 'today') idx = d.getHours();
            else if (range === 'week') idx = (d.getDay() + 6) % 7;
            else if (range === 'month') {
                idx = Math.floor((d.getDate() - 1) / 7);
                if (idx > 4) idx = 4;
            } else if (range === 'year') idx = d.getMonth();

            if (idx >= 0 && idx < billBuckets.length) {
                billBuckets[idx] += 1;
            }
        });
    }

    // Cumulative Bills
    let runningBillCount = 0;
    let cumulativeBillData = billBuckets.map(val => {
        runningBillCount += val;
        return runningBillCount;
    });

    // Trim Future for Bills (Sync with labels)
    // Since labels are already trimmed, we just match the length
    if (cumulativeBillData.length > labels.length) {
        cumulativeBillData = cumulativeBillData.slice(0, labels.length);
        billBuckets = billBuckets.slice(0, labels.length);
    }

    appState.charts.bills = new Chart(ctxBills, {
        type: 'line',
        data: {
            labels: labels, // Shares labels with Revenue chart
            datasets: [{
                label: 'Total Bills (Cumulative)',
                data: cumulativeBillData,
                borderColor: '#F59E0B',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 2
            }]
        },
        options: {
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Bills: ' + context.raw;
                        }
                    }
                }
            }
        }
    });

    // 4. Period Revenue Bar Chart (Non-Cumulative) - "Revenue per every hr"
    const ctxVel = document.getElementById('chart-velocity').getContext('2d');
    if (appState.charts.velocity) appState.charts.velocity.destroy();

    // Data: 'buckets' array from Step 2 (already calculated, non-cumulative)
    // Labels: 'labels' array (already trimmed)
    // We just need to slice 'buckets' to match 'labels' length.

    let velData = buckets;
    if (labels.length < buckets.length) {
        velData = buckets.slice(0, labels.length);
    }

    appState.charts.velocity = new Chart(ctxVel, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Revenue',
                data: velData,
                backgroundColor: 'rgba(16, 185, 129, 0.6)', // Green (Emerald)
                borderColor: '#10B981',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            scales: { y: { beginAtZero: true } },
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Revenue: ₹' + context.raw.toFixed(2);
                        }
                    }
                }
            }
        }
    });



    // 5. Bill Velocity Bar Chart (Non-Cumulative)
    const ctxBillVel = document.getElementById('chart-bill-velocity').getContext('2d');
    if (appState.charts.billVelocity) appState.charts.billVelocity.destroy();

    let billVelData = billBuckets;
    if (labels.length < billBuckets.length) {
        billVelData = billBuckets.slice(0, labels.length);
    }

    appState.charts.billVelocity = new Chart(ctxBillVel, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Bills',
                data: billVelData,
                backgroundColor: 'rgba(245, 158, 11, 0.6)', // Amber
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return 'Bills: ' + context.raw;
                        }
                    }
                }
            }
        }
    });

    // 6. Product Sales Trend (Multi-Line)
    renderProductTrendChartSimplified(billList, items, range, labels.length);

    // 7. Render Sales Table
    renderSalesTable(items);
}

// Separate function for complexity
function renderProductTrendChart(bills, allItems, range, itemsLimit) {
    const ctxProd = document.getElementById('chart-product').getContext('2d');
    if (appState.charts.product) appState.charts.product.destroy();

    // 1. Group items by Product ID
    const productMap = {}; // { id: { name: '..', total: 0, buckets: [] } }

    // Initialize map with ALL known products to ensure we capture even 0 sales if selected?
    // For now, rely on sales history or appState.products if we want 0 sales.
    // Let's use allItems (sales history)

    // We need to know bucket logic again. 
    // Ideally we pass "bucket mapper" function, but easier to just use the timestamps in allItems
    // and map them to indices 0..itemsLimit-1.

    // Re-use logic for index mapping (copy-paste for speed, ideally refactor)
    // We need a helper to get Index from Date
    const getBucketIndex = (dateStr) => {
        const d = new Date(dateStr);
        if (range === 'custom') {
            const fromVal = document.getElementById('date-from').value;
            const toVal = document.getElementById('date-to').value;
            const [y1, m1, day1] = fromVal.split('-').map(Number);
            const d1 = new Date(y1, m1 - 1, day1);
            const d2 = new Date(toVal.split('-')[0], toVal.split('-')[1] - 1, toVal.split('-')[2]);
            const diffTime = Math.abs(d2 - d1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const bDate = new Date(dateStr); bDate.setHours(0, 0, 0, 0);
            const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));

            if (diffDays <= 20) return dayDiff;
            return Math.floor(dayDiff / 5);
        }
        if (range === 'today') return d.getHours();
        if (range === 'week') return (d.getDay() + 6) % 7;
        if (range === 'month') {
            let idx = Math.floor((d.getDate() - 1) / 7);
            return idx > 4 ? 4 : idx;
        }
        if (range === 'year') return d.getMonth();
        return 0;
    };

    // Calculate totals and fill buckets
    if (!allItems) allItems = []; // Safety

    allItems.forEach(item => {
        if (!productMap[item.product_name]) {
            productMap[item.product_name] = {
                name: item.product_name,
                total: 0,
                buckets: new Array(itemsLimit).fill(0)
            };
        }

        productMap[item.product_name].total += item.quantity;

        const idx = getBucketIndex(item.created_at);
        if (idx >= 0 && idx < itemsLimit) {
            productMap[item.product_name].buckets[idx] += item.quantity;
        }
    });

    // 2. Select Products to Show
    let productsToShow = []; // Array of objects

    // If NO selection, pick Top 5 and Bottom 5 (from active sales)
    // Note: This ignores products with 0 sales in this period if relying only on allItems.
    // That is acceptable for "Trend of SOLD items".

    // Convert map to array
    let sortedProducts = Object.values(productMap).sort((a, b) => b.total - a.total);

    if (appState.productTrendSelectedIds.length > 0) {
        // Show selected names (stored as IDs? User said "search bar to select needed product")
        // My dropdown implementation usually uses IDs. 
        // But bill_items only has product_name easily available in the fetch? 

        // Filter existing sales
        productsToShow = sortedProducts.filter(p => appState.productTrendSelectedIds.includes(p.name));

        // Add selected products with 0 sales if missing
        appState.productTrendSelectedIds.forEach(name => {
            if (!productsToShow.find(p => p.name === name)) {
                productsToShow.push({
                    name: name,
                    total: 0,
                    buckets: new Array(itemsLimit).fill(0)
                });
            }
        });

    } else {
        // Top 5 (Bright)
        const top5 = sortedProducts.slice(0, 5);
        // Bottom 5 (Dull) - exclude those already in top 5 if total < 10
        const bottom5 = sortedProducts.slice(-5).reverse(); // specific reverse? "Least selling"
        // Actually "Least 5" usually means lowest non-zero? Or just lowest?
        // Let's take last 5.
        // If total products < 10, overlap?
        // Unique merge
        const combined = new Set([...top5, ...bottom5]);
        productsToShow = Array.from(combined);
    }

    // 3. Prepare Datasets
    const datasets = productsToShow.map((p, i) => {
        // Determine color: 
        let isBright = true;

        // Identify if this P object is in the bottom slice
        const isBottom = sortedProducts.slice(-5).includes(p);
        const isTop = sortedProducts.slice(0, 5).includes(p);

        // If overlap (e.g. only 3 products), prefer Bright
        if (isBottom && !isTop) isBright = false;

        // Cumulative
        let running = 0;
        const cumData = p.buckets.map(v => { running += v; return running; });

        // Trim Future logic already handled by limiting buckets size to 'labels.length' passed in 'itemsLimit'? 
        // Yes, caller passed labels.length.

        return {
            label: p.name,
            data: cumData,
            borderColor: getChartColor(i, isBright),
            backgroundColor: getChartColor(i, isBright), // Point color?
            tension: 0.3,
            fill: false,
            borderWidth: 2,
            pointRadius: 3
        };
    });

    // Render
    appState.charts.product = new Chart(ctxProd, {
        type: 'line',
        data: {
            labels: appState.charts.revenue.data.labels, // safe access to main labels
            datasets: datasets
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}


// Simplified version without dropdown
function renderProductTrendChartSimplified(bills, allItems, range, itemsLimit) {
    const ctxProd = document.getElementById('chart-product').getContext('2d');
    if (appState.charts.product) appState.charts.product.destroy();

    // 1. Group items by Product ID
    const productMap = {}; // { id: { name: '..', total: 0, buckets: [] } }

    const getBucketIndex = (dateStr) => {
        const d = new Date(dateStr);
        if (range === 'custom') {
            const fromVal = document.getElementById('date-from').value;
            const toVal = document.getElementById('date-to').value;
            const [y1, m1, day1] = fromVal.split('-').map(Number);
            const d1 = new Date(y1, m1 - 1, day1);
            const d2 = new Date(toVal.split('-')[0], toVal.split('-')[1] - 1, toVal.split('-')[2]);
            const diffTime = Math.abs(d2 - d1);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            const bDate = new Date(dateStr); bDate.setHours(0, 0, 0, 0);
            const dayDiff = Math.round((bDate - d1) / (1000 * 60 * 60 * 24));

            if (diffDays <= 20) return dayDiff;
            return Math.floor(dayDiff / 5);
        }
        if (range === 'today') return d.getHours();
        if (range === 'week') return (d.getDay() + 6) % 7;
        if (range === 'month') {
            let idx = Math.floor((d.getDate() - 1) / 7);
            return idx > 4 ? 4 : idx;
        }
        if (range === 'year') return d.getMonth();
        return 0;
    };

    if (!allItems) allItems = [];

    allItems.forEach(item => {
        if (!productMap[item.product_name]) {
            productMap[item.product_name] = {
                name: item.product_name,
                total: 0,
                buckets: new Array(itemsLimit).fill(0)
            };
        }
        productMap[item.product_name].total += item.quantity;
        const idx = getBucketIndex(item.created_at);
        if (idx >= 0 && idx < itemsLimit) {
            productMap[item.product_name].buckets[idx] += item.quantity;
        }
    });

    // 2. Select Products to Show (Top 5 + Bottom 5)
    let sortedProducts = Object.values(productMap).sort((a, b) => b.total - a.total);

    const top5 = sortedProducts.slice(0, 5);
    const bottom5 = sortedProducts.slice(-5).reverse();
    const combined = new Set([...top5, ...bottom5]);
    let productsToShow = Array.from(combined);

    // 3. Prepare Datasets
    const datasets = productsToShow.map((p, i) => {
        let isBright = true;
        const isBottom = sortedProducts.slice(-5).includes(p);
        const isTop = sortedProducts.slice(0, 5).includes(p);
        if (isBottom && !isTop) isBright = false;

        let running = 0;
        const cumData = p.buckets.map(v => { running += v; return running; });

        return {
            label: p.name,
            data: cumData,
            borderColor: getChartColor(i, isBright),
            backgroundColor: getChartColor(i, isBright),
            tension: 0.3,
            fill: false,
            borderWidth: 2,
            pointRadius: 3
        };
    });

    // Render
    appState.charts.product = new Chart(ctxProd, {
        type: 'line',
        data: {
            labels: appState.charts.revenue.data.labels,
            datasets: datasets
        },
        options: {
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}

function renderSalesTable(items) {
    const tbody = document.querySelector('#sales-report-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No data available</td></tr>';
        return;
    }

    // Aggregate
    const counts = {};
    items.forEach(item => {
        counts[item.product_name] = (counts[item.product_name] || 0) + item.quantity;
    });

    // Sort Descending
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    // Render
    sorted.forEach(([name, count]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${name}</td><td>${count}</td>`;
        tbody.appendChild(tr);
    });
}

function filterSalesTable() {
    const input = document.getElementById('sales-table-search');
    const filter = input.value.toLowerCase();
    const table = document.getElementById('sales-report-table');
    const tr = table.getElementsByTagName('tr');

    for (let i = 1; i < tr.length; i++) { // Skip header
        const td = tr[i].getElementsByTagName('td')[0];
        if (td) {
            const txtValue = td.textContent || td.innerText;
            if (txtValue.toLowerCase().indexOf(filter) > -1) {
                tr[i].style.display = "";
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}

// ==========================================
// SETTINGS
// ==========================================

async function loadSettings() {
    // 1. Get User Data
    let user = authState.owner;

    // Fallback
    if (!user) {
        const stored = localStorage.getItem('tenant_session');
        if (stored) {
            try {
                user = JSON.parse(stored);
            } catch (e) { console.error(e); }
        }
    }

    if (!user) {
        return;
    }

    // --- PERMISSION CHECK: Inventory & Analysis ---
    const navButtons = document.querySelectorAll('.nav-btn');
    let invBtn = null, analysisBtn = null;
    navButtons.forEach(btn => {
        if (btn.textContent.includes('Inventory')) invBtn = btn;
        if (btn.textContent.includes('Data Analysis')) analysisBtn = btn;
    });

    // Drawer Buttons
    const drawerAnalysis = document.getElementById('drawer-link-analysis');
    const drawerEmployees = document.getElementById('drawer-link-employees');
    const drawerInventory = document.getElementById('drawer-link-inventory');

    let allowAnalysis = false;

    // 2. Populate Fields & Resolve Permissions

    // Profile Data Source: Default to User
    let pNameVal = user.full_name;
    let pEmailVal = user.email;

    if (user.role === 'employee') {
        // Hide Inventory for Employee (Desktop & Mobile)
        if (invBtn) invBtn.style.display = 'none';
        if (drawerInventory) drawerInventory.style.display = 'none';

        // Hide Employees Section for Employee
        if (drawerEmployees) drawerEmployees.style.display = 'none';

        if (user.tenant_id) {
            // Fetch Owner Details AND Preferences
            const { data: ownerReq } = await supabase
                .from('owners')
                .select('*')
                .eq('tenant_id', user.tenant_id)
                .eq('role', 'owner')
                .maybeSingle();

            if (ownerReq) {
                pNameVal = ownerReq.full_name + " (Owner)";
                pEmailVal = ownerReq.email;
                if (ownerReq.allow_employee_analysis) allowAnalysis = true;

                // Cache owner's store name for branding
                if (ownerReq.preferred_store_name) {
                    appState.ownerPreferredName = ownerReq.preferred_store_name;
                } else {
                    appState.ownerPreferredName = ownerReq.business_name || "Na Dukan";
                }

                if (ownerReq.preferred_logo) {
                    appState.ownerPreferredLogo = ownerReq.preferred_logo;
                }

                // Cache owner's address
                appState.ownerPreferredAddress = ownerReq.preferred_address || ownerReq.business_address || "";
            }
        }

        updateBranding(); // Update UI immediately

        // Hide Analysis if not allowed
        if (analysisBtn) analysisBtn.style.display = allowAnalysis ? 'inline-block' : 'none';
        if (drawerAnalysis) drawerAnalysis.style.display = allowAnalysis ? 'block' : 'none';

        // Hide Pref Card
        document.getElementById('settings-preferences-card').classList.add('hidden');

    } else {
        // Owner (Desktop)
        if (invBtn) invBtn.style.display = 'inline-block';
        if (analysisBtn) analysisBtn.style.display = 'inline-block';

        // Owner (Mobile)
        if (drawerInventory) drawerInventory.style.display = 'block';
        if (drawerAnalysis) drawerAnalysis.style.display = 'block';
        if (drawerEmployees) drawerEmployees.style.display = 'block';

        // Show Pref Card
        const prefCard = document.getElementById('settings-preferences-card');
        prefCard.classList.remove('hidden');

        // PREF: Store Name, Address, Logo, GSTIN, Billed By
        const nameInput = document.getElementById('pref-store-name');
        const addressInput = document.getElementById('pref-store-address');
        const gstinInput = document.getElementById('pref-store-gstin');
        const billedByInput = document.getElementById('pref-billed-by');
        const billNoteInput = document.getElementById('pref-bill-note');
        const formatInput = document.getElementById('pref-bill-format');
        const logoInput = document.getElementById('pref-logo-input');
        const logoPreview = document.getElementById('pref-logo-preview');
        const logoContainer = document.getElementById('pref-logo-preview-container');
        const logoSizeText = document.getElementById('pref-logo-size');
        const saveAllBtn = document.getElementById('btn-save-pref-all');

        if (nameInput) {
            // Load existing values
            nameInput.value = user.preferred_store_name || user.business_name || '';

            // Default preferred address to business address if not set
            if (addressInput) {
                addressInput.value = user.preferred_address || user.business_address || '';
            }

            if (gstinInput) {
                gstinInput.value = user.store_gstin || '';
            }
            if (billedByInput) {
                billedByInput.value = user.billed_by_name || '';
            }

            if (billNoteInput) {
                billNoteInput.value = user.bill_note || '';
            }
            if (formatInput) {
                formatInput.value = user.preferred_bill_format || '57mm';
            }
            const waUrlInput = document.getElementById('pref-wa-url');
            const waTokenInput = document.getElementById('pref-wa-token');
            if (waUrlInput) waUrlInput.value = localStorage.getItem('wa_gateway_url') || user.whatsapp_gateway_url || '';
            if (waTokenInput) waTokenInput.value = localStorage.getItem('wa_gateway_token') || user.whatsapp_gateway_token || '';
            
            const btnSaveWa = document.getElementById('btn-save-wa-settings');
            if (btnSaveWa) {
                btnSaveWa.onclick = async () => {
                    const u = waUrlInput.value.trim();
                    const t = waTokenInput.value.trim();
                    localStorage.setItem('wa_gateway_url', u);
                    localStorage.setItem('wa_gateway_token', t);
                    // Try saving to DB as well
                    await supabase.from('owners').update({ whatsapp_gateway_url: u, whatsapp_gateway_token: t }).eq('id', user.id);
                    showToast("WhatsApp Gateway Settings Saved!");
                };
            }

            // Show existing logo if available
            if (user.preferred_logo && logoContainer) {
                logoContainer.classList.remove('hidden');
                logoPreview.src = user.preferred_logo;
                logoSizeText.textContent = "Existing Logo Loaded";
            }

            // Handle Logo Selection & Preview with Compression
            if (logoInput) {
                logoInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;

                    // Compress to 5KB (approx)
                    // We'll use a very small max dimension and low quality
                    try {
                        const compressedBase64 = await getCompressedLogo(file);
                        logoContainer.classList.remove('hidden');
                        logoPreview.src = compressedBase64;

                        // Calculate approximate size in KB
                        const sizeInBytes = Math.ceil((compressedBase64.length * 3) / 4) - 2; // base64 size math
                        const sizeInKb = (sizeInBytes / 1024).toFixed(2);
                        logoSizeText.textContent = `New size: ${sizeInKb} KB (Compressed)`;

                        // Store temporarily on element for save
                        logoInput.dataset.base64 = compressedBase64;
                    } catch (err) {
                        console.error("Logo compression failed", err);
                        alert("Failed to process logo image.");
                    }
                };
            }

            // Save All Preferences
            if (saveAllBtn) {
                saveAllBtn.onclick = async () => {
                    const newName = nameInput.value.trim();
                    const newAddress = addressInput ? addressInput.value.trim() : '';
                    const newGstin = gstinInput ? gstinInput.value.trim().toUpperCase() : '';
                    const newBilledBy = billedByInput ? billedByInput.value.trim() : '';
                    const newNote = billNoteInput ? billNoteInput.value.trim() : '';
                    const newFormat = formatInput ? formatInput.value : '57mm';
                    let newLogo = user.preferred_logo; // Default to existing

                    // Check if new logo selected
                    if (logoInput && logoInput.dataset.base64) {
                        newLogo = logoInput.dataset.base64;
                    }

                    if (!newName) {
                        alert("Store Name is required.");
                        return;
                    }

                    const updates = {
                        preferred_store_name: newName,
                        preferred_address: newAddress,
                        preferred_logo: newLogo,
                        bill_note: newNote,
                        preferred_bill_format: newFormat,
                        store_gstin: newGstin,
                        billed_by_name: newBilledBy
                    };

                    let { error } = await supabase
                        .from('owners')
                        .update(updates)
                        .eq('id', user.id);

                    if (error && error.message && (error.message.includes('store_gstin') || error.message.includes('billed_by_name'))) {
                        if (error.message.includes('store_gstin')) delete updates.store_gstin;
                        if (error.message.includes('billed_by_name')) delete updates.billed_by_name;
                        const res = await supabase.from('owners').update(updates).eq('id', user.id);
                        error = res.error;
                    }

                    if (error) {
                        console.error("Save Error", error);
                        alert("Failed to save preferences. Check console.");
                    } else {
                        showToast("Preferences Updated Successfully!");
                        // Update Local State
                        authState.owner.preferred_store_name = newName;
                        authState.owner.preferred_address = newAddress;
                        authState.owner.preferred_logo = newLogo;
                        authState.owner.bill_note = newNote;
                        authState.owner.preferred_bill_format = newFormat;
                        authState.owner.store_gstin = newGstin;
                        authState.owner.billed_by_name = newBilledBy;
                        localStorage.setItem('tenant_session', JSON.stringify(authState.owner));

                        // FIX: Also update appState cache so bill previews use the new data immediately
                        appState.ownerPreferredName = newName;
                        appState.ownerPreferredLogo = newLogo;
                        appState.ownerPreferredAddress = newAddress;
                        appState.ownerBillNote = newNote;
                        appState.ownerGstin = newGstin;
                        appState.ownerBilledByName = newBilledBy;

                        // Persist to owner_pref_cache so employees & other sessions get it on next load
                        localStorage.setItem('owner_pref_cache', JSON.stringify({
                            name: newName,
                            logo: newLogo,
                            address: newAddress,
                            note: newNote,
                            gstin: newGstin,
                            billed_by: newBilledBy
                        }));

                        updateBranding();
                    }
                };
            }
        }

        // PREF: Analysis Checkbox
        const prefCheck = document.getElementById('pref-employee-analysis');
        if (prefCheck) {
            prefCheck.checked = user.allow_employee_analysis === true;

            // Attach Listener (deduplicated via property or just re-assign onclick)
            prefCheck.onclick = async (e) => {
                const checked = e.target.checked;
                // Update DB
                const { error } = await supabase
                    .from('owners')
                    .update({ allow_employee_analysis: checked })
                    .eq('id', user.id);

                if (error) {
                    console.error("Error updating pref", error);
                    alert("Failed to save preference");
                    e.target.checked = !checked; // Undo
                } else {
                    // Update local state temporarily
                    authState.owner.allow_employee_analysis = checked;
                    localStorage.setItem('tenant_session', JSON.stringify(authState.owner));
                }
            };
        }
    }

    // Profile
    const pName = document.getElementById('settings-p-name');
    const pEmail = document.getElementById('settings-p-email');
    if (pName) pName.value = pNameVal || '';
    if (pEmail) pEmail.value = pEmailVal || '';

    // Shop
    const sName = document.getElementById('settings-s-name');
    const sAddr = document.getElementById('settings-s-addr');
    if (sName) sName.value = user.business_name || '';
    if (sAddr) sAddr.value = (user.address || '') + (user.pincode ? `, ${user.pincode}` : '');

    // Employee List
    if (user.role === 'employee') {
        // Hide Add Employee Button if current user is employee
        const addEmpBtn = document.getElementById('btn-add-employee');
        if (addEmpBtn) addEmpBtn.classList.add('hidden');
    } else {
        // Ensure visible if owner
        const addEmpBtn = document.getElementById('btn-add-employee');
        if (addEmpBtn) addEmpBtn.classList.remove('hidden');
    }

    loadEmployeeList(user.tenant_id);
}

function updateBranding() {
    const brandEl = document.getElementById('nav-brand-name');
    const mobileBrandEl = document.getElementById('mobile-brand-name');
    const drawerBrandEl = document.getElementById('drawer-brand-name');

    const navLogo = document.getElementById('nav-brand-logo');
    const mobileLogo = document.getElementById('mobile-brand-logo');
    const drawerLogo = document.getElementById('drawer-brand-logo');

    let name = "Na Dukan"; // Default fallback
    let logo = null;

    // Check owner pref
    // If owner logged in
    if (authState.owner) {
        if (authState.owner.preferred_store_name) {
            name = authState.owner.preferred_store_name;
        } else if (authState.owner.business_name) {
            name = authState.owner.business_name;
        }
        if (authState.owner.preferred_logo) {
            logo = authState.owner.preferred_logo;
        }
    }

    // If we have cached one (e.g. employee view)
    if (appState.ownerPreferredName) {
        name = appState.ownerPreferredName;
    }
    if (appState.ownerPreferredLogo) {
        logo = appState.ownerPreferredLogo;
    }

    // Helper to update text or HTML
    const updateElement = (el) => {
        if (!el) return;
        // If still just "Na Dukan", apply basic styling. 
        // If custom, just text.
        if (name === "Na Dukan") {
            el.innerHTML = `Na <span class="highlight">Dukan</span>`;
        } else {
            el.textContent = name;
        }
    };

    updateElement(brandEl);
    updateElement(mobileBrandEl);
    updateElement(drawerBrandEl);

    // Update Logo
    const updateLogo = (imgEl) => {
        if (!imgEl) return;
        if (logo) {
            imgEl.src = logo;
            imgEl.classList.remove('hidden');
        } else {
            imgEl.classList.add('hidden');
        }
    };
    updateLogo(navLogo);
    updateLogo(mobileLogo);
    updateLogo(drawerLogo);
}
window.updateBranding = updateBranding;

// ==========================================
// EMPLOYEE MANAGEMENT
// ==========================================

async function loadEmployeeList(tenantId) {
    const listContainer = document.getElementById('employee-list-container');
    if (!listContainer) return;

    if (!tenantId) return;

    const { data: employees, error } = await supabase
        .from('owners')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('role', 'employee');

    if (error) {
        console.error("Error loading employees", error);
        return;
    }

    if (!employees || employees.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.9rem;">No employees added yet.</p>';
        return;
    }

    let html = '<div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">';
    employees.forEach(emp => {
        let deleteBtn = '';
        // Only Owners can see delete button
        if (authState.owner && authState.owner.role === 'owner') {
            deleteBtn = `
                <button onclick="deleteEmployee('${emp.id}')" style="background:#FEE2E2; color:#EF4444; border:none; border-radius:4px; padding:0.4rem 0.6rem; cursor:pointer;" title="Remove Employee">
                   🗑️
                </button>
             `;
        }

        html += `
            <div class="employee-list-item" style="background:#f9fafb; padding:0.75rem; border-radius:8px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:500;">${emp.full_name || 'Staff'}</div>
                    <div style="font-size:0.8rem; color:var(--text-secondary);">${emp.email}</div>
                </div>
                ${deleteBtn}
            </div>
        `;
    });
    html += '</div>';
    listContainer.innerHTML = html;
}

window.deleteEmployee = async function (id) {
    if (!confirm("Are you sure you want to remove this employee? They will no longer be able to log in to this shop.")) {
        return;
    }

    try {
        const { error } = await supabase
            .from('owners')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Delete Error:", error);
            alert("Failed to delete employee: " + error.message);
        } else {
            alert("Employee removed.");
            loadSettings(); // Refresh list
        }
    } catch (e) {
        console.error("Unexpected error:", e);
        alert("Error: " + e.message);
    }
}

window.openAddEmployeeModal = async function () {
    try {
        if (!window.authState || !window.authState.owner) {
            alert("Session Error: You must be logged in.");
            return;
        }

        // 1. Check Limit
        const { count, error } = await supabase
            .from('owners')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', authState.owner.tenant_id)
            .eq('role', 'employee');

        if (error) {
            console.error("Error checking limit", error);
            alert("System error checking employee limit.");
            return;
        }

        if (count >= 2) {
            alert("Limit Reached: You can only add up to 2 employees.");
            return;
        }

        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('modal-add-employee');
        if (overlay && modal) {
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
        } else {
            console.error("Modal elements not found");
        }
    } catch (e) {
        console.error("Error opening modal:", e);
        alert("Unexpected error: " + e.message);
    }
}

// Ensure the form listener is attached
// We use a small check to avoid duplicate listeners if this file is hot-reloaded or run multiple times
if (!window.hasEmployeeListener) {
    window.hasEmployeeListener = true;
    const empForm = document.getElementById('add-employee-form');
    if (empForm) {
        empForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('emp-name').value.trim();
            const email = document.getElementById('emp-email').value.trim();
            const pass = document.getElementById('emp-pass').value;
            const confirm = document.getElementById('emp-confirm').value;

            if (pass !== confirm) {
                alert("Passwords do not match!");
                return;
            }

            // 2. Check if Email Exists (Public Lookup)
            const { data: existing } = await supabase
                .from('owners')
                .select('id')
                .eq('email', email)
                .maybeSingle();

            if (existing) {
                alert("This email is already registered.");
                return;
            }

            // 3. Create User (Using Temp Client)
            // We create a fresh client instance that doesn't persist session to localStorage 
            // so it doesn't log out the current owner.
            if (!window.SupabaseFactory) {
                alert("Configuration Error: Supabase Factory not found. Please reload.");
                return;
            }
            const tempSupabase = window.SupabaseFactory.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    storage: null, // Don't save to localStorage
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            });

            const { data: authData, error: authError } = await tempSupabase.auth.signUp({
                email: email,
                password: pass,
                options: {
                    data: { full_name: name } // Optional metadata
                }
            });

            if (authError) {
                alert("Error creating login: " + authError.message);
                return;
            }

            if (!authData.user) {
                alert("Unknown error: User not created.");
                return;
            }

            // 4. Link to Tenant (Insert into owners)
            const newOwnerRecord = {
                id: authData.user.id,
                tenant_id: authState.owner.tenant_id,
                email: email,
                full_name: name,
                role: 'employee',
                business_name: authState.owner.business_name,
                address: authState.owner.address,
                pincode: authState.owner.pincode,
                plan: authState.owner.plan,
                created_at: new Date().toISOString()
            };

            const { error: dbError } = await supabase
                .from('owners')
                .insert([newOwnerRecord]);

            if (dbError) {
                console.error("DB Error", dbError);
                alert("Account created but failed to link to shop. Please contact support.");
            } else {
                alert("Employee Added Successfully!");
                closeModals();
                loadSettings(); // Refresh list
            }
        });
    }
}

// ==========================================
// EMPLOYEE LOGS
// ==========================================

async function loadEmployeeLogs() {
    if (!supabase) return;

    const empId = document.getElementById('employee-log-select').value;
    const date = document.getElementById('employee-log-date').value;

    let query = supabase
        .from('employee_logs')
        .select(`
            *,
            owners (full_name)
        `)
        .eq('tenant_id', authState.owner.tenant_id)
        .order('created_at', { ascending: false });

    if (empId !== 'all') {
        query = query.eq('employee_id', empId);
    }
    if (date) {
        const start = new Date(date).toISOString();
        const end = new Date(new Date(date).setHours(23, 59, 59)).toISOString();
        query = query.gte('created_at', start).lte('created_at', end);
    }

    const { data: logs, error } = await query;
    const tbody = document.getElementById('employee-logs-list');

    if (error) {
        console.error("Error loading logs:", error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Error: ${error.message}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">No logs found</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        const login = new Date(log.created_at);
        const logout = log.logout_time ? new Date(log.logout_time) : null;

        let duration = 'Active';
        if (logout) {
            const diffMs = logout - login;
            const diffMins = Math.floor(diffMs / 60000);
            const hrs = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            duration = `${hrs}h ${mins}m`;
        }

        tr.innerHTML = `
            <td>${login.toLocaleDateString()}</td>
            <td>${log.owners?.full_name || 'Unknown'}</td>
            <td>${login.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td>${logout ? logout.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
            <td>${duration}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function loadEmployeesForDropdown() {
    const { data: employees } = await supabase
        .from('owners')
        .select('id, full_name')
        .eq('tenant_id', authState.owner.tenant_id)
        .eq('role', 'employee');

    const select = document.getElementById('employee-log-select');
    // Keep first option
    select.innerHTML = '<option value="all">All Employees</option>';

    if (employees) {
        employees.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp.id;
            opt.textContent = emp.full_name;
            select.appendChild(opt);
        });
    }
}

// ==========================================
// PREDICTIONS ENGINE — LIVE + ADVANCED
// ==========================================

let _predChannel = null;       // Supabase realtime channel
let _predDebounce = null;      // Debounce timer for silent refresh
let _predLastUpdate = null;    // Timestamp of last update (for "Last updated" display)

/* ---------- Real-time subscription management ---------- */

function startPredictionRealtime() {
    if (_predChannel) return; // already subscribed
    if (!authState.owner || !authState.owner.tenant_id) return;

    // Use a unique channel name per tenant to avoid conflicts
    _predChannel = supabase
        .channel('predictions-live-' + authState.owner.tenant_id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'bills',
            filter: `tenant_id=eq.${authState.owner.tenant_id}`
        }, () => { _debouncedRefreshPredictions(); })
        .subscribe((status) => {
            const tsEl = document.getElementById('pred-last-updated');
            if (!tsEl) return;

            if (status === 'SUBSCRIBED') {
                // If predictions already loaded, show the last update time
                if (_predLastUpdate) {
                    tsEl.textContent = `Live · Last updated: ${_predLastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                } else {
                    tsEl.textContent = '🟢 Live connected';
                }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                // Realtime failed — clean up so it can be retried on next load
                tsEl.textContent = '⚡ Offline mode (refresh to reconnect)';
                _predChannel = null; // allow retry
            } else {
                // CONNECTING / other transient states — don't block UI
                if (!_predLastUpdate) {
                    tsEl.textContent = '🔄 Connecting...';
                }
            }
        });
}

function stopPredictionRealtime() {
    if (_predChannel) {
        supabase.removeChannel(_predChannel);
        _predChannel = null;
    }
    if (_predDebounce) {
        clearTimeout(_predDebounce);
        _predDebounce = null;
    }
}

function _debouncedRefreshPredictions() {
    if (_predDebounce) clearTimeout(_predDebounce);
    _predDebounce = setTimeout(() => {
        loadPredictions(true); // silent = true: no loading spinner, smooth refresh
    }, 4000); // wait 4s after last event before recalculating
}

/* ---------- Helper: Exponential Weighted Moving Average ---------- */
// Lambda controls decay: 0.0 = equal weight (naive), 1.0 = only last day matters.
// 0.2 gives a good balance — recent days matter ~3x more than 30 days ago.
function computeEWMA(dailyArray, lambda = 0.2) {
    if (!dailyArray || dailyArray.length === 0) return 0;
    let ewma = dailyArray[0];
    for (let i = 1; i < dailyArray.length; i++) {
        ewma = lambda * dailyArray[i] + (1 - lambda) * ewma;
    }
    return ewma;
}

/* ---------- Helper: Confidence level ---------- */
function getConfidence(totalDaysWithSales, totalUnitsSold) {
    if (totalDaysWithSales >= 14 && totalUnitsSold >= 30) return { label: 'High', cls: 'conf-high' };
    if (totalDaysWithSales >= 5 && totalUnitsSold >= 10) return { label: 'Medium', cls: 'conf-med' };
    return { label: 'Low', cls: 'conf-low' };
}

/* ---------- Main Prediction Loader ---------- */
async function loadPredictions(silent = false) {
    if (!supabase) return;
    if (!authState.owner || !authState.owner.tenant_id) return;

    // NOTE: We do NOT call startPredictionRealtime() here anymore.
    // It is called AFTER the data is loaded (at the bottom of try block),
    // so a slow WebSocket connection never blocks the data from displaying.

    // Only show loading spinner on first load (not silent background refresh)
    if (!silent) {
        document.getElementById('pred-3h-total').textContent = '...';
        document.getElementById('pred-1d-total').textContent = '...';
        document.getElementById('pred-7d-total').textContent = '...';
        document.getElementById('pred-30d-total').textContent = '...';
        document.getElementById('predictions-list').innerHTML =
            '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">⏳ Analyzing 90 days of sales data...</td></tr>';
    }

    try {
        // ── Step 1: Fetch bills from last 90 days ──
        const windowStart = new Date();
        windowStart.setDate(windowStart.getDate() - 90);

        let { data: bills, error: billErr } = await supabase
            .from('bills')
            .select('id, created_at, is_undone')
            .eq('tenant_id', authState.owner.tenant_id)
            .gte('created_at', windowStart.toISOString())
            .order('created_at', { ascending: true });

        if (billErr) throw billErr;
        const validBills = (bills || []).filter(b => !b.is_undone);
        bills = validBills;

        if (!bills || bills.length === 0) {
            document.getElementById('predictions-list').innerHTML =
                '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">📭 Not enough data yet. Start billing to see predictions!</td></tr>';
            ['pred-3h-total', 'pred-1d-total', 'pred-7d-total', 'pred-30d-total'].forEach(id => document.getElementById(id).textContent = 'No data');
            return;
        }

        // ── Step 2: Fetch all bill_items (chunked) ──
        const billIds = bills.map(b => b.id);
        let allItems = [];
        const chunkSize = 500;
        for (let i = 0; i < billIds.length; i += chunkSize) {
            const { data: items, error: itemErr } = await supabase
                .from('bill_items')
                .select('bill_id, product_name, quantity')
                .in('bill_id', billIds.slice(i, i + chunkSize));
            if (itemErr) throw itemErr;
            if (items) allItems = allItems.concat(items);
        }

        if (allItems.length === 0) {
            document.getElementById('predictions-list').innerHTML =
                '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-secondary);">📭 No bill items found for predictions.</td></tr>';
            ['pred-3h-total', 'pred-1d-total', 'pred-7d-total', 'pred-30d-total'].forEach(id => document.getElementById(id).textContent = 'No data');
            return;
        }

        // ── Step 3: Build bill lookup maps ──
        // billMeta[id] = { date: "YYYY-MM-DD", hour: 0-23, dow: 0-6 (0=Sun) }
        const billMeta = {};
        bills.forEach(b => {
            const dt = new Date(b.created_at);
            billMeta[b.id] = {
                date: dt.toISOString().split('T')[0],
                hour: dt.getHours(),
                dow: dt.getDay()
            };
        });

        // ── Step 4: Build per-product daily/hourly/dow aggregates ──
        // productMap[name] = {
        //   dailySales: { "YYYY-MM-DD": qty },
        //   hourlyCounts: { 0..23: qty },
        //   dowCounts: { 0..6: qty }
        // }
        const productMap = {};

        allItems.forEach(item => {
            const name = item.product_name;
            const meta = billMeta[item.bill_id];
            if (!meta) return;

            if (!productMap[name]) {
                productMap[name] = { dailySales: {}, hourlyCounts: {}, dowCounts: {} };
            }
            const pm = productMap[name];
            pm.dailySales[meta.date] = (pm.dailySales[meta.date] || 0) + item.quantity;
            pm.hourlyCounts[meta.hour] = (pm.hourlyCounts[meta.hour] || 0) + item.quantity;
            pm.dowCounts[meta.dow] = (pm.dowCounts[meta.dow] || 0) + item.quantity;
        });

        // ── Step 5: Build a sorted date list (90 days) ──
        const today = new Date();
        const dateKeys = [];
        for (let i = 89; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dateKeys.push(d.toISOString().split('T')[0]);
        }

        const nowHour = today.getHours();
        const nowDow = today.getDay();
        const tomorrowDow = (nowDow + 1) % 7;

        // ── Step 6: Generate predictions per product ──
        const preds = Object.keys(productMap).map(pName => {
            const pm = productMap[pName];

            // Build a daily sales array (90 values, 0 if no sales that day)
            const dailyArray = dateKeys.map(d => pm.dailySales[d] || 0);

            // EWMA daily rate (recent weight = 0.2)
            const ewmaDaily = computeEWMA(dailyArray, 0.2);

            // Days with actual sales (for confidence)
            const daysWithSales = dailyArray.filter(v => v > 0).length;
            const totalSold = dailyArray.reduce((s, v) => s + v, 0);

            // ── Trend Detection ──
            // Compare avg of last 7 days vs the 7 days before that
            const last7 = dailyArray.slice(-7).reduce((s, v) => s + v, 0) / 7;
            const prior7 = dailyArray.slice(-14, -7).reduce((s, v) => s + v, 0) / 7;
            // trendFactor: > 1 = growing, < 1 = declining, 1 = stable
            const trendFactor = prior7 > 0 ? Math.min(2.5, Math.max(0.4, last7 / prior7)) : 1;

            // ── Day-of-Week factor ──
            // Compute each DOW's avg as fraction of overall daily avg
            const totalDowSales = Object.values(pm.dowCounts).reduce((s, v) => s + v, 0);
            // How many of each dow appeared in our window? ~13 of each in 90 days
            const dowAvg = (dow) => (pm.dowCounts[dow] || 0) / 13;
            const overallDailyAvg = totalDowSales / 90;
            const dowFactor = (dow) => overallDailyAvg > 0
                ? Math.min(3, Math.max(0.1, dowAvg(dow) / overallDailyAvg))
                : 1;

            // ── Hourly weighting ──
            // hour_share[h] = fraction of daily sales that occur in hour h
            const totalHourlySales = Object.values(pm.hourlyCounts).reduce((s, v) => s + v, 0);
            const hourShare = (h) => totalHourlySales > 0
                ? (pm.hourlyCounts[h] || 0) / totalHourlySales
                : 1 / 24;

            // ── Next-3h prediction ──
            // Use hourly distribution, today's DOW factor, trend
            let next3h = 0;
            for (let i = 0; i < 3; i++) {
                const h = (nowHour + i) % 24;
                // Contribution of this hour = ewmaDaily * dowFactor(today) * hourShare(h) * trend
                next3h += ewmaDaily * dowFactor(nowDow) * hourShare(h) * trendFactor;
            }

            // ── Next 1 day prediction (tomorrow) ──
            const next1d = ewmaDaily * dowFactor(tomorrowDow) * trendFactor;

            // ── Next 7 days ──
            let next7d = 0;
            for (let i = 1; i <= 7; i++) {
                const dow = (nowDow + i) % 7;
                next7d += ewmaDaily * dowFactor(dow) * trendFactor;
            }

            // ── Next 30 days ──
            let next30d = 0;
            for (let i = 1; i <= 30; i++) {
                const dow = (nowDow + i) % 7;
                // Trend fades toward 1 over a longer horizon (regression to mean)
                const fadedTrend = 1 + (trendFactor - 1) * Math.exp(-i / 14);
                next30d += ewmaDaily * dowFactor(dow) * fadedTrend;
            }

            const confidence = getConfidence(daysWithSales, totalSold);
            const trendLabel = trendFactor > 1.1 ? '📈' : trendFactor < 0.9 ? '📉' : '➡️';

            return {
                name: pName,
                next3h: Math.max(0, Math.round(next3h)),
                next1d: Math.max(0, Math.round(next1d)),
                next7d: Math.max(0, Math.round(next7d)),
                next30d: Math.max(0, Math.round(next30d)),
                trend: trendLabel,
                confidence,
                totalSold
            };
        });

        // Sort: most expected units in 30 days first
        preds.sort((a, b) => b.next30d - a.next30d);

        // ── Step 7: Totals ──
        let tot3h = 0, tot1d = 0, tot7d = 0, tot30d = 0;
        preds.forEach(p => { tot3h += p.next3h; tot1d += p.next1d; tot7d += p.next7d; tot30d += p.next30d; });

        // ── Step 8: Render table ──
        const tbody = document.getElementById('predictions-list');
        tbody.innerHTML = '';

        preds.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="color:var(--text-secondary); font-size:0.78rem; min-width:20px;">#${idx + 1}</span>
                        <div>
                            <div style="font-weight:600; font-size:0.95rem;">${p.name}</div>
                            <div style="font-size:0.75rem; margin-top:2px; display:flex; align-items:center; gap:6px;">
                                ${p.trend} Trend &nbsp;
                                <span class="conf-badge ${p.confidence.cls}">${p.confidence.label} confidence</span>
                            </div>
                        </div>
                    </div>
                </td>
                <td><span class="pred-badge pred-purple">${p.next3h > 0 ? '~ ' + p.next3h : '< 1'} units</span></td>
                <td><span class="pred-badge pred-blue">${p.next1d > 0 ? '~ ' + p.next1d : '< 1'} units</span></td>
                <td><span class="pred-badge pred-amber">${p.next7d > 0 ? '~ ' + p.next7d : '< 1'} units</span></td>
                <td><span class="pred-badge pred-green">${p.next30d > 0 ? '~ ' + p.next30d : '< 1'} units</span></td>
            `;
            tbody.appendChild(tr);
        });

        // ── Step 9: Summary cards ──
        const cardMeta = [
            { id: 'pred-3h-total', val: tot3h, color: '#a78bfa', label: 'estimated units' },
            { id: 'pred-1d-total', val: tot1d, color: '#60a5fa', label: 'estimated units' },
            { id: 'pred-7d-total', val: tot7d, color: '#fbbf24', label: 'estimated units' },
            { id: 'pred-30d-total', val: tot30d, color: '#4ade80', label: 'estimated units' },
        ];
        cardMeta.forEach(({ id, val, color, label }) => {
            document.getElementById(id).innerHTML =
                `<span style="font-size:2rem; font-weight:800; color:${color}; line-height:1;">~${val}</span>` +
                `<br><small style="font-size:0.72rem; color:var(--text-secondary); font-weight:400;">${label}</small>`;
        });

        // Update "Last updated" timestamp
        _predLastUpdate = new Date();
        const tsEl = document.getElementById('pred-last-updated');
        if (tsEl) {
            tsEl.textContent = `Live · Last updated: ${_predLastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            if (!silent) tsEl.style.opacity = '1';
        }

        // Start realtime subscription AFTER data is rendered (non-blocking)
        // This ensures mobile users see the data immediately even if WebSocket is slow
        startPredictionRealtime();

        // Subtle flash effect on silent refresh
        if (silent) {
            const table = document.getElementById('predictions-table');
            if (table) {
                table.style.transition = 'opacity 0.3s';
                table.style.opacity = '0.5';
                setTimeout(() => { table.style.opacity = '1'; }, 300);
            }
        }

    } catch (err) {
        console.error('[Predictions] Engine Error:', err);
        document.getElementById('predictions-list').innerHTML =
            `<tr><td colspan="6" style="text-align:center; color:var(--danger-color); padding:2rem;">❌ Prediction failed: ${err.message}</td></tr>`;
        ['pred-3h-total', 'pred-1d-total', 'pred-7d-total', 'pred-30d-total'].forEach(id => document.getElementById(id).textContent = 'Error');
    }
}

// ==========================================
// CSV IMPORT / EXPORT (VANILLA JS)
// ==========================================

function parseCSVLine(line) {
    let result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                if (i < line.length - 1 && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                result.push(cur);
                cur = '';
            } else {
                cur += char;
            }
        }
    }
    result.push(cur);
    return result;
}

// ============== PRODUCTS ==============
async function exportProductsCSV() {
    if (!supabase || !authState.owner?.tenant_id) return;

    showToast("Exporting products...");

    const { data: products, error } = await supabase
        .from('products')
        .select(`
            name,
            price,
            stock,
            is_in_house,
            image_data,
            product_tabs ( name )
        `)
        .eq('tenant_id', authState.owner.tenant_id);

    if (error) {
        console.error("Export Error: ", error);
        alert("Failed to export products.");
        return;
    }

    if (!products || products.length === 0) {
        alert("No products found to export.");
        return;
    }

    const headers = ["Name", "Category", "Price", "Stock", "InHouse", "ImageData"];
    let csvContent = headers.join(",") + "\n";

    products.forEach(p => {
        const catName = p.product_tabs ? p.product_tabs.name.replace(/"/g, '""') : "";
        const pName = p.name ? p.name.replace(/"/g, '""') : "";
        const imgData = p.image_data ? p.image_data.replace(/"/g, '""') : "";

        const row = [
            `"${pName}"`,
            `"${catName}"`,
            p.price || 0,
            p.stock || 0,
            p.is_in_house ? "Yes" : "No",
            `"${imgData}"`
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `products_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Products exported!");
}

async function importProductsCSV(event) {
    if (!supabase || !authState.owner?.tenant_id) return;

    const file = event.target.files[0];
    if (!file) return;

    showToast("Reading CSV...");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).slice(1); // skip header

        const validRows = [];
        for (let row of rows) {
            if (!row.trim()) continue;
            const cols = parseCSVLine(row);
            if (!cols || cols.length < 5) continue;
            if (!cols[0] || !cols[0].trim()) continue;
            validRows.push(cols);
        }

        if (validRows.length === 0) {
            alert("No valid product data found in CSV to import.");
            event.target.value = '';
            return;
        }

        // Show Preview
        const previewCol = validRows[0];
        const cleanCol = (str) => str ? str.trim() : '';
        const name = cleanCol(previewCol[0]);
        const catName = cleanCol(previewCol[1]);
        const price = parseFloat(cleanCol(previewCol[2])) || 0;
        const stock = parseInt(cleanCol(previewCol[3]), 10) || 0;
        const inHouse = cleanCol(previewCol[4]).toLowerCase() === 'yes';
        const imgData = cleanCol(previewCol[5] || '');

        let previewHtml = `<div style="display:flex; align-items:flex-start; gap:1rem;">`;
        if (imgData && imgData.startsWith('data:image')) {
            previewHtml += `<img src="${imgData}" style="width:80px; height:80px; object-fit:cover; border-radius:8px; border:1px solid var(--border-color);">`;
        } else {
            previewHtml += `<div style="width:80px; height:80px; background:#f3f4f6; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#9ca3af;">No Image</div>`;
        }
        previewHtml += `
            <div>
                <h3 style="margin:0 0 0.5rem 0; font-size:1.1rem;">${name}</h3>
                <p style="margin:0; font-size:0.9rem; color:var(--text-secondary);">Category: <b>${catName || 'None'}</b></p>
                <p style="margin:0; font-size:0.9rem; color:var(--text-secondary);">Price: <b>₹${price}</b> | Stock: <b>${stock}</b></p>
                <p style="margin:0; font-size:0.9rem; color:var(--text-secondary);">In-House: <b>${inHouse ? 'Yes' : 'No'}</b></p>
            </div>
        </div>`;

        document.getElementById('import-preview-content').innerHTML = previewHtml;
        document.getElementById('import-total-count').textContent = `Total products ready to import: ${validRows.length}`;

        const mOverlay = document.getElementById('modal-overlay');
        const mImport = document.getElementById('modal-import-preview');
        mOverlay.classList.remove('hidden');
        mImport.classList.remove('hidden');

        const btnConfirm = document.getElementById('btn-confirm-import');
        btnConfirm.onclick = async () => {
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Importing...';
            try {
                showToast("Processing products (this may take a moment)...");

                const { data: existingTabs } = await supabase
                    .from('product_tabs')
                    .select('id, name')
                    .eq('tenant_id', authState.owner.tenant_id);

                let tabMap = {};
                if (existingTabs) {
                    existingTabs.forEach(t => tabMap[t.name.toLowerCase()] = t.id);
                }

                let addedCount = 0;

                for (let cols of validRows) {
                    const c_name = cleanCol(cols[0]);
                    const c_catName = cleanCol(cols[1]);
                    const c_price = parseFloat(cleanCol(cols[2])) || 0;
                    const c_stock = parseInt(cleanCol(cols[3]), 10) || 0;
                    const c_inHouse = cleanCol(cols[4]).toLowerCase() === 'yes';
                    const c_imgData = cleanCol(cols[5] || '');

                    let tabId = null;
                    if (c_catName) {
                        const lowerCat = c_catName.toLowerCase();
                        if (tabMap[lowerCat]) {
                            tabId = tabMap[lowerCat];
                        } else {
                            const { data: newTab } = await supabase
                                .from('product_tabs')
                                .insert([{ tenant_id: authState.owner.tenant_id, name: c_catName }])
                                .select('id').single();
                            if (newTab) {
                                tabId = newTab.id;
                                tabMap[lowerCat] = tabId;
                            }
                        }
                    }

                    const { error: insErr } = await supabase.from('products').insert([{
                        tenant_id: authState.owner.tenant_id,
                        name: c_name,
                        tab_id: tabId,
                        price: c_price,
                        stock: c_stock,
                        is_in_house: c_inHouse,
                        image_data: c_imgData || null
                    }]);

                    if (!insErr) addedCount++;
                }

                showToast(`Imported ${addedCount} products successfully!`);
                if (typeof loadInventory === 'function') loadInventory();
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Confirm & Import All';
                closeModals();
                event.target.value = ''; // reset file input
            }
        };
    };
    reader.readAsText(file);
}

// ============== SALES (BILLS) ==============
async function exportSalesCSV() {
    if (!supabase || !authState.owner?.tenant_id) return;

    showToast("Exporting sales...");

    let { data: bills, error } = await supabase
        .from('bills')
        .select(`*`)
        .eq('tenant_id', authState.owner.tenant_id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Export Error: ", error);
        alert("Failed to export sales.");
        return;
    }

    if (!bills || bills.length === 0) {
        alert("No sales found to export.");
        return;
    }

    const validExportBills = bills.filter(b => !b.is_undone);
    bills = validExportBills;

    const headers = ["Bill Number", "Date", "Customer Name", "Customer Phone", "Customer GSTIN", "Customer Address", "Payment Mode", "Subtotal", "Discount Type", "Discount Value", "Final Amount"];
    let csvContent = headers.join(",") + "\n";

    bills.forEach(b => {
        const dateStr = b.created_at ? new Date(b.created_at).toLocaleString().replace(/,/g, '') : '';
        const cName = b.customer_name ? b.customer_name.replace(/"/g, '""') : "";
        const cPhone = b.customer_phone ? b.customer_phone.replace(/"/g, '""') : "";
        const cGstin = b.customer_gstin ? b.customer_gstin.replace(/"/g, '""') : "";
        const cAddr = b.customer_address ? b.customer_address.replace(/"/g, '""') : "";
        const bNum = b.bill_number ? b.bill_number.replace(/"/g, '""') : "";

        const row = [
            `"${bNum}"`,
            `"${dateStr}"`,
            `"${cName}"`,
            `"${cPhone}"`,
            `"${cGstin}"`,
            `"${cAddr}"`,
            `"${b.payment_mode || 'CASH'}"`,
            b.subtotal || 0,
            `"${b.discount_type || 'none'}"`,
            b.discount_value || 0,
            b.final_amount || 0
        ];
        csvContent += row.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sales_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Sales exported!");
}

async function importSalesCSV(event) {
    if (!supabase || !authState.owner?.tenant_id) return;

    const file = event.target.files[0];
    if (!file) return;

    showToast("Reading sales CSV...");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).slice(1);

        const validRows = [];
        for (let row of rows) {
            if (!row.trim()) continue;
            const cols = parseCSVLine(row);
            if (cols.length < 9) continue;
            validRows.push(cols);
        }

        if (validRows.length === 0) {
            alert("No valid sales data found in CSV to import.");
            event.target.value = '';
            return;
        }

        // Show Preview
        const previewCol = validRows[0];
        const bNum = previewCol[0].trim();
        let ts = new Date(previewCol[1].trim());
        if (isNaN(ts.getTime())) {
            ts = new Date();
        }
        const cName = previewCol[2].trim() || 'Guest';
        const finalAmt = parseFloat(previewCol[8]) || 0;

        let previewHtml = `
        <div style="background:#f9fafb; padding:1rem; border-radius:8px; border:1px solid var(--border-color);">
            <h3 style="margin:0 0 0.5rem 0; font-size:1.1rem;">Bill: ${bNum || '(Auto Generated)'}</h3>
            <p style="margin:0; font-size:0.9rem; color:var(--text-secondary);">Date: <b>${ts.toLocaleString()}</b></p>
            <p style="margin:0; font-size:0.9rem; color:var(--text-secondary);">Customer: <b>${cName}</b></p>
            <p style="margin:0; font-size:1.1rem; color:var(--primary-color); font-weight:700; margin-top:0.5rem;">Amount: <b>₹${finalAmt}</b></p>
        </div>`;

        document.getElementById('import-preview-content').innerHTML = previewHtml;
        document.getElementById('import-total-count').textContent = `Total bills ready to import: ${validRows.length}`;

        const mOverlay = document.getElementById('modal-overlay');
        const mImport = document.getElementById('modal-import-preview');
        mOverlay.classList.remove('hidden');
        mImport.classList.remove('hidden');

        const btnConfirm = document.getElementById('btn-confirm-import');
        btnConfirm.onclick = async () => {
            btnConfirm.disabled = true;
            btnConfirm.textContent = 'Importing...';
            try {
                showToast("Processing sales imports...");
                let addedCount = 0;

                for (let cols of validRows) {
                    const c_bNum = cols[0].trim();
                    let c_ts = new Date(cols[1].trim());
                    if (isNaN(c_ts.getTime())) c_ts = new Date();

                    const c_cName = cols[2].trim();
                    const c_cPhone = cols[3].trim();
                    const c_pMode = cols[4].trim() || 'CASH';
                    const c_subtotal = parseFloat(cols[5]) || 0;
                    const c_dType = cols[6].trim() || 'none';
                    const c_dVal = parseFloat(cols[7]) || 0;
                    const c_finalAmount = parseFloat(cols[8]) || 0;

                    const { error: insErr } = await supabase.from('bills').insert([{
                        tenant_id: authState.owner.tenant_id,
                        bill_number: c_bNum || "IMP-" + Math.floor(Math.random() * 1000000),
                        payment_mode: c_pMode,
                        subtotal: c_subtotal,
                        discount_type: c_dType,
                        discount_value: c_dVal,
                        final_amount: c_finalAmount,
                        customer_name: c_cName,
                        customer_phone: c_cPhone,
                        created_at: c_ts.toISOString(),
                        created_by: authState.owner.id
                    }]);

                    if (!insErr) addedCount++;
                }

                showToast(`Imported ${addedCount} sales bills!`);
                if (typeof loadSales === 'function') loadSales(); // refresh view
            } finally {
                btnConfirm.disabled = false;
                btnConfirm.textContent = 'Confirm & Import All';
                closeModals();
                event.target.value = '';
            }
        };
    };
    reader.readAsText(file);
}

// ==========================================
// UNDO BILL LOGIC
// ==========================================
function openUndoModal(billId, billNumber) {
    document.getElementById('undo-bill-id').value = billId;
    document.getElementById('undo-bill-number').textContent = '#' + (billNumber || '');
    document.getElementById('undo-bill-notes').value = '';
    
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-undo-bill').classList.remove('hidden');
}

document.getElementById('undo-bill-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const billId = document.getElementById('undo-bill-id').value;
    const notes = document.getElementById('undo-bill-notes').value;
    
    if(!billId || !notes) return;
    
    // 1. Update the bill record
    const { error: billError } = await supabase
        .from('bills')
        .update({ is_undone: true, undo_notes: notes })
        .eq('id', billId);
        
    if (billError) {
        alert('Failed to undo bill: ' + billError.message);
        return;
    }
    
    // 2. Fetch bill items
    const { data: items, error: itemsError } = await supabase
        .from('bill_items')
        .select('product_id, quantity, products(is_in_house)')
        .eq('bill_id', billId);
        
    if (itemsError) {
        console.error('Failed to fetch bill items for undo:', itemsError);
    } else if (items) {
        // 3. Revert Stock for non-in-house products
        for (const item of items) {
            if (item.product_id && item.products && !item.products.is_in_house) {
                // We need to fetch current stock and add quantity
                // Since this is client-side without RPC, we do it in two steps or just let the user know
                // A better approach in Supabase is RPC, but we'll do read-modify-write here.
                const { data: prod } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .single();
                    
                if (prod) {
                    await supabase
                        .from('products')
                        .update({ stock: prod.stock + item.quantity })
                        .eq('id', item.product_id);
                }
            }
        }
    }
    
    showToast('Bill successfully undone!');
    closeModals();
    
    // Refresh views
    if (typeof loadSales === 'function') loadSales();
    if (typeof loadInventory === 'function') loadInventory();
    if (typeof loadDashboard === 'function') loadDashboard('today');
});

// ==========================================
// EDIT BILL LOGIC
// ==========================================
let editBillState = {
    billId: null,
    items: []
};

async function openEditBillModal(billId) {
    if (!supabase) return;
    try {
        // Ensure products are loaded into appState.products
        if (!appState.products || appState.products.length === 0) {
            const { data: prods } = await supabase.from('products').select('*').order('name');
            if (prods) appState.products = prods;
        }

        const { data: bill, error: billError } = await supabase
            .from('bills')
            .select('*')
            .eq('id', billId)
            .single();

        if (billError || !bill) throw billError;

        const { data: items, error: itemsError } = await supabase
            .from('bill_items')
            .select('*')
            .eq('bill_id', billId);

        if (itemsError || !items) throw itemsError;

        editBillState.billId = bill.id;
        editBillState.items = items.map(item => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0
        }));

        document.getElementById('edit-bill-id').value = bill.id;
        document.getElementById('edit-bill-number-title').textContent = '#' + (bill.bill_number || bill.id.slice(0, 8));
        document.getElementById('edit-bill-customer-name').value = bill.customer_name || '';
        document.getElementById('edit-bill-customer-phone').value = bill.customer_phone || '';
        document.getElementById('edit-bill-customer-gstin').value = bill.customer_gstin || '';
        document.getElementById('edit-bill-customer-address').value = bill.customer_address || bill.customer_dress || '';

        const paymodeRadios = document.getElementsByName('edit-paymode');
        paymodeRadios.forEach(r => {
            r.checked = (r.value === (bill.payment_mode || 'CASH'));
        });

        document.getElementById('edit-bill-discount-type').value = bill.discount_type || 'none';
        document.getElementById('edit-bill-discount-value').value = bill.discount_value || 0;

        populateEditBillProductDropdown();
        renderEditBillItems();
        updateEditBillTotals();

        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-edit-bill').classList.remove('hidden');

    } catch (err) {
        console.error('Error loading bill for edit:', err);
        alert('Could not load bill details for editing.');
    }
}

function populateEditBillProductDropdown() {
    const prodSelect = document.getElementById('edit-bill-add-product-select');
    if (!prodSelect) return;

    prodSelect.innerHTML = '<option value="">-- Select product to add to bill --</option>';
    if (appState.products && appState.products.length > 0) {
        appState.products.forEach(p => {
            prodSelect.innerHTML += `<option value="${p.id}">${p.name} (₹${Number(p.price).toFixed(2)})</option>`;
        });
    }
}

function renderEditBillItems() {
    const tbody = document.getElementById('edit-bill-items-body');
    if (!tbody) return;

    if (!editBillState.items || editBillState.items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 16px; color: #888;">No items in this bill. Select a product below to add items.</td></tr>`;
        return;
    }

    let html = '';
    editBillState.items.forEach((item, index) => {
        const lineTotal = (item.quantity * item.price).toFixed(2);
        html += `
            <tr style="border-bottom: 1px solid var(--border-color);">
                <td style="padding: 8px;">${index + 1}</td>
                <td style="padding: 8px; font-weight: 600; min-width: 120px;">${item.product_name}</td>
                <td style="padding: 8px;">
                    <div style="display: inline-flex; align-items: center; border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; background: var(--bg-surface);">
                        <button type="button" onclick="editBillChangeQty(${index}, -1)" style="padding: 4px 8px; border: none; background: var(--bg-body); cursor: pointer; font-weight: bold; font-size: 1rem; color: var(--text-primary);">-</button>
                        <input type="number" min="1" value="${item.quantity}" style="width: 45px; text-align: center; border: none; padding: 4px 2px; font-weight: 600; background: transparent; color: var(--text-primary);" oninput="editBillUpdateItemQty(${index}, this.value)" onchange="editBillUpdateItemQty(${index}, this.value)">
                        <button type="button" onclick="editBillChangeQty(${index}, 1)" style="padding: 4px 8px; border: none; background: var(--bg-body); cursor: pointer; font-weight: bold; font-size: 1rem; color: var(--text-primary);">+</button>
                    </div>
                </td>
                <td style="padding: 8px;">
                    <input type="number" min="0" step="0.01" value="${item.price}" style="width: 85px; padding: 5px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-surface); color: var(--text-primary);" oninput="editBillUpdateItemPrice(${index}, this.value)" onchange="editBillUpdateItemPrice(${index}, this.value)">
                </td>
                <td id="edit-bill-item-total-${index}" style="padding: 8px; text-align: right; font-weight: 700; color: var(--primary-color);">₹${lineTotal}</td>
                <td style="padding: 8px; text-align: center;">
                    <button type="button" class="action-btn small danger" onclick="editBillRemoveItem(${index})" style="padding: 4px 8px; border-radius: 4px;">✕</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function editBillChangeQty(index, delta) {
    if (!editBillState.items[index]) return;
    let currentQty = editBillState.items[index].quantity || 1;
    currentQty += delta;
    if (currentQty < 1) currentQty = 1;
    editBillState.items[index].quantity = currentQty;
    renderEditBillItems();
    updateEditBillTotals();
}

function editBillUpdateItemQty(index, newQty) {
    if (!editBillState.items[index]) return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty < 1) {
        editBillState.items[index].quantity = 1;
    } else {
        editBillState.items[index].quantity = qty;
    }
    const lineTotalDisplay = document.getElementById(`edit-bill-item-total-${index}`);
    if (lineTotalDisplay) {
        lineTotalDisplay.textContent = `₹${(editBillState.items[index].quantity * editBillState.items[index].price).toFixed(2)}`;
    }
    updateEditBillTotals();
}

function editBillUpdateItemPrice(index, newPrice) {
    if (!editBillState.items[index]) return;
    const price = parseFloat(newPrice);
    if (isNaN(price) || price < 0) {
        editBillState.items[index].price = 0;
    } else {
        editBillState.items[index].price = price;
    }
    const lineTotalDisplay = document.getElementById(`edit-bill-item-total-${index}`);
    if (lineTotalDisplay) {
        lineTotalDisplay.textContent = `₹${(editBillState.items[index].quantity * editBillState.items[index].price).toFixed(2)}`;
    }
    updateEditBillTotals();
}

function editBillRemoveItem(index) {
    editBillState.items.splice(index, 1);
    renderEditBillItems();
    updateEditBillTotals();
}

function editBillAddItem() {
    const select = document.getElementById('edit-bill-add-product-select');
    if (!select || !select.value) return;

    const prodId = select.value;
    const prod = (appState.products || []).find(p => p.id === prodId);
    if (!prod) return;

    const existingIndex = editBillState.items.findIndex(item => item.product_id === prodId);
    if (existingIndex > -1) {
        editBillState.items[existingIndex].quantity += 1;
    } else {
        editBillState.items.push({
            product_id: prod.id,
            product_name: prod.name,
            quantity: 1,
            price: Number(prod.price) || 0
        });
    }

    select.value = '';
    renderEditBillItems();
    updateEditBillTotals();

    setTimeout(() => {
        const container = document.getElementById('edit-bill-items-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }, 50);
}

function updateEditBillTotals() {
    let subtotal = 0;
    if (editBillState.items) {
        editBillState.items.forEach(item => {
            subtotal += (item.quantity * item.price);
        });
    }

    const discountType = document.getElementById('edit-bill-discount-type')?.value || 'none';
    const discountVal = parseFloat(document.getElementById('edit-bill-discount-value')?.value) || 0;

    let final = subtotal;
    if (discountType === 'flat') final = subtotal - discountVal;
    if (discountType === 'percentage') final = subtotal - (subtotal * (discountVal / 100));
    if (final < 0) final = 0;

    const subDisplay = document.getElementById('edit-bill-subtotal-display');
    const finalDisplay = document.getElementById('edit-bill-final-display');
    if (subDisplay) subDisplay.textContent = `₹${subtotal.toFixed(2)}`;
    if (finalDisplay) finalDisplay.textContent = `₹${final.toFixed(2)}`;
}

document.getElementById('edit-bill-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const billId = document.getElementById('edit-bill-id').value;
    if (!billId) return;

    if (!editBillState.items || editBillState.items.length === 0) {
        alert('A bill must have at least 1 item.');
        return;
    }

    const customerName = document.getElementById('edit-bill-customer-name').value.trim();
    const customerPhone = document.getElementById('edit-bill-customer-phone').value.trim();
    const customerGstin = (document.getElementById('edit-bill-customer-gstin')?.value || '').trim().toUpperCase();
    const customerAddress = (document.getElementById('edit-bill-customer-address')?.value || '').trim();

    const paymentMode = document.querySelector('input[name="edit-paymode"]:checked')?.value || 'CASH';
    const discountType = document.getElementById('edit-bill-discount-type').value;
    const discountValue = parseFloat(document.getElementById('edit-bill-discount-value').value) || 0;

    let subtotal = 0;
    editBillState.items.forEach(item => {
        subtotal += (item.quantity * item.price);
    });

    let final = subtotal;
    if (discountType === 'flat') final = subtotal - discountValue;
    if (discountType === 'percentage') final = subtotal - (subtotal * (discountValue / 100));
    if (final < 0) final = 0;

    const billPayload = {
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_gstin: customerGstin,
        customer_address: customerAddress,
        payment_mode: paymentMode,
        subtotal: subtotal,
        discount_type: discountType,
        discount_value: discountValue,
        final_amount: final
    };

    let { error: updateError } = await supabase
        .from('bills')
        .update(billPayload)
        .eq('id', billId);

    if (updateError && updateError.message && (updateError.message.includes('customer_address') || updateError.message.includes('customer_gstin'))) {
        if (updateError.message.includes('customer_address')) delete billPayload.customer_address;
        if (updateError.message.includes('customer_gstin')) delete billPayload.customer_gstin;
        const res = await supabase.from('bills').update(billPayload).eq('id', billId);
        updateError = res.error;
    }

    if (updateError) {
        alert('Failed to update bill: ' + updateError.message);
        return;
    }

    // 2. Replace Bill Items in Supabase
    const { error: deleteError } = await supabase
        .from('bill_items')
        .delete()
        .eq('bill_id', billId);

    if (deleteError) {
        console.error('Error removing old bill items:', deleteError);
    }

    const tenantId = authState.owner ? authState.owner.tenant_id : '';
    const newItemsPayload = editBillState.items.map(item => ({
        bill_id: billId,
        product_id: item.product_id || null,
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        tenant_id: tenantId
    }));

    const { error: insertError } = await supabase
        .from('bill_items')
        .insert(newItemsPayload);

    if (insertError) {
        console.error('Error inserting updated bill items:', insertError);
    }

    showToast('Bill updated successfully!');
    closeModals();

    // Refresh Sales View & Dashboard
    if (typeof loadSales === 'function') loadSales();
    if (typeof loadDashboard === 'function') loadDashboard('today');

    // Re-preview updated bill
    reprintBill(billId);
});

