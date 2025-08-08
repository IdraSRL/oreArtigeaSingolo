import { AuthService } from '../auth/auth.js';
import { FirestoreService } from '../firestore/firestore-service.js';
import { 
    showToast, 
    showLoading, 
    hideLoading,
    minutesToHHMM, 
    minutesToDecimal,
    formatDate,
    getTodayString,
    getYesterdayString,
    isDateAllowed,
    generateId,
    sanitizeString,
    validateMinutes,
    validatePersone,
    debounce
} from '../utils/utils.js';

class TimeEntryService {
    constructor() {
        this.currentUser = null;
        this.currentDate = null;
        this.currentData = null;
        this.cantieri = [];
        this.debouncedSave = debounce(() => this.saveData(), 1000);
        this.init();
    }

    async init() {
        // Verifica autenticazione dipendente
        if (!AuthService.initPageProtection('employee')) {
            return;
        }

        this.currentUser = AuthService.getCurrentUser();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Carica dati iniziali
        await this.loadInitialData();
        
        // Imposta data di default (oggi)
        this.setDefaultDate();
    }

    setupEventListeners() {
        // Logout
        AuthService.setupLogoutHandlers();

        // Cambio data
        document.getElementById('workDate').addEventListener('change', (e) => {
            this.changeDate(e.target.value);
        });

        // Carica giornata
        document.getElementById('loadDayBtn').addEventListener('click', () => {
            this.loadCurrentDay();
        });

        // Cambio stato
        document.getElementById('dayStatus').addEventListener('change', () => {
            this.updateStatus();
        });

        // Forms
        document.getElementById('cantiereForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addCantiereActivity();
        });

