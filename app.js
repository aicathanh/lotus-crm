// Lotus CRM Master Script
const SUPABASE_URL = 'https://zbnnctvggpupdnjmydcu.supabase.co';
const SUPABASE_KEY = 'sb_publishable__Uc7k0lfdHFzBjWT-3o36w_ydCDXOT8';

let supabase = null;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) { console.error("Supabase Error:", e); }

let cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];

function renderBoard() {
    const searchTerm = (document.getElementById('search-input')?.value || '').toLowerCase();
    const filterMonth = document.getElementById('month-filter')?.value || 'all';
    const now = new Date();
    
    const COLUMNS = ['quote', 'confirm', 'deliver', 'paid', 'debt', 'completed'];
    
    COLUMNS.forEach(status => {
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
        
        // Update header
        const colEl = body.parentElement;
        const countBadge = colEl.querySelector('.col-count');
        const totalText = colEl.querySelector('.col-total');
        const colTotal = colCards.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        
        if (countBadge) countBadge.textContent = colCards.length;
        if (totalText) totalText.textContent = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(colTotal);
        
        colCards.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.draggable = true;
            cardEl.dataset.id = card.id;
            cardEl.innerHTML = `
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
            
            cardEl.ondragstart = () => cardEl.classList.add('dragging');
            cardEl.ondragend = () => cardEl.classList.remove('dragging');
            body.appendChild(cardEl);
        });

        body.ondragover = e => { e.preventDefault(); body.classList.add('drag-over'); };
        body.ondragleave = () => body.classList.remove('drag-over');
        body.ondrop = async e => {
            e.preventDefault();
            body.classList.remove('drag-over');
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard) return;
            const cardId = draggingCard.dataset.id;
            const idx = cards.findIndex(c => c.id === cardId);
            if (idx > -1) {
                cards[idx].status = status;
                renderBoard();
                saveLocal();
                if (supabase) await supabase.from('orders').upsert(toDBCard(cards[idx]));
            }
        };
    });
    updateDashboardStats();
}

function toDBCard(c) {
    return {
        id: c.id,
        customerName: c.customerName,
        phone: c.phone,
        address: c.address,
        quoteNumber: c.quoteNumber,
        amount: String(c.amount),
        status: c.status
    };
}

function saveLocal() {
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
}

function updateDashboardStats() {
    const totalQuote = cards.filter(c => c.status === 'quote').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalCompleted = cards.filter(c => ['completed', 'paid', 'deliver'].includes(c.status)).reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    
    const fmt = v => new Intl.NumberFormat('vi-VN').format(v) + ' đ';
    if (document.getElementById('stat-quote')) document.getElementById('stat-quote').textContent = fmt(totalQuote);
    if (document.getElementById('stat-completed')) document.getElementById('stat-completed').textContent = fmt(totalCompleted);
    if (document.getElementById('stat-debt')) document.getElementById('stat-debt').textContent = fmt(totalDebt);
}

async function deleteCard(id) {
    if (!confirm('Xoá?')) return;
    cards = cards.filter(c => c.id !== id);
    renderBoard();
    saveLocal();
    if (supabase) await supabase.from('orders').delete().eq('id', id);
}

async function loadCloud() {
    if (!supabase) return;
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

// UI Setup
function setup() {
    renderBoard();
    loadCloud();
    
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    
    bind('btn-upload', () => {
        document.getElementById('upload-modal').classList.add('active');
        document.getElementById('order-form').classList.add('hidden');
        document.getElementById('scan-loader').classList.add('hidden');
        document.getElementById('upload-area').classList.remove('hidden');
    });

    bind('btn-dashboard', () => {
        updateDashboardStats();
        document.getElementById('dashboard-modal').classList.add('active');
    });

    bind('btn-settings', () => {
        document.getElementById('apiKeyInput').value = localStorage.getItem('lotus_gemini_key') || '';
        document.getElementById('settings-modal').classList.add('active');
    });

    document.querySelectorAll('.close-btn, .close-modal').forEach(b => b.onclick = () => {
        document.getElementById('upload-modal').classList.remove('active');
        document.getElementById('dashboard-modal').classList.remove('active');
        document.getElementById('settings-modal').classList.remove('active');
    });

    bind('btn-save-key', () => {
        localStorage.setItem('lotus_gemini_key', document.getElementById('apiKeyInput').value.trim());
        document.getElementById('settings-modal').classList.remove('active');
        alert('Đã lưu!');
    });

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
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${localStorage.getItem('lotus_gemini_key')}`, {
                    method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: "JSON: customerName, phone, address, quoteNumber, amount" }, { inlineData: { mimeType: file.type, data: reader.result.split(',')[1] } }] }] })
                });
                const d = await res.json();
                const text = d.candidates[0].content.parts[0].text;
                const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
                document.getElementById('scan-loader').classList.add('hidden');
                document.getElementById('order-form').classList.remove('hidden');
                document.getElementById('customerName').value = json.customerName || '';
                document.getElementById('phone').value = json.phone || '';
                document.getElementById('address').value = json.address || '';
                document.getElementById('quoteNumber').value = json.quoteNumber || '';
                document.getElementById('amount').value = String(json.amount).replace(/[^0-9]/g, '') || '';
            } catch (err) { alert("Lỗi AI"); document.getElementById('scan-loader').classList.add('hidden'); upArea.classList.remove('hidden'); }
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
        document.getElementById('upload-modal').classList.remove('active');
        if (supabase) await supabase.from('orders').upsert(toDBCard(c));
    };

    if (document.getElementById('search-input')) document.getElementById('search-input').oninput = renderBoard;
    if (document.getElementById('month-filter')) document.getElementById('month-filter').onchange = renderBoard;
}

window.addEventListener('load', setup);
