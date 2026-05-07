// Supabase Configuration
const SUPABASE_URL = 'https://zbnnctvggpupdnjmydcu.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Uc7k0lfdHFzBjWT-3o36w_ydCDXOT8';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
const boardEl = document.getElementById('board');
const btnUpload = document.getElementById('btn-upload');
const btnDashboard = document.getElementById('btn-dashboard');
const btnSettings = document.getElementById('btn-settings');
const uploadModal = document.getElementById('upload-modal');
const dashboardModal = document.getElementById('dashboard-modal');
const settingsModal = document.getElementById('settings-modal');
const closeBtns = document.querySelectorAll('.close-btn, .close-modal');
const searchInput = document.getElementById('search-input');
const monthFilter = document.getElementById('month-filter');
const apiKeyInput = document.getElementById('apiKeyInput');
const btnSaveKey = document.getElementById('btn-save-key');

const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const scanLoader = document.getElementById('scan-loader');
const orderForm = document.getElementById('order-form');

// Initialize App
async function initApp() {
    await loadCardsFromCloud();
    renderBoard();
}

async function loadCardsFromCloud() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Migration logic: If cloud is empty, check local
        if (data.length === 0) {
            const localData = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];
            if (localData.length > 0) {
                for (const card of localData) {
                    const dbCard = {
                        id: card.id,
                        customerName: card.customerName,
                        phone: card.phone,
                        address: card.address,
                        quoteNumber: card.quoteNumber,
                        amount: String(card.amount),
                        status: card.status
                    };
                    await supabase.from('orders').insert(dbCard);
                }
                cards = localData;
            }
        } else {
            // Map DB data back to local structure (amount string to number)
            cards = data.map(item => ({
                ...item,
                amount: parseInt(item.amount.replace(/[^0-9]/g, '')) || 0,
                date: item.created_at
            }));
        }
    } catch (e) {
        console.error("Cloud load error:", e);
        cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];
    }
}

async function syncCardToCloud(card) {
    try {
        const dbCard = {
            id: card.id,
            customerName: card.customerName,
            phone: card.phone,
            address: card.address,
            quoteNumber: card.quoteNumber,
            amount: String(card.amount),
            status: card.status
        };
        await supabase.from('orders').upsert(dbCard);
        localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    } catch (e) { console.error("Cloud sync error:", e); }
}

async function deleteCardFromCloud(id) {
    try {
        await supabase.from('orders').delete().eq('id', id);
        localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    } catch (e) { console.error("Cloud delete error:", e); }
}

