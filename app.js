// Supabase Configuration
const SUPABASE_URL = 'https://zbnnctvggpupdnjmydcu.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Uc7k0lfdHFzBjWT-3o36w_ydCDXOT8';

let supabase = null;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log("Supabase initialized successfully.");
    } else {
        console.warn("Supabase library not found. Running in Local Mode.");
    }
} catch (e) {
    console.error("Supabase init error:", e);
}

// State Management
const COLUMNS = [
    { id: 'quote', title: 'Báo Giá', color: 'var(--tag-quote)' },
    { id: 'confirm', title: 'Chốt Đơn', color: 'var(--tag-confirm)' },
    { id: 'deliver', title: 'Đã Giao Hàng', color: 'var(--tag-deliver)' },
    { id: 'paid', title: 'Thu Tiền Hoàn Tất', color: 'var(--tag-paid)' },
    { id: 'debt', title: 'Công Nợ Chưa Thanh Toán', color: 'var(--tag-debt)' },
    { id: 'completed', title: 'Hoàn Tất Đơn Hàng', color: '#0F766E' }
];

let cards = [];

// DOM Elements
const getEl = id => document.getElementById(id);
const boardEl = getEl('board');
const btnUpload = getEl('btn-upload');
const btnDashboard = getEl('btn-dashboard');
const btnSettings = getEl('btn-settings');
const uploadModal = getEl('upload-modal');
const dashboardModal = getEl('dashboard-modal');
const settingsModal = getEl('settings-modal');
const searchInput = getEl('search-input');
const monthFilter = getEl('month-filter');
const apiKeyInput = getEl('apiKeyInput');
const btnSaveKey = getEl('btn-save-key');
const uploadArea = getEl('upload-area');
const fileInput = getEl('file-input');
const scanLoader = getEl('scan-loader');
const orderForm = getEl('order-form');

// Initialize App
async function initApp() {
    console.log("App starting...");
    renderBoard(); // Render immediately
    
    if (supabase) {
        await loadCardsFromCloud();
        renderBoard();
    } else {
        cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];
        renderBoard();
    }
}

async function loadCardsFromCloud() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            cards = data.map(item => ({
                id: item.id,
                customerName: item.customerName || 'Khách hàng',
                phone: item.phone || '',
                address: item.address || '',
                quoteNumber: item.quoteNumber || '',
                amount: parseInt(String(item.amount).replace(/[^0-9]/g, '')) || 0,
                status: item.status || 'quote',
                date: item.created_at
            }));
        } else {
            const localData = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];
            if (localData.length > 0) {
                cards = localData;
                for (const card of localData) {
                    await supabase.from('orders').insert({
                        id: card.id,
                        customerName: card.customerName,
                        phone: card.phone,
                        address: card.address,
                        quoteNumber: card.quoteNumber,
                        amount: String(card.amount),
                        status: card.status
                    });
                }
            }
        }
    } catch (e) {
        console.error("Cloud Error:", e);
        cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];
    }
}

async function syncCardToCloud(card) {
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    if (!supabase) return;
    try {
        await supabase.from('orders').upsert({
            id: card.id,
            customerName: card.customerName,
            phone: card.phone,
            address: card.address,
            quoteNumber: card.quoteNumber,
            amount: String(card.amount),
            status: card.status
        });
    } catch (e) { console.error(e); }
}

async function deleteCardFromCloud(id) {
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    if (!supabase) return;
    try {
        await supabase.from('orders').delete().eq('id', id);
    } catch (e) { console.error(e); }
}

function renderBoard() {
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    const searchTerm = (searchInput ? searchInput.value : '').toLowerCase();
    const filterMonth = monthFilter ? monthFilter.value : 'all';
    const now = new Date();
    
    COLUMNS.forEach(col => {
        let colCards = cards.filter(c => c.status === col.id);
        
        if (filterMonth !== 'all') {
            colCards = colCards.filter(c => {
                const d = new Date(c.date);
                if (filterMonth === 'current') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                if (filterMonth === 'last') {
                    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
                }
                return true;
            });
        }
        
        if (searchTerm) {
            colCards = colCards.filter(c => 
                (c.customerName || '').toLowerCase().includes(searchTerm) ||
                (c.phone || '').includes(searchTerm)
            );
        }
        
        const colTotal = colCards.reduce((sum, c) => sum + (c.amount || 0), 0);
        const formatCurrency = val => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
        
        const colEl = document.createElement('div');
        colEl.className = 'column';
        colEl.dataset.status = col.id;
        
        colEl.innerHTML = `
            <div class="column-header" style="border-top-color: ${col.color}">
                <div class="column-header-top">
                    <span>${col.title}</span>
                    <span class="col-count">${colCards.length}</span>
                </div>
                <div class="col-total">${formatCurrency(colTotal)}</div>
            </div>
            <div class="column-body" id="col-${col.id}">
                ${colCards.map(createCardHTML).join('')}
            </div>
        `;
        
        boardEl.appendChild(colEl);
    });

    setupDragAndDrop();
    updateDashboardStats();
}

