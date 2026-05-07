// State Management
const COLUMNS = [
    { id: 'quote', title: 'Báo Giá', color: 'var(--tag-quote)' },
    { id: 'confirm', title: 'Chốt Đơn', color: 'var(--tag-confirm)' },
    { id: 'deliver', title: 'Đã Giao Hàng', color: 'var(--tag-deliver)' },
    { id: 'paid', title: 'Thu Tiền Hoàn Tất', color: 'var(--tag-paid)' },
    { id: 'debt', title: 'Công Nợ Chưa Thanh Toán', color: 'var(--tag-debt)' },
    { id: 'completed', title: 'Hoàn Tất Đơn Hàng', color: '#0F766E' }
];

let cards = JSON.parse(localStorage.getItem('lotus_crm_cards')) || [];

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

// Initialize Board
function renderBoard() {
    boardEl.innerHTML = '';
    
    const searchTerm = searchInput.value.toLowerCase();
    const filterMonth = monthFilter.value; // 'all', 'current', 'last'
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    COLUMNS.forEach(col => {
        let colCards = cards.filter(c => c.status === col.id);
        
        // Apply Month Filter
        if (filterMonth !== 'all') {
            colCards = colCards.filter(c => {
                const d = new Date(c.date);
                if (filterMonth === 'current') {
                    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                } else if (filterMonth === 'last') {
                    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                    const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                    return d.getMonth() === lastMonth && d.getFullYear() === lastYear;
                }
                return true;
            });
        }
        
        // Apply Search Filter
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
    const formattedAmount = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(card.amount);
    
    return `
        <div class="card" draggable="true" data-id="${card.id}">
            <div class="card-header">
                <div class="card-title">${card.customerName}</div>
                <div class="card-id">${card.quoteNumber}</div>
            </div>
            <div class="card-amount">${formattedAmount}</div>
            <div class="card-meta">
                <i class="fa-solid fa-phone"></i> ${card.phone || 'N/A'}
            </div>
            <div class="card-meta">
                <i class="fa-regular fa-calendar"></i> ${formattedDate}
            </div>
        </div>
    `;
}

// Drag and Drop Logic
function setupDragAndDrop() {
    const cardEls = document.querySelectorAll('.card');
    const colBodies = document.querySelectorAll('.column-body');
    
    cardEls.forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
        });
        
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            
            // Update status in state
            const id = card.dataset.id;
            const newStatus = card.closest('.column').dataset.status;
            
            const cardData = cards.find(c => c.id === id);
            if (cardData && cardData.status !== newStatus) {
                cardData.status = newStatus;
                saveCards();
                renderBoard(); // re-render to update counts
            }
        });
    });
    
    colBodies.forEach(col => {
        col.addEventListener('dragover', e => {
            e.preventDefault();
            
            // Check if dragging a file
            const isFileDrag = e.dataTransfer.types && e.dataTransfer.types.includes('Files');
            if (isFileDrag) {
                if (col.parentElement.dataset.status === 'quote') {
                    col.parentElement.classList.add('file-drag-over');
                }
                return;
            }

            const draggable = document.querySelector('.dragging');
            if (!draggable) return;

            const afterElement = getDragAfterElement(col, e.clientY);
            if (afterElement == null) {
                col.appendChild(draggable);
            } else {
                col.insertBefore(draggable, afterElement);
            }
        });

        col.addEventListener('dragleave', e => {
            col.parentElement.classList.remove('file-drag-over');
        });

        col.addEventListener('drop', e => {
            col.parentElement.classList.remove('file-drag-over');
            
            // Handle file drop
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                if (col.parentElement.dataset.status === 'quote') {
                    openModal(uploadModal);
                    handleFileUpload(e.dataTransfer.files[0]);
                }
            }
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function saveCards() {
    localStorage.setItem('lotus_crm_cards', JSON.stringify(cards));
    updateDashboardStats();
}

// Dashboard Logic
function updateDashboardStats() {
    const totalQuote = cards.reduce((sum, c) => sum + c.amount, 0);
    const totalCompleted = cards.filter(c => c.status === 'deliver' || c.status === 'paid').reduce((sum, c) => sum + c.amount, 0);
    const totalDebt = cards.filter(c => c.status === 'debt').reduce((sum, c) => sum + c.amount, 0);

    const formatCurrency = val => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

    document.getElementById('stat-quote').textContent = formatCurrency(totalQuote);
    document.getElementById('stat-completed').textContent = formatCurrency(totalCompleted);
    document.getElementById('stat-debt').textContent = formatCurrency(totalDebt);
}

// Modal and Upload Logic
function openModal(modal) {
    // Đóng tất cả modal khác trước khi mở mới để tránh chồng lấn
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
    if (modal === uploadModal) {
        resetUploadForm();
    }
}

function resetUploadForm() {
    uploadArea.classList.remove('hidden');
    scanLoader.classList.add('hidden');
    orderForm.classList.add('hidden');
    orderForm.reset();
    document.getElementById('form-status-msg').textContent = '';
}

btnUpload.addEventListener('click', () => openModal(uploadModal));
btnDashboard.addEventListener('click', () => openModal(dashboardModal));
btnSettings.addEventListener('click', () => {
    apiKeyInput.value = localStorage.getItem('lotus_gemini_key') || '';
    openModal(settingsModal);
});

btnSaveKey.addEventListener('click', () => {
    localStorage.setItem('lotus_gemini_key', apiKeyInput.value.trim());
    closeModal(settingsModal);
    alert('Đã lưu cấu hình AI thành công!');
});

closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        closeModal(btn.closest('.modal-overlay'));
    });
});

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary)';
    uploadArea.style.background = '#F0F9FF';
});