        document.getElementById('pstForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addPSTActivity();
        });

        // Modal events
        document.getElementById('cantiereModal').addEventListener('show.bs.modal', () => {
            this.loadCantieriSelect();
        });
    }

    async loadInitialData() {
        try {
            // Carica cantieri
            this.cantieri = await FirestoreService.getCantieri();
        } catch (error) {
            console.error('Errore caricamento dati iniziali:', error);
            showToast('Errore caricamento dati iniziali', 'error');
        }
    }

    setDefaultDate() {
        const today = getTodayString();
        document.getElementById('workDate').value = today;
        this.changeDate(today);
    }

    async changeDate(newDate) {
        if (!newDate) return;

        // Verifica che la data sia consentita
        if (!isDateAllowed(newDate)) {
            showToast('Puoi inserire ore solo per oggi o ieri', 'warning');
            this.setDefaultDate();
            return;
        }

        this.currentDate = newDate;
        this.updateDateDisplay();
        await this.loadCurrentDay();
    }

    updateDateDisplay() {
        if (!this.currentDate) return;

        const formatted = formatDate(this.currentDate);
        document.getElementById('selectedDateDisplay').textContent = formatted;

        const today = getTodayString();
        const yesterday = getYesterdayString();
        
        let badge = '';
        if (this.currentDate === today) {
            badge = 'Oggi';
        } else if (this.currentDate === yesterday) {
            badge = 'Ieri';
        }
        
        document.getElementById('selectedDateBadge').textContent = badge;
    }

    async loadCurrentDay() {
        if (!this.currentDate) return;

        try {
            const btn = document.getElementById('loadDayBtn');
            showLoading(btn, 'Caricamento...');

            this.currentData = await FirestoreService.getOreLavorative(
                this.currentUser.id, 
                this.currentDate
            );

            // Aggiorna UI
            document.getElementById('dayStatus').value = this.currentData.stato || 'Normale';
            this.updateUI();
            this.updateLastSaved();

        } catch (error) {
            console.error('Errore caricamento giornata:', error);
            showToast('Errore caricamento dati', 'error');
        } finally {
            hideLoading(document.getElementById('loadDayBtn'), '<i class="bi bi-arrow-clockwise me-2"></i>Carica');
        }
    }

    updateStatus() {
        if (!this.currentData) return;
        
        this.currentData.stato = document.getElementById('dayStatus').value;
        this.debouncedSave();
    }

    // === GESTIONE CANTIERI ===
    async loadCantieriSelect() {
        const select = document.getElementById('cantiereSelect');
        
        if (this.cantieri.length === 0) {
            select.innerHTML = '<option value="">Nessun cantiere configurato</option>';
            return;
        }

        select.innerHTML = '<option value="">Seleziona un cantiere</option>';
        
        this.cantieri.forEach(cantiere => {
            const option = document.createElement('option');
            option.value = cantiere.id;
            option.textContent = `${cantiere.name} (${minutesToHHMM(cantiere.minutes)})`;
            option.dataset.minutes = cantiere.minutes;
            option.dataset.name = cantiere.name;
            select.appendChild(option);
        });
    }

    async addCantiereActivity() {
        const cantiereId = document.getElementById('cantiereSelect').value;
        const persone = parseInt(document.getElementById('cantierePersone').value);

        if (!cantiereId) {
            showToast('Seleziona un cantiere', 'warning');
            return;
        }

        if (!validatePersone(persone)) {
            showToast('Numero persone non valido', 'warning');
            return;
        }

        if (!this.currentData) {
            showToast('Carica prima una giornata', 'warning');
            return;
        }

        try {
            const btn = document.getElementById('addCantiereBtn');
            showLoading(btn, 'Aggiunta...');

            const cantiere = this.cantieri.find(c => c.id === cantiereId);
            if (!cantiere) {
                showToast('Cantiere non trovato', 'error');
                return;
            }

            const activity = {
                id: generateId('cantiere'),
                nome: cantiere.name,
                minuti: cantiere.minutes,
                persone: persone,
                minutiEffettivi: Math.round(cantiere.minutes / persone),
                tipo: 'cantiere'
            };

            this.currentData.attivita = this.currentData.attivita || [];
            this.currentData.attivita.push(activity);

            // Reset form e chiudi modal
            document.getElementById('cantiereForm').reset();
            document.getElementById('cantierePersone').value = '1';
            bootstrap.Modal.getInstance(document.getElementById('cantiereModal')).hide();

            this.updateUI();
            this.debouncedSave();

            showToast('Cantiere aggiunto con successo', 'success');

        } catch (error) {
            console.error('Errore aggiunta cantiere:', error);
            showToast('Errore aggiunta cantiere', 'error');
        } finally {
            hideLoading(document.getElementById('addCantiereBtn'), '<i class="bi bi-plus me-2"></i>Aggiungi Cantiere');
        }
    }

    // === GESTIONE PST ===
    async addPSTActivity() {
        const nome = sanitizeString(document.getElementById('pstName').value);
        const minuti = parseInt(document.getElementById('pstMinutes').value);
        const persone = parseInt(document.getElementById('pstPersone').value);

        if (!nome) {
            showToast('Inserisci il nome dell\'attività', 'warning');
            return;
        }

        if (!validateMinutes(minuti)) {
            showToast('Minuti non validi', 'warning');
            return;
        }

        if (!validatePersone(persone)) {
            showToast('Numero persone non valido', 'warning');
            return;
        }

        if (!this.currentData) {
            showToast('Carica prima una giornata', 'warning');
            return;
        }

        try {
            const btn = document.getElementById('addPSTBtn');
            showLoading(btn, 'Aggiunta...');

            const activity = {
                id: generateId('pst'),
                nome: nome,
                minuti: minuti,
                persone: persone,
                minutiEffettivi: Math.round(minuti / persone),
                tipo: 'pst'
            };

            this.currentData.attivita = this.currentData.attivita || [];
            this.currentData.attivita.push(activity);

            // Reset form e chiudi modal
            document.getElementById('pstForm').reset();
            document.getElementById('pstMinutes').value = '480';
            document.getElementById('pstPersone').value = '1';
            bootstrap.Modal.getInstance(document.getElementById('pstModal')).hide();

            this.updateUI();
            this.debouncedSave();

            showToast('Attività PST aggiunta con successo', 'success');

        } catch (error) {
            console.error('Errore aggiunta PST:', error);
            showToast('Errore aggiunta attività', 'error');
        } finally {
            hideLoading(document.getElementById('addPSTBtn'), '<i class="bi bi-plus me-2"></i>Aggiungi PST');
        }
    }

    // === GESTIONE ATTIVITÀ ===
    updateActivity(activityId, field, value) {
        if (!this.currentData || !this.currentData.attivita) return;

        const activity = this.currentData.attivita.find(a => a.id === activityId);
        if (!activity) return;

        if (field === 'minuti') {
            const minuti = parseInt(value);
            if (validateMinutes(minuti)) {
                activity.minuti = minuti;
                activity.minutiEffettivi = Math.round(minuti / activity.persone);
                this.updateUI();
                this.debouncedSave();
            }
        } else if (field === 'persone') {
            const persone = parseInt(value);
            if (validatePersone(persone)) {
                activity.persone = persone;
                activity.minutiEffettivi = Math.round(activity.minuti / persone);
                this.updateUI();
                this.debouncedSave();
            }
        }
    }

    removeActivity(activityId) {
        if (!this.currentData || !this.currentData.attivita) return;

        if (confirm('Rimuovere questa attività?')) {
            this.currentData.attivita = this.currentData.attivita.filter(a => a.id !== activityId);
            this.updateUI();
            this.debouncedSave();
            showToast('Attività rimossa', 'info');
        }
    }

    // === UI UPDATES ===
    updateUI() {
        this.updateActivitiesTable();
        this.updateStats();
    }

    updateActivitiesTable() {
        const tbody = document.querySelector('#activitiesTable tbody');
        const activities = this.currentData?.attivita || [];

        tbody.innerHTML = '';

        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-4">
                        <i class="bi bi-plus-circle me-2"></i>
                        Nessuna attività per questa giornata. Aggiungi la prima attività.
                    </td>
                </tr>
            `;
            return;
        }

        activities.forEach(activity => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="badge bg-${activity.tipo === 'cantiere' ? 'success' : 'info'}">${activity.tipo}</span>
                </td>
                <td>${activity.nome}</td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${activity.minuti}" min="0" max="1440"
                           onchange="timeEntryService.updateActivity('${activity.id}', 'minuti', this.value)">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${activity.persone}" min="1" max="50"
                           onchange="timeEntryService.updateActivity('${activity.id}', 'persone', this.value)">
                </td>
                <td>
                    <strong class="text-primary">${activity.minutiEffettivi || activity.minuti}</strong>
                </td>
                <td>
                    <strong class="text-success">${minutesToHHMM(activity.minutiEffettivi || activity.minuti)}</strong>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="timeEntryService.removeActivity('${activity.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    updateStats() {
        const activities = this.currentData?.attivita || [];
        
        let totalMinutes = 0;
        activities.forEach(activity => {
            totalMinutes += activity.minutiEffettivi || activity.minuti || 0;
        });

        document.getElementById('totalHours').textContent = minutesToHHMM(totalMinutes);
        document.getElementById('totalDecimal').textContent = minutesToDecimal(totalMinutes);
        document.getElementById('totalActivities').textContent = activities.length;
        document.getElementById('activityCount').textContent = `${activities.length} attività`;
    }

    // === SALVATAGGIO ===
    async saveData() {
        if (!this.currentData || !this.currentDate) return;

        try {
            // Mostra stato salvataggio
            document.getElementById('autoSaveStatus').innerHTML = 
                '<i class="bi bi-cloud-arrow-up me-1"></i>Salvataggio...';

            await FirestoreService.saveOreLavorative(
                this.currentUser.id,
                this.currentDate,
                this.currentData
            );

            // Aggiorna stato
            document.getElementById('autoSaveStatus').innerHTML = 
                '<i class="bi bi-cloud-check me-1"></i>Salvato automaticamente';
            document.getElementById('autoSaveStatus').className = 'text-success';
            
            this.updateLastSaved();

        } catch (error) {
            console.error('Errore salvataggio:', error);
            document.getElementById('autoSaveStatus').innerHTML = 
                '<i class="bi bi-cloud-slash me-1"></i>Errore salvataggio';
            document.getElementById('autoSaveStatus').className = 'text-danger';
            
            showToast('Errore durante il salvataggio', 'error');
        }
    }

    updateLastSaved() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('lastSaved').textContent = `Ultimo salvataggio: ${timeString}`;
    }

    // === UTILITY ===
    getTotals() {
        const activities = this.currentData?.attivita || [];
        let totalMinutes = 0;
        
        activities.forEach(activity => {
            totalMinutes += activity.minutiEffettivi || activity.minuti || 0;
        });

        return {
            totalMinutes,
            totalHours: minutesToHHMM(totalMinutes),
            totalDecimal: minutesToDecimal(totalMinutes),
            activityCount: activities.length
        };
    }
}

// Inizializza il servizio
const timeEntryService = new TimeEntryService();

// Esponi globalmente per gli onclick
window.timeEntryService = timeEntryService;