function createCardHTML(card) {
    const formattedDate = new Date(card.date).toLocaleDateString('vi-VN');
    const formatCurrency = val => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    
    return `
        <div class="card" draggable="true" data-id="${card.id}">
            <div class="card-header">
                <span class="card-quote">#${card.quoteNumber || '---'}</span>
                <span class="card-date">${formattedDate}</span>
            </div>
            <div class="card-customer">${card.customerName || 'Khách hàng'}</div>
            <div class="card-info">
                <span><i class="fa-solid fa-phone"></i> ${card.phone || '---'}</span>
            </div>
            <div class="card-footer">
                <div class="card-amount">${formatCurrency(card.amount || 0)}</div>
                <button class="btn-delete" onclick="deleteCard('${card.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

function setupDragAndDrop() {
    const cardEls = document.querySelectorAll('.card');
    const columnBodies = document.querySelectorAll('.column-body');
    
    cardEls.forEach(card => {
        card.ondragstart = () => card.classList.add('dragging');
        card.ondragend = () => card.classList.remove('dragging');
    });
    
    columnBodies.forEach(body => {
        body.ondragover = e => {
            e.preventDefault();
            body.classList.add('drag-over');
        };
        body.ondragleave = () => body.classList.remove('drag-over');
        body.ondrop = async e => {
            e.preventDefault();
            body.classList.remove('drag-over');
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard) return;
            const cardId = draggingCard.dataset.id;
            const newStatus = body.parentElement.dataset.status;
            const idx = cards.findIndex(c => c.id === cardId);
            if (idx > -1) {
                cards[idx].status = newStatus;
                renderBoard();
                await syncCardToCloud(cards[idx]);
            }
        };
    });
}

function updateDashboardStats() {
    const formatCurrency = val => new Intl.NumberFormat('vi-VN').format(val) + ' đ';
    const totalQuote = cards.filter(c => c.status === 'quote').reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalCompleted = cards.filter(c => c.status === 'completed' || c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + (c.amount || 0), 0);
    
    const quoteEl = getEl('stat-quote');
    const completedEl = getEl('stat-completed');
    const debtEl = getEl('stat-debt');
    if (quoteEl) quoteEl.textContent = formatCurrency(totalQuote);
    if (completedEl) completedEl.textContent = formatCurrency(totalCompleted);
    if (debtEl) debtEl.textContent = formatCurrency(totalDebt);
}

async function deleteCard(id) {
    if (confirm('Bạn có chắc chắn muốn xoá đơn hàng này?')) {
        cards = cards.filter(c => c.id !== id);
        renderBoard();
        await deleteCardFromCloud(id);
    }
}

// Handlers
if (btnUpload) btnUpload.onclick = () => {
    uploadModal.classList.add('active');
    orderForm.classList.add('hidden');
    scanLoader.classList.add('hidden');
    uploadArea.classList.remove('hidden');
};
if (btnDashboard) btnDashboard.onclick = () => {
    updateDashboardStats();
    dashboardModal.classList.add('active');
};
if (btnSettings) btnSettings.onclick = () => {
    apiKeyInput.value = localStorage.getItem('lotus_gemini_key') || '';
    settingsModal.classList.add('active');
};
document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
    btn.onclick = () => {
        uploadModal.classList.remove('active');
        dashboardModal.classList.remove('active');
        settingsModal.classList.remove('active');
    };
});
if (btnSaveKey) btnSaveKey.onclick = () => {
    localStorage.setItem('lotus_gemini_key', apiKeyInput.value.trim());
    settingsModal.classList.remove('active');
    alert('Đã lưu cấu hình AI!');
};
if (uploadArea) uploadArea.onclick = () => fileInput.click();
if (fileInput) fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    uploadArea.classList.add('hidden');
    scanLoader.classList.remove('hidden');
    try {
        const base64 = await toBase64(file);
        const data = await scanImageWithGemini(base64.split(',')[1], file.type);
        scanLoader.classList.add('hidden');
        orderForm.classList.remove('hidden');
        getEl('customerName').value = data.customerName || '';
        getEl('phone').value = data.phone || '';
        getEl('address').value = data.address || '';
        getEl('quoteNumber').value = data.quoteNumber || '';
        getEl('amount').value = String(data.amount).replace(/[^0-9]/g, '') || '';
    } catch (err) {
        alert("Lỗi AI: " + err.message);
        scanLoader.classList.add('hidden');
        uploadArea.classList.remove('hidden');
    }
};

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function scanImageWithGemini(base64Image, mimeType) {
    const key = (localStorage.getItem('lotus_gemini_key') || '').trim();
    if (!key) throw new Error("Chưa có API Key");
    let availableModels = [];
    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (listRes.ok) {
            const listData = await listRes.json();
            availableModels = listData.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
        }
    } catch(e) {}
    const priorityModels = [
        availableModels.find(m => m.name.includes('gemini-1.5-flash')),
        availableModels.find(m => m.name.includes('gemini-1.5-pro')),
        availableModels[0]
    ].filter(m => m);
    for (const model of priorityModels) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model.name.split('/').pop()}:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Trích xuất JSON: customerName, phone, address, quoteNumber, amount (số)" },
                        { inlineData: { mimeType, data: base64Image } }
                    ] }]
                })
            });
            const data = await response.json();
            if (response.ok && data.candidates) {
                let text = data.candidates[0].content.parts[0].text;
                return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
            }
        } catch (e) {}
    }
    throw new Error("AI đang bận.");
}

if (orderForm) orderForm.onsubmit = async e => {
    e.preventDefault();
    const newCard = {
        id: Date.now().toString(),
        customerName: getEl('customerName').value,
        phone: getEl('phone').value,
        address: getEl('address').value,
        quoteNumber: getEl('quoteNumber').value,
        amount: parseInt(getEl('amount').value) || 0,
        status: 'quote',
        date: new Date().toISOString()
    };
    cards.unshift(newCard);
    renderBoard();
    uploadModal.classList.remove('active');
    await syncCardToCloud(newCard);
};

if (searchInput) searchInput.oninput = renderBoard;
if (monthFilter) monthFilter.onchange = renderBoard;

// Start
initApp();
