// Lotus CRM Master Script - Resilience Edition
const SUPABASE_URL = 'https://zbnnctvggpupdnjmydcu.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Uc7k0lfdHFzBjWT-3o36w_ydCDXOT8';

let supabase = null;
let cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];

// 1. UI RECOVERY & DRAG-DROP
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
                saveLocal();
                syncToCloud(cards[idx]);
            }
        };
    });
}

function renderBoard() {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const filterMonth = document.getElementById('month-filter')?.value || 'all';
    const now = new Date();
    
    ['quote', 'confirm', 'deliver', 'paid', 'debt', 'completed'].forEach(status => {
        const body = document.getElementById(`col-${status}`);
        if (!body) return;
        body.innerHTML = '';
        
        let colCards = cards.filter(c => c.status === status);
        
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
        
        const colEl = body.parentElement;
        const countBadge = colEl.querySelector('.col-count');
        const totalText = colEl.querySelector('.col-total');
        const colTotal = colCards.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        
        if (countBadge) countBadge.textContent = colCards.length;
        if (totalText) totalText.textContent = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(colTotal);
        
        colCards.forEach(card => {
            const div = document.createElement('div');
            div.className = 'card';
            div.draggable = true;
            div.dataset.id = card.id;
            div.innerHTML = `
                <div class="card-header">
                    <span class="card-quote">#${card.quoteNumber || '---'}</span>
                    <span class="card-date">${new Date(card.date).toLocaleDateString('vi-VN')}</span>
                </div>
                <div class="card-customer">${card.customerName || 'Khách hàng'}</div>
                <div class="card-info">
                    <span><i class="fa-solid fa-phone"></i> ${card.phone || '---'}</span>
                </div>
                <div class="card-footer">
                    <div class="card-amount">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.amount || 0)}</div>
                    <button class="btn-delete" onclick="deleteCard('${card.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            div.ondragstart = () => div.classList.add('dragging');
            div.ondragend = () => div.classList.remove('dragging');
            body.appendChild(div);
        });
    });
    setupDragAndDrop();
    updateDashboardStats();
}

function updateDashboardStats() {
    const fmt = v => new Intl.NumberFormat('vi-VN').format(v) + ' đ';
    const totalQuote = cards.filter(c => c.status === 'quote').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalCompleted = cards.filter(c => ['completed', 'paid', 'deliver'].includes(c.status)).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    if (document.getElementById('stat-quote')) document.getElementById('stat-quote').textContent = fmt(totalQuote);
    if (document.getElementById('stat-completed')) document.getElementById('stat-completed').textContent = fmt(totalCompleted);
    if (document.getElementById('stat-debt')) document.getElementById('stat-debt').textContent = fmt(totalDebt);
}

function saveLocal() {
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
}

async function syncToCloud(c) {
    if (!supabase) return;
    try {
        await supabase.from('orders').upsert({
            id: c.id, customerName: c.customerName, phone: c.phone, address: c.address,
            quoteNumber: c.quoteNumber, amount: String(c.amount), status: c.status
        });
    } catch (e) { console.warn("Cloud Sync Fail", e); }
}

async function deleteCard(id) {
    if (!confirm('Xoá đơn hàng này?')) return;
    cards = cards.filter(c => c.id !== id);
    renderBoard();
    saveLocal();
    if (supabase) await supabase.from('orders').delete().eq('id', id);
}

// 2. MAIN INITIALIZATION
function setup() {
    console.log("Lotus CRM: Binding UI...");
    
    // Immediate UI Binding (MUST BE FIRST)
    const btnUpload = document.getElementById('btn-upload');
    const uploadModal = document.getElementById('upload-modal');
    if (btnUpload) btnUpload.onclick = () => {
        uploadModal.classList.add('active');
        document.getElementById('order-form').classList.add('hidden');
        document.getElementById('scan-loader').classList.add('hidden');
        document.getElementById('upload-area').classList.remove('hidden');
    };

    const btnDashboard = document.getElementById('btn-dashboard');
    if (btnDashboard) btnDashboard.onclick = () => {
        updateDashboardStats();
        document.getElementById('dashboard-modal').classList.add('active');
    };

    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) btnSettings.onclick = () => {
        document.getElementById('apiKeyInput').value = localStorage.getItem('lotus_gemini_key') || '';
        document.getElementById('settings-modal').classList.add('active');
    };

    document.querySelectorAll('.close-btn, .close-modal').forEach(b => b.onclick = () => {
        uploadModal.classList.remove('active');
        document.getElementById('dashboard-modal').classList.remove('active');
        document.getElementById('settings-modal').classList.remove('active');
    });

    const btnSaveKey = document.getElementById('btn-save-key');
    if (btnSaveKey) btnSaveKey.onclick = () => {
        localStorage.setItem('lotus_gemini_key', document.getElementById('apiKeyInput').value.trim());
        document.getElementById('settings-modal').classList.remove('active');
        alert('Đã lưu cấu hình AI!');
    };

    const upArea = document.getElementById('upload-area');
    const fIn = document.getElementById('file-input');
    if (upArea) upArea.onclick = () => fIn.click();
    if (fIn) fIn.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        upArea.classList.add('hidden');
        document.getElementById('scan-loader').classList.remove('hidden');
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                const key = localStorage.getItem('lotus_gemini_key');
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
                    method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: "JSON: customerName, phone, address, quoteNumber, amount" }, { inlineData: { mimeType: file.type, data: reader.result.split(',')[1] } }] }] })
                });
                const d = await res.json();
                const json = JSON.parse(d.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());
                document.getElementById('scan-loader').classList.add('hidden');
                document.getElementById('order-form').classList.remove('hidden');
                document.getElementById('customerName').value = json.customerName || '';
                document.getElementById('phone').value = json.phone || '';
                document.getElementById('address').value = json.address || '';
                document.getElementById('quoteNumber').value = json.quoteNumber || '';
                document.getElementById('amount').value = String(json.amount).replace(/[^0-9]/g, '') || '';
            } catch (err) { alert("AI bận hoặc lỗi Key"); document.getElementById('scan-loader').classList.add('hidden'); upArea.classList.remove('hidden'); }
        };
    };

    const form = document.getElementById('order-form');
    if (form) form.onsubmit = async e => {
        e.preventDefault();
        const c = {
            id: Date.now().toString(),
            customerName: document.getElementById('customerName').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            quoteNumber: document.getElementById('quoteNumber').value,
            amount: parseInt(document.getElementById('amount').value) || 0,
            status: 'quote', date: new Date().toISOString()
        };
        cards.unshift(c);
        renderBoard();
        saveLocal();
        uploadModal.classList.remove('active');
        syncToCloud(c);
    };

    if (document.getElementById('search-input')) document.getElementById('search-input').oninput = renderBoard;
    if (document.getElementById('month-filter')) document.getElementById('month-filter').onchange = renderBoard;

    renderBoard();
    
    // 3. CLOUD INITIALIZATION (SAFE ASYNC)
    setTimeout(async () => {
        try {
            if (window.supabase) {
                supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
                if (data && data.length > 0) {
                    cards = data.map(d => ({
                        id: d.id, customerName: d.customerName, phone: d.phone, address: d.address,
                        quoteNumber: d.quoteNumber, amount: parseInt(d.amount) || 0,
                        status: d.status, date: d.created_at
                    }));
                    renderBoard();
                    saveLocal();
                }
            }
        } catch (e) { console.warn("Cloud Load Error (Silent)", e); }
    }, 100);
}

// Ensure it runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
} else {
    setup();
}
