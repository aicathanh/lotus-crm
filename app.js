// --- CONFIGURATION ---
const SUPABASE_URL = 'https://zbnnctvggpupdnjmydcu.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Uc7k0lfdHFzBjWT-3o36w_ydCDXOT8';

let supabase = null;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) { console.error("Supabase Init Error:", e); }

// --- STATE ---
const COLUMNS = [
    { id: 'quote', title: 'Báo Giá', color: 'var(--tag-quote)' },
    { id: 'confirm', title: 'Chốt Đơn', color: 'var(--tag-confirm)' },
    { id: 'deliver', title: 'Đã Giao Hàng', color: 'var(--tag-deliver)' },
    { id: 'paid', title: 'Thu Tiền Hoàn Tất', color: 'var(--tag-paid)' },
    { id: 'debt', title: 'Công Nợ Chưa Thanh Toán', color: 'var(--tag-debt)' },
    { id: 'completed', title: 'Hoàn Tất Đơn Hàng', color: '#0F766E' }
];

let cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];

// --- CORE FUNCTIONS ---
function renderBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    boardEl.innerHTML = '';
    
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const filterMonth = document.getElementById('month-filter')?.value || 'all';
    const now = new Date();
    
    COLUMNS.forEach(col => {
        let colCards = cards.filter(c => c.status === col.id);
        
        // Month Filter
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
        
        // Search Filter
        if (searchTerm) {
            colCards = colCards.filter(c => 
                (c.customerName || '').toLowerCase().includes(searchTerm) ||
                (c.phone || '').includes(searchTerm)
            );
        }
        
        const colTotal = colCards.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
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
            <div class="column-body" id="col-${col.id}"></div>
        `;
        
        const body = colEl.querySelector('.column-body');
        colCards.forEach(card => {
            body.innerHTML += createCardHTML(card);
        });
        
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
    document.querySelectorAll('.card').forEach(card => {
        card.ondragstart = () => card.classList.add('dragging');
        card.ondragend = () => card.classList.remove('dragging');
    });
    
    document.querySelectorAll('.column-body').forEach(body => {
        body.ondragover = e => { e.preventDefault(); body.classList.add('drag-over'); };
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
                if (supabase) await supabase.from('orders').upsert({
                    id: cards[idx].id,
                    customerName: cards[idx].customerName,
                    phone: cards[idx].phone,
                    address: cards[idx].address,
                    quoteNumber: cards[idx].quoteNumber,
                    amount: String(cards[idx].amount),
                    status: cards[idx].status
                });
                localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
            }
        };
    });
}

function updateDashboardStats() {
    const formatCurrency = val => new Intl.NumberFormat('vi-VN').format(val) + ' đ';
    const totalQuote = cards.filter(c => c.status === 'quote').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalCompleted = cards.filter(c => ['completed', 'paid', 'deliver'].includes(c.status)).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    if (document.getElementById('stat-quote')) document.getElementById('stat-quote').textContent = formatCurrency(totalQuote);
    if (document.getElementById('stat-completed')) document.getElementById('stat-completed').textContent = formatCurrency(totalCompleted);
    if (document.getElementById('stat-debt')) document.getElementById('stat-debt').textContent = formatCurrency(totalDebt);
}

async function loadCloud() {
    if (!supabase) return;
    try {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) {
            cards = data.map(item => ({
                id: item.id,
                customerName: item.customerName,
                phone: item.phone,
                address: item.address,
                quoteNumber: item.quoteNumber,
                amount: parseInt(item.amount) || 0,
                status: item.status,
                date: item.created_at
            }));
            renderBoard();
        }
    } catch (e) { console.error("Load Cloud Error:", e); }
}

async function deleteCard(id) {
    if (!confirm('Xoá đơn hàng này?')) return;
    cards = cards.filter(c => c.id !== id);
    renderBoard();
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    if (supabase) await supabase.from('orders').delete().eq('id', id);
}

// --- INITIALIZATION ---
function init() {
    console.log("Lotus CRM Booting...");
    renderBoard();
    loadCloud();
    
    // Bind UI Events
    const btnUpload = document.getElementById('btn-upload');
    const uploadModal = document.getElementById('upload-modal');
    if (btnUpload) btnUpload.onclick = () => {
        uploadModal.classList.add('active');
        document.getElementById('order-form').classList.add('hidden');
        document.getElementById('scan-loader').classList.add('hidden');
        document.getElementById('upload-area').classList.remove('hidden');
    };

    const btnDashboard = document.getElementById('btn-dashboard');
    const dashboardModal = document.getElementById('dashboard-modal');
    if (btnDashboard) btnDashboard.onclick = () => {
        updateDashboardStats();
        dashboardModal.classList.add('active');
    };

    const btnSettings = document.getElementById('btn-settings');
    const settingsModal = document.getElementById('settings-modal');
    if (btnSettings) btnSettings.onclick = () => {
        document.getElementById('apiKeyInput').value = localStorage.getItem('lotus_gemini_key') || '';
        settingsModal.classList.add('active');
    };

    document.querySelectorAll('.close-btn, .close-modal').forEach(btn => {
        btn.onclick = () => {
            uploadModal.classList.remove('active');
            dashboardModal.classList.remove('active');
            settingsModal.classList.remove('active');
        };
    });

    const btnSaveKey = document.getElementById('btn-save-key');
    if (btnSaveKey) btnSaveKey.onclick = () => {
        localStorage.setItem('lotus_gemini_key', document.getElementById('apiKeyInput').value.trim());
        settingsModal.classList.remove('active');
        alert('Đã lưu!');
    };

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    if (uploadArea) uploadArea.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        uploadArea.classList.add('hidden');
        document.getElementById('scan-loader').classList.remove('hidden');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const data = await scanImageWithGemini(reader.result.split(',')[1], file.type);
                document.getElementById('scan-loader').classList.add('hidden');
                document.getElementById('order-form').classList.remove('hidden');
                document.getElementById('customerName').value = data.customerName || '';
                document.getElementById('phone').value = data.phone || '';
                document.getElementById('address').value = data.address || '';
                document.getElementById('quoteNumber').value = data.quoteNumber || '';
                document.getElementById('amount').value = String(data.amount).replace(/[^0-9]/g, '') || '';
            };
        } catch (err) { alert("Lỗi: " + err.message); }
    };

    const orderForm = document.getElementById('order-form');
    if (orderForm) orderForm.onsubmit = async e => {
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
        localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
        if (supabase) await supabase.from('orders').upsert({
            id: newCard.id,
            customerName: newCard.customerName,
            phone: newCard.phone,
            address: newCard.address,
            quoteNumber: newCard.quoteNumber,
            amount: String(newCard.amount),
            status: newCard.status
        });
    };

    if (document.getElementById('search-input')) document.getElementById('search-input').oninput = renderBoard;
    if (document.getElementById('month-filter')) document.getElementById('month-filter').onchange = renderBoard;
}

async function scanImageWithGemini(base64, mimeType) {
    const key = (localStorage.getItem('lotus_gemini_key') || '').trim();
    if (!key) throw new Error("Cần API Key");
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Trích xuất JSON: customerName, phone, address, quoteNumber, amount" }, { inlineData: { mimeType, data: base64 } }] }] })
    });
    const data = await res.json();
    if (data.candidates) {
        let text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    }
    throw new Error("AI bận");
}

window.onload = init;
