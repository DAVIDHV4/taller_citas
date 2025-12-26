import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { account, databases, TALLER_CONFIG } from '../lib/appwrite'
import { ID, Query } from 'appwrite'
import '../estilos/Login.css'

function Registro() {
  const navigate = useNavigate();
  
  // Estados del formulario
  const [formData, setFormData] = useState({ email: '', password: '', nombre: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegistro = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        // ---------------------------------------------------------
        // PASO 1: VERIFICAR SI ESTÁ AUTORIZADO (WHITELIST)
        // ---------------------------------------------------------
        if (TALLER_CONFIG.COLLECTION_PERSONAL) {
            const checkPermiso = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID,
                TALLER_CONFIG.COLLECTION_PERSONAL,
                [ Query.equal('email', formData.email) ]
            );

            if (checkPermiso.documents.length === 0) {
                throw new Error("Este correo no ha sido autorizado por el Administrador.");
            }
        } else {
             throw new Error("Error de configuración del sistema (Falta Tabla Personal).");
        }

        // ---------------------------------------------------------
        // PASO 2: CREAR CUENTA (AUTH)
        // ---------------------------------------------------------
        try {
            await account.create(ID.unique(), formData.email, formData.password, formData.nombre);
        } catch (authError) {
            if (authError.type === 'user_already_exists') {
                throw new Error("Este usuario ya está registrado. Ve al Login.");
            }
            throw authError;
        }

        // ---------------------------------------------------------
        // PASO 3: REDIRECCIÓN AL LOGIN (LO QUE PEDISTE)
        // ---------------------------------------------------------
        // En lugar de iniciar sesión aquí, enviamos los datos al Login
        // para que él haga el trabajo difícil (API, Sedes, Roles, etc.)
        navigate('/login', { 
            state: { 
                autoLogin: true, 
                email: formData.email, 
                password: formData.password 
            } 
        });

    } catch (err) {
        setError(err.message);
        setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        <div className="login-header">
            <h2>Activar Cuenta</h2>
            <p>Crea tu contraseña de acceso</p>
        </div>

        <form onSubmit={handleRegistro}>
            <div className="form-group">
                <label>Tu Nombre</label>
                <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} placeholder="Ej. Juan Perez" />
            </div>
            <div className="form-group">
                <label>Email (Autorizado)</label>
                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="correo@empresa.com" />
            </div>
            <div className="form-group">
                <label>Crea tu Contraseña</label>
                <input type="password" required minLength="8" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Mínimo 8 caracteres" />
            </div>
            
            {error && <p className="error-msg">{error}</p>}
            
            <button type="submit" className="btn-entrar" disabled={loading}>
                {loading ? "Registrando..." : "Activar e Ingresar"}
            </button>
        </form>

        <button className="btn-volver-mapa" onClick={() => navigate('/login')}>¿Ya tienes cuenta? Inicia Sesión</button>

      </div>
    </div>
  )
}

export default Registro;