import { Client, Databases, Account } from 'appwrite';

const client = new Client();
client
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('6934b4ee001dd1decad5'); // Tu Project ID

export const databases = new Databases(client);
export const account = new Account(client);

export const TALLER_CONFIG = {
    DATABASE_ID: '6934b50a003c2a59287c',
    COLLECTION_SEDES: 'sedes',
    COLLECTION_SERVICIOS: 'servicios',
    COLLECTION_CITAS: 'citas',
    COLLECTION_CUPOS: 'cupos', 
    COLLECTION_PERSONAL: 'personal', 
    COLLECTION_ASIGNACIONES: 'asignaciones',
    COLLECTION_TALLERES: 'talleres',
    COLLECTION_RELACION_SEDE_SERVICIO: 'sedes_servicios',
};