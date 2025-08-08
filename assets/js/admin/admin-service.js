import { AuthService } from '../auth/auth.js';
import { FirestoreService } from '../firestore/firestore-service.js';
import { 
    showToast, 
    showLoading, 
    hideLoading, 
    showGlobalLoading,
    minutesToHHMM, 
    minutesToDecimal,
    formatDate,
    generateId,
    sanitizeString,
    validateMinutes,
    validatePersone
} from '../utils/utils.js';

class AdminService {
    constructor() {
        this.currentEmployeeData = null;
        this.currentDate = null;
        this.init();
    }

    async init() {
        // Verifica autenticazione admin
        if (!AuthService.initPageProtection('admin')) {
            return;
        }

        // Setup event listeners
        this.setupEventListeners();
        
        // Carica dati iniziali
        await this.loadInitialData();
        
        // Aggiorna timestamp
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 60000);
    }

    setupEventListeners() {
        // Logout
        AuthService.setupLogoutHandlers();

        // Tab change events
        document.getElementById('dipendenti-tab').addEventListener('shown.bs.tab', () => {
            this.loadEmployees();
        });

        document.getElementById('cantieri-tab').addEventListener('shown.bs.tab', () => {
            this.loadCantieri();
        });

        // Filtri riepilogo
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.loadRiepilogo();
        });

        // Export Excel
        document.getElementById('exportExcel').addEventListener('click', () => {
            this.exportToExcel();
        });

        // Forms
        document.getElementById('employeeForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEmployee();
        });

        document.getElementById('cantiereForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCantiere();
        });

        document.getElementById('passwordForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.changePassword();
        });

        document.getElementById('saveActivitiesBtn').addEventListener('click', () => {
            this.saveEmployeeActivities();
        });
    }

    async loadInitialData() {
        try {
            showGlobalLoading(true);

            // Popola anni nel filtro
            this.populateYearFilter();
            
            // Imposta mese e anno correnti
            const now = new Date();
            document.getElementById('filterMonth').value = now.getMonth() + 1;
            document.getElementById('filterYear').value = now.getFullYear();

            // Carica dipendenti per il filtro
            await this.loadEmployeesFilter();

        } catch (error) {
            console.error('Errore caricamento dati iniziali:', error);
            showToast('Errore caricamento dati iniziali', 'error');
        } finally {
            showGlobalLoading(false);
        }
    }

    populateYearFilter() {
        const yearSelect = document.getElementById('filterYear');
        const currentYear = new Date().getFullYear();
        
        yearSelect.innerHTML = '';
        for (let year = currentYear - 2; year <= currentYear + 1; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === currentYear) option.selected = true;
            yearSelect.appendChild(option);
        }
    }

    async loadEmployeesFilter() {
        try {
            const employees = await FirestoreService.getEmployees();
            const select = document.getElementById('filterEmployee');
            
            select.innerHTML = '<option value="">Tutti i dipendenti</option>';
            
            employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.id;
                option.textContent = employee.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Errore caricamento dipendenti filtro:', error);
        }
    }

    updateDateTime() {
        const now = new Date();
        const formatted = now.toLocaleDateString('it-IT', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('currentDateTime').textContent = formatted;
    }

    // === GESTIONE RIEPILOGO ===
    async loadRiepilogo() {
        try {
            showGlobalLoading(true);

            const employeeId = document.getElementById('filterEmployee').value;
            const month = parseInt(document.getElementById('filterMonth').value);
            const year = parseInt(document.getElementById('filterYear').value);

            // Calcola range date del mese
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            let riepilogoData = [];

            if (employeeId) {
                // Carica dati per un singolo dipendente
                const employee = await this.getEmployeeById(employeeId);
                const ore = await FirestoreService.getOrePeriodo(employeeId, startDate, endDate);
                riepilogoData.push({ dipendente: employee, ore });
            } else {
                // Carica dati per tutti i dipendenti
                riepilogoData = await FirestoreService.getRiepilogoCompleto(startDate, endDate);
            }

            this.displayRiepilogo(riepilogoData);
            this.updateStats(riepilogoData);

        } catch (error) {
            console.error('Errore caricamento riepilogo:', error);
            showToast('Errore caricamento riepilogo', 'error');
        } finally {
            showGlobalLoading(false);
        }
    }

    async getEmployeeById(employeeId) {
        const employees = await FirestoreService.getEmployees();
        return employees.find(emp => emp.id === employeeId);
    }

    displayRiepilogo(riepilogoData) {
        const tbody = document.querySelector('#riepilogoTable tbody');
        tbody.innerHTML = '';

        if (riepilogoData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <i class="bi bi-inbox me-2"></i>
                        Nessun dato trovato per il periodo selezionato
                    </td>
                </tr>
            `;
            return;
        }

        riepilogoData.forEach(({ dipendente, ore }) => {
            ore.forEach(giornoOre => {
                if (giornoOre.attivita && giornoOre.attivita.length > 0) {
                    giornoOre.attivita.forEach((attivita, index) => {
                        const row = document.createElement('tr');
                        
                        // Prima riga per ogni giorno mostra data e dipendente
                        if (index === 0) {
                            row.innerHTML = `
                                <td rowspan="${giornoOre.attivita.length}">${formatDate(giornoOre.data)}</td>
                                <td rowspan="${giornoOre.attivita.length}">${dipendente.name}</td>
                                <td rowspan="${giornoOre.attivita.length}">
                                    <span class="badge bg-${this.getStatoBadgeColor(giornoOre.stato)}">${giornoOre.stato}</span>
                                </td>
                                <td>
                                    <span class="badge bg-${attivita.tipo === 'cantiere' ? 'primary' : 'info'} me-2">${attivita.tipo}</span>
                                    ${attivita.nome}
                                </td>
                                <td>${minutesToHHMM(attivita.minutiEffettivi || attivita.minuti)}</td>
                                <td>
                                    <button class="btn btn-sm btn-outline-primary" onclick="adminService.editEmployeeDay('${dipendente.id}', '${giornoOre.data}')">
                                        <i class="bi bi-pencil"></i>
                                    </button>
                                </td>
                            `;
                        } else {
                            row.innerHTML = `
                                <td>
                                    <span class="badge bg-${attivita.tipo === 'cantiere' ? 'primary' : 'info'} me-2">${attivita.tipo}</span>
                                    ${attivita.nome}
                                </td>
                                <td>${minutesToHHMM(attivita.minutiEffettivi || attivita.minuti)}</td>
                                <td></td>
                            `;
                        }
                        
                        tbody.appendChild(row);
                    });
                } else {
                    // Giorno senza attività
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${formatDate(giornoOre.data)}</td>
                        <td>${dipendente.name}</td>
                        <td><span class="badge bg-${this.getStatoBadgeColor(giornoOre.stato)}">${giornoOre.stato}</span></td>
                        <td class="text-muted">Nessuna attività</td>
                        <td>00:00</td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" onclick="adminService.editEmployeeDay('${dipendente.id}', '${giornoOre.data}')">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(row);
                }
            });
        });
    }

    getStatoBadgeColor(stato) {
        switch (stato) {
            case 'Normale': return 'success';
            case 'Riposo': return 'info';
            case 'Ferie': return 'warning';
            case 'Malattia': return 'danger';
            default: return 'secondary';
        }
    }

    updateStats(riepilogoData) {
        let totalMinutes = 0;
        let workingDays = 0;
        let totalActivities = 0;

        riepilogoData.forEach(({ ore }) => {
            ore.forEach(giornoOre => {
                if (giornoOre.attivita && giornoOre.attivita.length > 0) {
                    workingDays++;
                    totalActivities += giornoOre.attivita.length;
                    
                    giornoOre.attivita.forEach(attivita => {
                        totalMinutes += attivita.minutiEffettivi || attivita.minuti || 0;
                    });
                }
            });
        });

        document.getElementById('totalHours').textContent = minutesToHHMM(totalMinutes);
        document.getElementById('totalDecimal').textContent = minutesToDecimal(totalMinutes);
        document.getElementById('workingDays').textContent = workingDays;
        document.getElementById('totalActivities').textContent = totalActivities;
    }

    // === GESTIONE DIPENDENTI ===
    async loadEmployees() {
        try {
            const employees = await FirestoreService.getEmployees();
            this.displayEmployees(employees);
        } catch (error) {
            console.error('Errore caricamento dipendenti:', error);
            showToast('Errore caricamento dipendenti', 'error');
        }
    }

    displayEmployees(employees) {
        const grid = document.getElementById('employeesGrid');
        grid.innerHTML = '';

        if (employees.length === 0) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <i class="bi bi-person-plus display-1 text-muted mb-3"></i>
                            <h5>Nessun dipendente configurato</h5>
                            <p class="text-muted">Aggiungi il primo dipendente per iniziare</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        employees.forEach(employee => {
            const card = document.createElement('div');
            card.className = 'col-md-6 col-lg-4 mb-3';
            card.innerHTML = `
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <div class="bg-primary rounded-circle p-2 me-3">
                                <i class="bi bi-person text-white"></i>
                            </div>
                            <div>
                                <h6 class="mb-0">${employee.name}</h6>
                                <small class="text-muted">ID: ${employee.id}</small>
                            </div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="adminService.editEmployee('${employee.id}')">
                                <i class="bi bi-pencil me-1"></i>Modifica
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="adminService.deleteEmployee('${employee.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    editEmployee(employeeId) {
        FirestoreService.getEmployees().then(employees => {
            const employee = employees.find(emp => emp.id === employeeId);
            if (employee) {
                document.getElementById('employeeModalTitle').textContent = 'Modifica Dipendente';
                document.getElementById('employeeId').value = employee.id;
                document.getElementById('employeeName').value = employee.name;
                document.getElementById('employeePassword').value = employee.password;
                
                const modal = new bootstrap.Modal(document.getElementById('employeeModal'));
                modal.show();
            }
        });
    }

    async deleteEmployee(employeeId) {
        if (!confirm('Sei sicuro di voler eliminare questo dipendente? Tutti i suoi dati verranno persi.')) {
            return;
        }

        try {
            const employees = await FirestoreService.getEmployees();
            const updatedEmployees = employees.filter(emp => emp.id !== employeeId);
            
            await FirestoreService.saveEmployees(updatedEmployees);
            await FirestoreService.deleteEmployeeData(employeeId);
            
            showToast('Dipendente eliminato con successo', 'success');
            this.loadEmployees();
            this.loadEmployeesFilter();
        } catch (error) {
            console.error('Errore eliminazione dipendente:', error);
            showToast('Errore eliminazione dipendente', 'error');
        }
    }

    async saveEmployee() {
        try {
            const id = document.getElementById('employeeId').value;
            const name = sanitizeString(document.getElementById('employeeName').value);
            const password = document.getElementById('employeePassword').value;

            if (!name || !password) {
                showToast('Compila tutti i campi', 'warning');
                return;
            }

            if (password.length < 4) {
                showToast('La password deve essere di almeno 4 caratteri', 'warning');
                return;
            }

            const btn = document.getElementById('saveEmployeeBtn');
            showLoading(btn, 'Salvataggio...');

            const employees = await FirestoreService.getEmployees();
            
            if (id) {
                // Modifica esistente
                const index = employees.findIndex(emp => emp.id === id);
                if (index !== -1) {
                    employees[index] = { id, name, password };
                }
            } else {
                // Nuovo dipendente
                const newId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                
                // Verifica ID univoco
                if (employees.find(emp => emp.id === newId)) {
                    showToast('Esiste già un dipendente con questo nome', 'warning');
                    hideLoading(btn, 'Salva');
                    return;
                }
                
                employees.push({ id: newId, name, password });
            }

            await FirestoreService.saveEmployees(employees);
            
            showToast('Dipendente salvato con successo', 'success');
            
            // Reset form e chiudi modal
            document.getElementById('employeeForm').reset();
            document.getElementById('employeeId').value = '';
            bootstrap.Modal.getInstance(document.getElementById('employeeModal')).hide();
            
            // Ricarica dati
            this.loadEmployees();
            this.loadEmployeesFilter();
            
        } catch (error) {
            console.error('Errore salvataggio dipendente:', error);
            showToast('Errore salvataggio dipendente', 'error');
        } finally {
            hideLoading(document.getElementById('saveEmployeeBtn'), 'Salva');
        }
    }

    // === GESTIONE CANTIERI ===
    async loadCantieri() {
        try {
            const cantieri = await FirestoreService.getCantieri();
            this.displayCantieri(cantieri);
        } catch (error) {
            console.error('Errore caricamento cantieri:', error);
            showToast('Errore caricamento cantieri', 'error');
        }
    }

    displayCantieri(cantieri) {
        const grid = document.getElementById('cantieriGrid');
        grid.innerHTML = '';

        if (cantieri.length === 0) {
            grid.innerHTML = `
                <div class="col-12">
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <i class="bi bi-building display-1 text-muted mb-3"></i>
                            <h5>Nessun cantiere configurato</h5>
                            <p class="text-muted">Aggiungi il primo cantiere per iniziare</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        cantieri.forEach(cantiere => {
            const card = document.createElement('div');
            card.className = 'col-md-6 col-lg-4 mb-3';
            card.innerHTML = `
                <div class="card h-100">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <div class="bg-success rounded-circle p-2 me-3">
                                <i class="bi bi-building text-white"></i>
                            </div>
                            <div>
                                <h6 class="mb-0">${cantiere.name}</h6>
                                <small class="text-muted">ID: ${cantiere.id}</small>
                            </div>
                        </div>
                        <div class="mb-3">
                            <small class="text-muted">Ore standard:</small>
                            <div class="fw-bold">${minutesToHHMM(cantiere.minutes)}</div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-sm btn-outline-primary flex-fill" onclick="adminService.editCantiere('${cantiere.id}')">
                                <i class="bi bi-pencil me-1"></i>Modifica
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="adminService.deleteCantiere('${cantiere.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    editCantiere(cantiereId) {
        FirestoreService.getCantieri().then(cantieri => {
            const cantiere = cantieri.find(c => c.id === cantiereId);
            if (cantiere) {
                document.getElementById('cantiereModalTitle').textContent = 'Modifica Cantiere';
                document.getElementById('cantiereId').value = cantiere.id;
                document.getElementById('cantiereName').value = cantiere.name;
                document.getElementById('cantiereMinutes').value = cantiere.minutes;
                
                const modal = new bootstrap.Modal(document.getElementById('cantiereModal'));
                modal.show();
            }
        });
    }

    async deleteCantiere(cantiereId) {
        if (!confirm('Sei sicuro di voler eliminare questo cantiere?')) {
            return;
        }

        try {
            const cantieri = await FirestoreService.getCantieri();
            const updatedCantieri = cantieri.filter(c => c.id !== cantiereId);
            
            await FirestoreService.saveCantieri(updatedCantieri);
            
            showToast('Cantiere eliminato con successo', 'success');
            this.loadCantieri();
        } catch (error) {
            console.error('Errore eliminazione cantiere:', error);
            showToast('Errore eliminazione cantiere', 'error');
        }
    }

    async saveCantiere() {
        try {
            const id = document.getElementById('cantiereId').value;
            const name = sanitizeString(document.getElementById('cantiereName').value);
            const minutes = parseInt(document.getElementById('cantiereMinutes').value);

            if (!name || !validateMinutes(minutes)) {
                showToast('Compila tutti i campi correttamente', 'warning');
                return;
            }

            const btn = document.getElementById('saveCantiereBtn');
            showLoading(btn, 'Salvataggio...');

            const cantieri = await FirestoreService.getCantieri();
            
            if (id) {
                // Modifica esistente
                const index = cantieri.findIndex(c => c.id === id);
                if (index !== -1) {
                    cantieri[index] = { id, name, minutes };
                }
            } else {
                // Nuovo cantiere
                const newId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                
                // Verifica ID univoco
                if (cantieri.find(c => c.id === newId)) {
                    showToast('Esiste già un cantiere con questo nome', 'warning');
                    hideLoading(btn, 'Salva');
                    return;
                }
                
                cantieri.push({ id: newId, name, minutes });
            }

            await FirestoreService.saveCantieri(cantieri);
            
            showToast('Cantiere salvato con successo', 'success');
            
            // Reset form e chiudi modal
            document.getElementById('cantiereForm').reset();
            document.getElementById('cantiereId').value = '';
            bootstrap.Modal.getInstance(document.getElementById('cantiereModal')).hide();
            
            // Ricarica dati
            this.loadCantieri();
            
        } catch (error) {
            console.error('Errore salvataggio cantiere:', error);
            showToast('Errore salvataggio cantiere', 'error');
        } finally {
            hideLoading(document.getElementById('saveCantiereBtn'), 'Salva');
        }
    }

    // === MODIFICA ATTIVITÀ DIPENDENTE ===
    async editEmployeeDay(employeeId, date) {
        try {
            showGlobalLoading(true);
            
            const employee = await this.getEmployeeById(employeeId);
            const dayData = await FirestoreService.getOreLavorative(employeeId, date);
            const cantieri = await FirestoreService.getCantieri();
            
            this.currentEmployeeData = { employeeId, date, employee, dayData };
            
            this.displayEditActivityModal(employee, date, dayData, cantieri);
            
            const modal = new bootstrap.Modal(document.getElementById('editActivityModal'));
            modal.show();
            
        } catch (error) {
            console.error('Errore caricamento dati dipendente:', error);
            showToast('Errore caricamento dati', 'error');
        } finally {
            showGlobalLoading(false);
        }
    }

    displayEditActivityModal(employee, date, dayData, cantieri) {
        const content = document.getElementById('editActivityContent');
        
        content.innerHTML = `
            <div class="mb-4">
                <h6><i class="bi bi-person me-2"></i>${employee.name}</h6>
                <p class="text-muted mb-0">${formatDate(date)}</p>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-6">
                    <label class="form-label">Stato Giornata</label>
                    <select class="form-select" id="editDayStatus">
                        <option value="Normale" ${dayData.stato === 'Normale' ? 'selected' : ''}>Normale</option>
                        <option value="Riposo" ${dayData.stato === 'Riposo' ? 'selected' : ''}>Riposo</option>
                        <option value="Ferie" ${dayData.stato === 'Ferie' ? 'selected' : ''}>Ferie</option>
                        <option value="Malattia" ${dayData.stato === 'Malattia' ? 'selected' : ''}>Malattia</option>
                    </select>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Azioni</label>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-primary" onclick="adminService.addCantiereToEdit()">
                            <i class="bi bi-plus me-1"></i>Cantiere
                        </button>
                        <button class="btn btn-sm btn-info" onclick="adminService.addPSTToEdit()">
                            <i class="bi bi-plus me-1"></i>PST
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="table-responsive">
                <table class="table table-dark table-striped">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Nome</th>
                            <th>Minuti</th>
                            <th>Persone</th>
                            <th>Min. Effettivi</th>
                            <th>Azioni</th>
                        </tr>
                    </thead>
                    <tbody id="editActivitiesTable">
                        <!-- Popolato dinamicamente -->
                    </tbody>
                </table>
            </div>
            
            <!-- Selettore cantieri nascosto -->
            <select id="hiddenCantieriSelect" style="display: none;">
                ${cantieri.map(c => `<option value="${c.id}" data-minutes="${c.minutes}">${c.name}</option>`).join('')}
            </select>
        `;
        
        this.updateEditActivitiesTable();
    }

    updateEditActivitiesTable() {
        const tbody = document.getElementById('editActivitiesTable');
        const activities = this.currentEmployeeData.dayData.attivita || [];
        
        tbody.innerHTML = '';
        
        if (activities.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-3">
                        <i class="bi bi-plus-circle me-2"></i>
                        Nessuna attività. Aggiungi la prima attività.
                    </td>
                </tr>
            `;
            return;
        }
        
        activities.forEach((activity, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <span class="badge bg-${activity.tipo === 'cantiere' ? 'primary' : 'info'}">${activity.tipo}</span>
                </td>
                <td>${activity.nome}</td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${activity.minuti}" min="0" max="1440"
                           onchange="adminService.updateEditActivity(${index}, 'minuti', this.value)">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm" 
                           value="${activity.persone}" min="1" max="50"
                           onchange="adminService.updateEditActivity(${index}, 'persone', this.value)">
                </td>
                <td>
                    <strong>${minutesToHHMM(activity.minutiEffettivi || activity.minuti)}</strong>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="adminService.removeEditActivity(${index})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    addCantiereToEdit() {
        const select = document.getElementById('hiddenCantieriSelect');
        if (select.options.length === 0) {
            showToast('Nessun cantiere configurato', 'warning');
            return;
        }
        
        const selectedOption = select.options[0];
        const cantiere = {
            id: generateId('cantiere'),
            nome: selectedOption.textContent,
            minuti: parseInt(selectedOption.dataset.minutes),
            persone: 1,
            tipo: 'cantiere'
        };
        
        cantiere.minutiEffettivi = cantiere.minuti * cantiere.persone;
        cantiere.minutiEffettivi = Math.round(cantiere.minuti / cantiere.persone);
        
        this.currentEmployeeData.dayData.attivita = this.currentEmployeeData.dayData.attivita || [];
        this.currentEmployeeData.dayData.attivita.push(cantiere);
        
        this.updateEditActivitiesTable();
    }

    addPSTToEdit() {
        const nome = prompt('Nome attività PST:');
        if (!nome) return;
        
        const minuti = parseInt(prompt('Minuti:', '480'));
        if (!validateMinutes(minuti)) {
            showToast('Minuti non validi', 'warning');
            return;
        }
        
        const pst = {
            id: generateId('pst'),
            nome: sanitizeString(nome),
            minuti: minuti,
            persone: 1,
            tipo: 'pst',
            minutiEffettivi: Math.round(minuti / 1)
        };
        
        this.currentEmployeeData.dayData.attivita = this.currentEmployeeData.dayData.attivita || [];
        this.currentEmployeeData.dayData.attivita.push(pst);
        
        this.updateEditActivitiesTable();
    }

    updateEditActivity(index, field, value) {
        const activities = this.currentEmployeeData.dayData.attivita;
        if (!activities[index]) return;
        
        if (field === 'minuti') {
            const minuti = parseInt(value);
            if (validateMinutes(minuti)) {
                activities[index].minuti = minuti;
                activities[index].minutiEffettivi = Math.round(minuti / activities[index].persone);
            }
        } else if (field === 'persone') {
            const persone = parseInt(value);
            if (validatePersone(persone)) {
                activities[index].persone = persone;
                activities[index].minutiEffettivi = Math.round(activities[index].minuti / persone);
            }
        }
        
        this.updateEditActivitiesTable();
    }

    removeEditActivity(index) {
        if (confirm('Rimuovere questa attività?')) {
            this.currentEmployeeData.dayData.attivita.splice(index, 1);
            this.updateEditActivitiesTable();
        }
    }

    async saveEmployeeActivities() {
        try {
            const btn = document.getElementById('saveActivitiesBtn');
            showLoading(btn, 'Salvataggio...');
            
            // Aggiorna stato
            const newStatus = document.getElementById('editDayStatus').value;
            this.currentEmployeeData.dayData.stato = newStatus;
            
            // Salva su Firestore
            await FirestoreService.saveOreLavorative(
                this.currentEmployeeData.employeeId,
                this.currentEmployeeData.date,
                this.currentEmployeeData.dayData
            );
            
            showToast('Attività salvate con successo', 'success');
            
            // Chiudi modal
            bootstrap.Modal.getInstance(document.getElementById('editActivityModal')).hide();
            
            // Ricarica riepilogo se visibile
            if (document.getElementById('riepilogo').classList.contains('show')) {
                this.loadRiepilogo();
            }
            
        } catch (error) {
            console.error('Errore salvataggio attività:', error);
            showToast('Errore salvataggio attività', 'error');
        } finally {
            hideLoading(document.getElementById('saveActivitiesBtn'), 'Salva Modifiche');
        }
    }

    // === CAMBIO PASSWORD ===
    async changePassword() {
        try {
            const currentPassword = document.getElementById('currentPassword').value;
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (!currentPassword || !newPassword || !confirmPassword) {
                showToast('Compila tutti i campi', 'warning');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('Le password non coincidono', 'warning');
                return;
            }

            if (newPassword.length < 4) {
                showToast('La nuova password deve essere di almeno 4 caratteri', 'warning');
                return;
            }

            const btn = document.getElementById('changePasswordBtn');
            showLoading(btn, 'Aggiornamento...');

            // Verifica password attuale
            const masterPassword = await FirestoreService.getMasterPassword();
            if (currentPassword !== masterPassword) {
                showToast('Password attuale non corretta', 'error');
                hideLoading(btn, '<i class="bi bi-key me-2"></i>Cambia Password');
                return;
            }

            // Aggiorna password
            await FirestoreService.updateMasterPassword(newPassword);
            
            showToast('Password aggiornata con successo', 'success');
            
            // Reset form e chiudi offcanvas
            document.getElementById('passwordForm').reset();
            bootstrap.Offcanvas.getInstance(document.getElementById('passwordOffcanvas')).hide();
            
        } catch (error) {
            console.error('Errore cambio password:', error);
            showToast('Errore cambio password', 'error');
        } finally {
            hideLoading(document.getElementById('changePasswordBtn'), '<i class="bi bi-key me-2"></i>Cambia Password');
        }
    }

    // === EXPORT EXCEL ===
    async exportToExcel() {
        try {
            showGlobalLoading(true);
            
            const employeeId = document.getElementById('filterEmployee').value;
            const month = parseInt(document.getElementById('filterMonth').value);
            const year = parseInt(document.getElementById('filterYear').value);

            // Calcola range date del mese
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];

            let riepilogoData = [];

            if (employeeId) {
                const employee = await this.getEmployeeById(employeeId);
                const ore = await FirestoreService.getOrePeriodo(employeeId, startDate, endDate);
                riepilogoData.push({ dipendente: employee, ore });
            } else {
                riepilogoData = await FirestoreService.getRiepilogoCompleto(startDate, endDate);
            }

            this.generateExcelFile(riepilogoData, month, year);
            
        } catch (error) {
            console.error('Errore export Excel:', error);
            showToast('Errore durante l\'export Excel', 'error');
        } finally {
            showGlobalLoading(false);
        }
    }

    generateExcelFile(riepilogoData, month, year) {
        // Prepara i dati per Excel
        const excelData = [];
        
        // Header
        excelData.push(['Data', 'Dipendente', 'Stato', 'Tipo Attività', 'Nome Attività', 'Ore', 'Persone', 'Ore Effettive']);
        
        riepilogoData.forEach(({ dipendente, ore }) => {
            ore.forEach(giornoOre => {
                if (giornoOre.attivita && giornoOre.attivita.length > 0) {
                    giornoOre.attivita.forEach(attivita => {
                        excelData.push([
                            formatDate(giornoOre.data),
                            dipendente.name,
                            giornoOre.stato,
                            attivita.tipo,
                            attivita.nome,
                            minutesToHHMM(attivita.minuti),
                            attivita.persone || 1,
                            minutesToHHMM(attivita.minutiEffettivi || attivita.minuti)
                        ]);
                    });
                } else {
                    excelData.push([
                        formatDate(giornoOre.data),
                        dipendente.name,
                        giornoOre.stato,
                        '',
                        'Nessuna attività',
                        '00:00',
                        0,
                        '00:00'
                    ]);
                }
            });
        });

        // Crea workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(excelData);
        
        // Applica stili (larghezza colonne)
        ws['!cols'] = [
            { width: 15 }, // Data
            { width: 20 }, // Dipendente
            { width: 12 }, // Stato
            { width: 12 }, // Tipo
            { width: 25 }, // Nome Attività
            { width: 10 }, // Ore
            { width: 10 }, // Persone
            { width: 12 }  // Ore Effettive
        ];

        XLSX.utils.book_append_sheet(wb, ws, 'Riepilogo Ore');
        
        // Nome file
        const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                           'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        const fileName = `Riepilogo_Ore_${monthNames[month-1]}_${year}.xlsx`;
        
        // Download
        XLSX.writeFile(wb, fileName);
        
        showToast('File Excel generato con successo', 'success');
    }
}

// Inizializza il servizio admin
const adminService = new AdminService();

// Esponi globalmente per gli onclick
window.adminService = adminService;