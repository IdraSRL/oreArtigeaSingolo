import { FirestoreService } from '../firestore/firestore-service.js';
import { showToast, saveToStorage, loadFromStorage, removeFromStorage } from '../utils/utils.js';
import { ERROR_MESSAGES } from '../config.js';

export class AuthService {
    static SESSION_KEY = 'userSession';
    
    // Verifica se l'utente è loggato
    static isLoggedIn() {
        const session = loadFromStorage(this.SESSION_KEY);
        return session !== null && this.isSessionValid(session);
    }
    
    // Verifica validità sessione (24 ore)
    static isSessionValid(session) {
        if (!session || !session.loginTime) return false;
        const loginTime = new Date(session.loginTime);
        const now = new Date();
        const diffHours = (now - loginTime) / (1000 * 60 * 60);
        return diffHours < 24;
    }
    
    // Ottieni utente corrente
    static getCurrentUser() {
        const session = loadFromStorage(this.SESSION_KEY);
        return this.isSessionValid(session) ? session : null;
    }
    
    // Login come amministratore
    static async loginAsAdmin(password) {
        try {
            const masterPassword = await FirestoreService.getMasterPassword();
            
            if (password === masterPassword) {
                const userSession = {
                    type: 'admin',
                    id: 'admin',
                    name: 'Amministratore',
                    loginTime: new Date().toISOString()
                };
                
                saveToStorage(this.SESSION_KEY, userSession);
                return userSession;
            } else {
                throw new Error(ERROR_MESSAGES.LOGIN_FAILED);
            }
        } catch (error) {
            console.error('Errore login admin:', error);
            throw new Error(error.message || ERROR_MESSAGES.NETWORK_ERROR);
        }
    }
    
    // Login come dipendente
    static async loginAsEmployee(employeeId, password) {
        try {
            const employees = await FirestoreService.getEmployees();
            const employee = employees.find(emp => emp.id === employeeId);
            
            if (!employee) {
                throw new Error(ERROR_MESSAGES.LOGIN_FAILED);
            }
            
            // Verifica password dipendente o master password
            const masterPassword = await FirestoreService.getMasterPassword();
            const isValidPassword = password === employee.password || password === masterPassword;
            
            if (isValidPassword) {
                const userSession = {
                    type: 'employee',
                    id: employee.id,
                    name: employee.name,
                    loginTime: new Date().toISOString()
                };
                
                saveToStorage(this.SESSION_KEY, userSession);
                return userSession;
            } else {
                throw new Error(ERROR_MESSAGES.LOGIN_FAILED);
            }
        } catch (error) {
            console.error('Errore login dipendente:', error);
            throw new Error(error.message || ERROR_MESSAGES.NETWORK_ERROR);
        }
    }
    
    // Logout
    static logout() {
        removeFromStorage(this.SESSION_KEY);
        window.location.href = '../pages/login.html';
    }
    
    // Middleware per proteggere le pagine
    static requireAuth(requiredType = null) {
        if (!this.isLoggedIn()) {
            window.location.href = '../pages/login.html';
            return false;
        }
        
        if (requiredType) {
            const user = this.getCurrentUser();
            if (user.type !== requiredType) {
                showToast('Accesso non autorizzato', 'error');
                window.location.href = '../pages/login.html';
                return false;
            }
        }
        
        return true;
    }
    
    // Inizializza protezione pagina
    static initPageProtection(requiredType = null) {
        // Controlla autenticazione
        if (!this.requireAuth(requiredType)) {
            return false;
        }
        
        // Aggiorna UI con info utente
        this.updateUserUI();
        
        // Setup logout automatico alla scadenza sessione
        this.setupSessionTimeout();
        
        return true;
    }
    
    // Aggiorna UI con informazioni utente
    static updateUserUI() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        // Aggiorna nome utente nella navbar
        const userNameElements = document.querySelectorAll('.user-name');
        userNameElements.forEach(el => {
            el.textContent = user.name;
        });
        
        // Aggiorna tipo utente
        const userTypeElements = document.querySelectorAll('.user-type');
        userTypeElements.forEach(el => {
            el.textContent = user.type === 'admin' ? 'Amministratore' : 'Dipendente';
        });
    }
    
    // Setup timeout automatico sessione
    static setupSessionTimeout() {
        const user = this.getCurrentUser();
        if (!user) return;
        
        const loginTime = new Date(user.loginTime);
        const expirationTime = new Date(loginTime.getTime() + (24 * 60 * 60 * 1000)); // 24 ore
        const timeUntilExpiration = expirationTime.getTime() - new Date().getTime();
        
        if (timeUntilExpiration > 0) {
            setTimeout(() => {
                showToast('Sessione scaduta. Effettua nuovamente il login.', 'warning');
                this.logout();
            }, timeUntilExpiration);
        } else {
            // Sessione già scaduta
            this.logout();
        }
    }
    
    // Setup eventi logout
    static setupLogoutHandlers() {
        const logoutButtons = document.querySelectorAll('.logout-btn');
        logoutButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
    }
}