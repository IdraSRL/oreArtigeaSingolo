// Conversioni tempo
export function minutesToHHMM(minutes) {
    if (!minutes || minutes < 0) return "00:00";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function minutesToDecimal(minutes) {
    if (!minutes || minutes < 0) return "0.00";
    return (minutes / 60).toFixed(2);
}

export function HHMMToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
}

// Date utilities
export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

export function getTodayString() {
    return new Date().toISOString().split('T')[0];
}

export function getYesterdayString() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
}

export function getMonthRange(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    return {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
    };
}

export function isDateAllowed(dateString) {
    const today = getTodayString();
    const yesterday = getYesterdayString();
    return dateString === today || dateString === yesterday;
}

// UI utilities
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toastId = 'toast-' + Date.now();
    const iconMap = {
        success: 'bi-check-circle-fill',
        error: 'bi-exclamation-triangle-fill',
        warning: 'bi-exclamation-triangle-fill',
        info: 'bi-info-circle-fill'
    };
    
    const colorMap = {
        success: 'text-success',
        error: 'text-danger',
        warning: 'text-warning',
        info: 'text-primary'
    };
    
    const toastHtml = `
        <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="toast-header">
                <i class="bi ${iconMap[type]} ${colorMap[type]} me-2"></i>
                <strong class="me-auto">Sistema</strong>
                <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
            </div>
            <div class="toast-body">
                ${message}
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
    toast.show();
    
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}

export function showLoading(element, text = 'Caricamento...') {
    if (!element) return;
    element.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="spinner-border spinner-border-sm me-2" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            ${text}
        </div>
    `;
    element.disabled = true;
}

export function hideLoading(element, originalText = '') {
    if (!element) return;
    element.innerHTML = originalText;
    element.disabled = false;
}

export function showGlobalLoading(show = true) {
    let overlay = document.getElementById('global-loading');
    
    if (show) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-loading';
            overlay.className = 'loading-overlay';
            overlay.innerHTML = `
                <div class="text-center">
                    <div class="spinner-border mb-3" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <div>Caricamento in corso...</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
    } else {
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

// Performance
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Validation
export function sanitizeString(str) {
    if (!str) return '';
    return str.toString().trim().replace(/[<>]/g, '');
}

export function generateId(baseName = 'item') {
    return `${baseName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function validateMinutes(value) {
    const num = parseInt(value);
    return !isNaN(num) && num >= 0 && num <= 1440; // Max 24 ore
}

export function validatePersone(value) {
    const num = parseInt(value);
    return !isNaN(num) && num >= 1 && num <= 50;
}

// Storage utilities
export function saveToStorage(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Errore salvataggio storage:', error);
        return false;
    }
}

export function loadFromStorage(key) {
    try {
        const data = sessionStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Errore caricamento storage:', error);
        return null;
    }
}

export function removeFromStorage(key) {
    try {
        sessionStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Errore rimozione storage:', error);
        return false;
    }
}