// Render Board
function renderBoard() {
    boardEl.innerHTML = '';
    
    const searchTerm = searchInput.value.toLowerCase();
    const filterMonth = monthFilter.value;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    COLUMNS.forEach(col => {
        let colCards = cards.filter(c => c.status === col.id);
        
        if (filterMonth !== 'all') {
            colCards = colCards.filter(c => {
                const d = new Date(c.date);
                if (filterMonth === 'current') return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                if (filterMonth === 'last') {
                    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                    const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                    return d.getMonth() === lastMonth && d.getFullYear() === lastYear;
                }
                return true;
            });
        }
        
        if (searchTerm) {
            colCards = colCards.filter(c => 
                c.customerName.toLowerCase().includes(searchTerm) ||
                (c.phone && c.phone.includes(searchTerm))
            );
        }
        
        const colTotal = colCards.reduce((sum, c) => sum + c.amount, 0);
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

searchInput.addEventListener('input', renderBoard);
monthFilter.addEventListener('change', renderBoard);

function createCardHTML(card) {
    const formattedDate = new Date(card.date).toLocaleDateString('vi-VN');
    const formatCurrency = val => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);
    
    return `
        <div class="card" draggable="true" data-id="${card.id}">
            <div class="card-header">
                <span class="card-quote">#${card.quoteNumber || '---'}</span>
                <span class="card-date">${formattedDate}</span>
            </div>
            <div class="card-customer">${card.customerName}</div>
            <div class="card-info">
                <span><i class="fa-solid fa-phone"></i> ${card.phone || '---'}</span>
            </div>
            <div class="card-footer">
                <div class="card-amount">${formatCurrency(card.amount)}</div>
                <button class="btn-delete" onclick="deleteCard('${card.id}')"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

function setupDragAndDrop() {
    const cardEls = document.querySelectorAll('.card');
    const columnBodies = document.querySelectorAll('.column-body');
    
    cardEls.forEach(card => {
        card.addEventListener('dragstart', () => card.classList.add('dragging'));
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    
    columnBodies.forEach(body => {
        body.addEventListener('dragover', e => {
            e.preventDefault();
            body.classList.add('drag-over');
        });
        
        body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
        
        body.addEventListener('drop', async e => {
            e.preventDefault();
            body.classList.remove('drag-over');
            const draggingCard = document.querySelector('.dragging');
            const cardId = draggingCard.dataset.id;
            const newStatus = body.parentElement.dataset.status;
            
            const cardIndex = cards.findIndex(c => c.id === cardId);
            if (cardIndex > -1) {
                cards[cardIndex].status = newStatus;
                renderBoard();
                await syncCardToCloud(cards[cardIndex]);
            }
        });
    });
}

// Dashboard
function updateDashboardStats() {
    const totalRevenue = cards.filter(c => c.status === 'completed').reduce((sum, c) => sum + c.amount, 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + c.amount, 0);
    
    document.getElementById('total-revenue').textContent = new Intl.NumberFormat('vi-VN').format(totalRevenue) + ' đ';
    document.getElementById('total-debt').textContent = new Intl.NumberFormat('vi-VN').format(totalDebt) + ' đ';
}

// Actions
async function deleteCard(id) {
    if (confirm('Bạn có chắc chắn muốn xoá đơn hàng này?')) {
        cards = cards.filter(c => c.id !== id);
        renderBoard();
        await deleteCardFromCloud(id);
    }
}

// Modals
btnUpload.onclick = () => {
    uploadModal.classList.add('active');
    orderForm.classList.add('hidden');
    scanLoader.classList.add('hidden');
    uploadArea.classList.remove('hidden');
};

btnDashboard.onclick = () => {
    updateDashboardStats();
    dashboardModal.classList.add('active');
};

btnSettings.onclick = () => {
    apiKeyInput.value = localStorage.getItem('lotus_gemini_key') || '';
    settingsModal.classList.add('active');
};

closeBtns.forEach(btn => {
    btn.onclick = () => {
        uploadModal.classList.remove('active');
        dashboardModal.classList.remove('active');
        settingsModal.classList.remove('active');
    };
});

window.onclick = e => {
    if (e.target === uploadModal) uploadModal.classList.remove('active');
    if (e.target === dashboardModal) dashboardModal.classList.remove('active');
    if (e.target === settingsModal) settingsModal.classList.remove('active');
};

btnSaveKey.onclick = () => {
    localStorage.setItem('lotus_gemini_key', apiKeyInput.value.trim());
    settingsModal.classList.remove('active');
    alert('Đã lưu cấu hình!');
};

// AI Upload
uploadArea.onclick = () => fileInput.click();

fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    
    uploadArea.classList.add('hidden');
    scanLoader.classList.remove('hidden');
    
    try {
        const base64 = await toBase64(file);
        const data = await scanImageWithGemini(base64.split(',')[1], file.type);
        
        scanLoader.classList.add('hidden');
        orderForm.classList.remove('hidden');
        
        document.getElementById('customerName').value = data.customerName || '';
        document.getElementById('phone').value = data.phone || '';
        document.getElementById('address').value = data.address || '';
        document.getElementById('quoteNumber').value = data.quoteNumber || '';
        const cleanAmount = String(data.amount).replace(/[^0-9]/g, '');
        document.getElementById('amount').value = cleanAmount || '';
        
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
    throw new Error("AI không thể đọc được ảnh này.");
}

orderForm.onsubmit = async e => {
    e.preventDefault();
    const newCard = {
        id: Date.now().toString(),
        customerName: document.getElementById('customerName').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        quoteNumber: document.getElementById('quoteNumber').value,
        amount: parseInt(document.getElementById('amount').value) || 0,
        status: 'quote',
        date: new Date().toISOString()
    };
    
    cards.unshift(newCard);
    renderBoard();
    uploadModal.classList.remove('active');
    await syncCardToCloud(newCard);
};

// Start
initApp();
