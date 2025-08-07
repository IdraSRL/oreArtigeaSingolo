import { db } from '../firebase-config.js';
import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    query, 
    where, 
    getDocs,
    orderBy,
    limit
} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js';
import { COLL } from '../config.js';

export class FirestoreService {
    
    // Test connessione database
    static async testConnection() {
        try {
            const testDoc = doc(db, COLL.MASTER_PASS, 'config');
            await getDoc(testDoc);
            return true;
        } catch (error) {
            console.error('Errore connessione Firebase:', error);
            return false;
        }
    }
    
    // === GESTIONE MASTER PASSWORD ===
    static async getMasterPassword() {
        try {
            const docRef = doc(db, COLL.MASTER_PASS, 'config');
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return docSnap.data().password;
            } else {
                // Crea password di default se non esiste
                await this.updateMasterPassword('admin123');
                return 'admin123';
            }
        } catch (error) {
            console.error('Errore caricamento master password:', error);
            throw error;
        }
    }
    
    static async updateMasterPassword(newPassword) {
        try {
            const docRef = doc(db, COLL.MASTER_PASS, 'config');
            await setDoc(docRef, { password: newPassword });
            return true;
        } catch (error) {
            console.error('Errore aggiornamento master password:', error);
            throw error;
        }
    }
    
    // === GESTIONE DIPENDENTI ===
    static async getEmployees() {
        try {
            const docRef = doc(db, COLL.EMPLOYEES, 'list');
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return docSnap.data().employees || [];
            } else {
                return [];
            }
        } catch (error) {
            console.error('Errore caricamento dipendenti:', error);
            throw error;
        }
    }
    
    static async saveEmployees(employees) {
        try {
            const docRef = doc(db, COLL.EMPLOYEES, 'list');
            await setDoc(docRef, { employees });
            return true;
        } catch (error) {
            console.error('Errore salvataggio dipendenti:', error);
            throw error;
        }
    }
    
    // === GESTIONE CANTIERI ===
    static async getCantieri() {
        try {
            const docRef = doc(db, COLL.CANTIERI, 'list');
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return docSnap.data().cantieri || [];
            } else {
                return [];
            }
        } catch (error) {
            console.error('Errore caricamento cantieri:', error);
            throw error;
        }
    }
    
    static async saveCantieri(cantieri) {
        try {
            const docRef = doc(db, COLL.CANTIERI, 'list');
            await setDoc(docRef, { cantieri });
            return true;
        } catch (error) {
            console.error('Errore salvataggio cantieri:', error);
            throw error;
        }
    }
    
    // === GESTIONE ORE LAVORATIVE ===
    static async getOreLavorative(employeeId, date) {
        try {
            const docRef = doc(db, COLL.DIPENDENTI, employeeId, COLL.ORE_SUB, date);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return docSnap.data();
            } else {
                // Restituisce struttura di default
                return {
                    data: date,
                    stato: 'Normale',
                    attivita: []
                };
            }
        } catch (error) {
            console.error('Errore caricamento ore lavorative:', error);
            throw error;
        }
    }
    
    static async saveOreLavorative(employeeId, date, data) {
        try {
            const docRef = doc(db, COLL.DIPENDENTI, employeeId, COLL.ORE_SUB, date);
            await setDoc(docRef, {
                data: date,
                stato: data.stato || 'Normale',
                attivita: data.attivita || [],
                ultimaModifica: new Date().toISOString()
            });
            return true;
        } catch (error) {
            console.error('Errore salvataggio ore lavorative:', error);
            throw error;
        }
    }
    
    // Carica ore per un periodo
    static async getOrePeriodo(employeeId, startDate, endDate) {
        try {
            const collRef = collection(db, COLL.DIPENDENTI, employeeId, COLL.ORE_SUB);
            const q = query(
                collRef,
                where('data', '>=', startDate),
                where('data', '<=', endDate),
                orderBy('data', 'desc')
            );
            
            const querySnapshot = await getDocs(q);
            const ore = [];
            
            querySnapshot.forEach((doc) => {
                ore.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return ore;
        } catch (error) {
            console.error('Errore caricamento ore periodo:', error);
            throw error;
        }
    }
    
    // Carica tutte le ore di un dipendente per un mese
    static async getOreByMonth(employeeId, year, month) {
        try {
            const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];
            
            return await this.getOrePeriodo(employeeId, startDate, endDate);
        } catch (error) {
            console.error('Errore caricamento ore mensili:', error);
            throw error;
        }
    }
    
    // Carica riepilogo per tutti i dipendenti in un periodo
    static async getRiepilogoCompleto(startDate, endDate) {
        try {
            const employees = await this.getEmployees();
            const riepilogo = [];
            
            for (const employee of employees) {
                const ore = await this.getOrePeriodo(employee.id, startDate, endDate);
                riepilogo.push({
                    dipendente: employee,
                    ore: ore
                });
            }
            
            return riepilogo;
        } catch (error) {
            console.error('Errore caricamento riepilogo completo:', error);
            throw error;
        }
    }
    
    // === UTILITY ===
    
    // Elimina tutti i dati di un dipendente
    static async deleteEmployeeData(employeeId) {
        try {
            // Nota: In Firestore non possiamo eliminare una collezione direttamente
            // Dovremmo eliminare tutti i documenti uno per uno
            // Per ora loggiamo l'operazione
            console.log(`Richiesta eliminazione dati per dipendente: ${employeeId}`);
            
            // In un'implementazione completa, qui caricheremmo tutti i documenti
            // della sub-collezione 'ore' e li elimineremmo uno per uno
            
            return true;
        } catch (error) {
            console.error('Errore eliminazione dati dipendente:', error);
            throw error;
        }
    }
    
    // Ottieni statistiche generali
    static async getStatistiche() {
        try {
            const employees = await this.getEmployees();
            const cantieri = await this.getCantieri();
            
            // Calcola statistiche di base
            const stats = {
                totaleDipendenti: employees.length,
                totaleCantieri: cantieri.length,
                ultimoAggiornamento: new Date().toISOString()
            };
            
            return stats;
        } catch (error) {
            console.error('Errore caricamento statistiche:', error);
            throw error;
        }
    }
}