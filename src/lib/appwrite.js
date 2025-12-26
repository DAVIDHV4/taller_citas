import { Client, Databases, Account, Functions } from 'appwrite'; // 1. Importamos Functions

const client = new Client();
client
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('6934b4ee001dd1decad5'); // Tu Project ID

export const databases = new Databases(client);
export const account = new Account(client);
export const functions = new Functions(client); // 2. Exportamos Functions (CRUCIAL para evitar pantalla blanca)

export const TALLER_CONFIG = {
    DATABASE_ID: '6934b50a003c2a59287c',
    
    // ⚠️ REVISA ESTOS IDs: Deben ser los códigos largos de Appwrite (ej: '65a7...')
    // Si los dejas como 'sedes', no cargará la lista.
    COLLECTION_SEDES: 'sedes', 
    COLLECTION_SERVICIOS: 'servicios',
    COLLECTION_CITAS: 'citas',
    COLLECTION_CUPOS: 'cupos', 
    COLLECTION_PERSONAL: 'personal', 
    COLLECTION_ASIGNACIONES: 'asignaciones',
    COLLECTION_TALLERES: 'talleres',
    COLLECTION_RELACION_SEDE_SERVICIO: 'sedes_servicios',
    
    // ID de tu función
    FUNCTION_LOGIN_ID: '6949bb990026dea38117',
};