uploadArea.addEventListener('dragleave', e => {
    e.preventDefault();
    uploadArea.style.borderColor = '#CBD5E1';
    uploadArea.style.background = 'transparent';
});

uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) {
        handleFileUpload(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', e => {
    if (e.target.files.length) {
        handleFileUpload(e.target.files[0]);
    }
});

async function handleFileUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Vui lòng chọn file ảnh hợp lệ!');
        return;
    }
    
    uploadArea.classList.add('hidden');
    scanLoader.classList.remove('hidden');
    document.getElementById('form-status-msg').textContent = '';
    
    const currentApiKey = (localStorage.getItem('lotus_gemini_key') || '').trim();
    if (!currentApiKey) {
        setTimeout(() => {
            scanLoader.classList.add('hidden');
            orderForm.classList.remove('hidden');
            document.getElementById('form-status-msg').innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Bạn chưa nhập API Key. Nhấn ⚙️ để cài đặt.';
        }, 800);
        return;
    }

    try {
        const base64Image = await fileToBase64(file);
        const data = await scanImageWithGemini(base64Image, file.type);
        
        scanLoader.classList.add('hidden');
        orderForm.classList.remove('hidden');
        
        document.getElementById('customerName').value = data.customerName || '';
        document.getElementById('customerPhone').value = data.phone || '';
        document.getElementById('deliveryAddress').value = data.address || '';
        document.getElementById('quoteNumber').value = data.quoteNumber || '';
        
        const cleanAmount = String(data.amount).replace(/[^0-9]/g, '');
        document.getElementById('totalAmount').value = cleanAmount ? new Intl.NumberFormat('vi-VN').format(cleanAmount) : '';

    } catch (e) {
        console.error("Detailed AI Error:", e);
        scanLoader.classList.add('hidden');
        orderForm.classList.remove('hidden');
        // Hiện lỗi thật sự để người dùng/tôi biết đường sửa
        document.getElementById('form-status-msg').innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Lỗi AI: ${e.message}. <br><small>Vui lòng kiểm tra lại API Key hoặc nhập tay bên dưới.</small>`;
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

async function scanImageWithGemini(base64Image, mimeType) {
    const key = (localStorage.getItem('lotus_gemini_key') || '').trim();
    if (!key) throw new Error("Chưa có API Key");

    // 1. Dò tìm danh sách model
    let availableModels = [];
    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (listRes.ok) {
            const listData = await listRes.json();
            availableModels = listData.models.filter(m => m.supportedGenerationMethods.includes('generateContent'));
        }
    } catch(e) { console.warn("Probe failed", e); }

    // 2. Danh sách ưu tiên để thử (Lách tắc đường)
    const priorityModels = [
        availableModels.find(m => m.name.includes('gemini-1.5-flash')),
        availableModels.find(m => m.name.includes('gemini-1.5-pro')),
        availableModels.find(m => m.name.includes('gemini-pro-vision')),
        availableModels[0]
    ].filter(m => m); // Loại bỏ các model không tồn tại

    let lastError = "Không thể kết nối AI";

    for (const model of priorityModels) {
        const modelName = model.name.split('/').pop();
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [
                        { text: "Bạn là chuyên gia bóc tách dữ liệu. Trả về JSON: customerName, phone, address, quoteNumber, amount (số tiền)" },
                        { inlineData: { mimeType: mimeType, data: base64Image } }
                    ] }]
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                if (data.candidates && data.candidates[0]) {
                    let text = data.candidates[0].content.parts[0].text;
                    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    return JSON.parse(text);
                }
            } else {
                lastError = data.error?.message || "Lỗi AI";
                // Nếu lỗi là "High Demand" hoặc "Overloaded", tiếp tục thử model tiếp theo trong danh sách
                if (lastError.includes("high demand") || lastError.includes("overloaded") || response.status === 503) {
                    console.warn(`Model ${modelName} đang bận, thử model tiếp theo...`);
                    continue;
                }
                throw new Error(lastError);
            }
        } catch (e) {
            lastError = e.message;
            if (lastError.includes("high demand") || lastError.includes("overloaded")) continue;
            throw e;
        }
    }
    
    throw new Error(lastError);
}

orderForm.addEventListener('submit', e => {
    e.preventDefault();
    
    // Lấy số tiền và loại bỏ các ký tự không phải số (dấu chấm, phẩy, đ)
    const rawAmount = document.getElementById('totalAmount').value;
    const cleanAmount = Number(rawAmount.replace(/[^0-9]/g, ''));

    const newCard = {
        id: 'ORDER-' + Date.now().toString().slice(-6),
        customerName: document.getElementById('customerName').value,
        phone: document.getElementById('customerPhone').value,
        address: document.getElementById('deliveryAddress').value,
        quoteNumber: document.getElementById('quoteNumber').value,
        amount: cleanAmount,
        date: new Date().toISOString(),
        status: 'quote'
    };

    cards.push(newCard);
    saveCards();
    renderBoard();
    closeModal(uploadModal);
});

// Init
renderBoard();
