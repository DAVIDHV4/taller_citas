import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { account, databases, TALLER_CONFIG } from '../lib/appwrite'
import { ID, Query } from 'appwrite'
import '../estilos/Login.css' // Reusamos el estilo del login para que se vea igual

function Registro() {
  const navigate = useNavigate();
  
  // Estados del formulario
  const [formData, setFormData] = useState({ email: '', password: '', nombre: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Estados para selección de sede (si tiene varias)
  const [step, setStep] = useState(1); 
  const [misSedes, setMisSedes] = useState([]);
  const [usuarioNombre, setUsuarioNombre] = useState('');
  const [personalId, setPersonalId] = useState(null); // Guardamos el ID real

  const handleRegistro = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        // ---------------------------------------------------------
        // PASO 1: VERIFICAR SI ESTÁ AUTORIZADO (WHITELIST)
        // ---------------------------------------------------------
        let personalDoc = null;
        if (TALLER_CONFIG.COLLECTION_PERSONAL) {
            const checkPermiso = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID,
                TALLER_CONFIG.COLLECTION_PERSONAL,
                [ Query.equal('email', formData.email) ]
            );

            if (checkPermiso.documents.length === 0) {
                throw new Error("Este correo no ha sido autorizado por el Administrador.");
            }
            personalDoc = checkPermiso.documents[0];
            setUsuarioNombre(personalDoc.Nombre || personalDoc.nombre || formData.nombre);
            setPersonalId(personalDoc.$id);
        } else {
             // Si no hay tabla personal configurada (caso raro), no podemos seguir con la lógica nueva
             throw new Error("Error de configuración del sistema (Falta Tabla Personal).");
        }

        // ---------------------------------------------------------
        // PASO 2: CREAR CUENTA Y SESIÓN (AUTH)
        // ---------------------------------------------------------
        try {
            await account.create(ID.unique(), formData.email, formData.password, formData.nombre);
        } catch (authError) {
            if (authError.type === 'user_already_exists') {
                throw new Error("Este usuario ya está registrado. Ve al Login.");
            }
            throw authError;
        }

        // Iniciar sesión automáticamente
        await account.createEmailPasswordSession(formData.email, formData.password);

        // ---------------------------------------------------------
        // PASO 3: BUSCAR SEDES ASIGNADAS (Usando ID de Personal)
        // ---------------------------------------------------------
        const resAsignaciones = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID, 
            TALLER_CONFIG.COLLECTION_ASIGNACIONES, 
            [ Query.equal('personal_id', personalDoc.$id) ]
        );

        if (resAsignaciones.documents.length === 0) {
            alert("Cuenta creada, pero no tienes sedes asignadas. Contacta al admin.");
            navigate('/');
            return;
        }

        // Obtener detalles de las sedes
        const promesas = resAsignaciones.documents.map(async (a) => {
            try { return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, a.sede_id); } 
            catch (e) { return null; }
        });
        const sedesEncontradas = (await Promise.all(promesas)).filter(s => s !== null);

        // ---------------------------------------------------------
        // PASO 4: REDIRECCIONAR O MOSTRAR SELECCIÓN
        // ---------------------------------------------------------
        if (sedesEncontradas.length === 1) {
            // SOLO UNA SEDE -> Entrar directo
            entrarAlDashboard(sedesEncontradas[0], personalDoc.$id);
        } else {
            // VARIAS SEDES -> Mostrar lista (Paso 2)
            setMisSedes(sedesEncontradas);
            setStep(2); // Cambiamos la vista
            setLoading(false);
        }

    } catch (err) {
        setError(err.message);
        setLoading(false);
    }
  };

  // Función auxiliar para entrar (copiada de la lógica del Login)
  const entrarAlDashboard = async (sede, idPers) => {
      // Si no nos pasan el ID (caso raro), usamos el del estado
      const idReal = idPers || personalId;
      setLoading(true);

      try {
          // Verificar Rol en esa sede específica
          const res = await databases.listDocuments(
              TALLER_CONFIG.DATABASE_ID,
              TALLER_CONFIG.COLLECTION_ASIGNACIONES,
              [ 
                  Query.equal('personal_id', idReal),
                  Query.equal('sede_id', sede.$id)
              ]
          );

          if (res.documents.length > 0) {
              const asignacion = res.documents[0];
              const rolRaw = asignacion.rol || 'trabajador';
              const rol = rolRaw.toLowerCase().trim();

              if (rol === 'admin' || rol === 'administrador') {
                  navigate('/admin/dashboard', { state: { sede: sede, usuarioNombre: usuarioNombre } });
              } else {
                  navigate('/trabajador/dashboard', { state: { sede: sede, usuarioNombre: usuarioNombre } });
              }
          } else {
             alert("Error de permisos al intentar entrar.");
             navigate('/login');
          }
      } catch (error) {
          console.error(error);
          alert("Error de conexión.");
      }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        {/* VISTA 1: FORMULARIO DE REGISTRO */}
        {step === 1 ? (
            <>
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
                        {loading ? "Verificando..." : "Activar e Ingresar"}
                    </button>
                </form>
                <button className="btn-volver-mapa" onClick={() => navigate('/login')}>¿Ya tienes cuenta? Inicia Sesión</button>
            </>
        ) : (
            /* VISTA 2: SELECCIÓN DE SEDE (Si tiene múltiples) */
            <div className="seleccion-sede">
                <h3>¡Bienvenido, {usuarioNombre}!</h3>
                <p>Tu cuenta está lista. <br/>Selecciona una sede para empezar a trabajar:</p>
                
                {loading ? (
                    <p style={{textAlign:'center', color:'#3498db'}}>Ingresando...</p>
                ) : (
                    <div className="lista-sedes-opciones" style={{display:'flex', flexDirection:'column', gap:'10px', marginTop:'20px'}}>
                        {misSedes.map(s => (
                            <button 
                                key={s.$id} 
                                className="btn-sede-opcion" 
                                style={{padding:'15px', border:'1px solid #ccc', cursor:'pointer', borderRadius:'6px', background:'#f8f9fa', fontSize:'1rem'}} 
                                onClick={() => entrarAlDashboard(s, personalId)}
                            >
                                🏭 <strong>{s.nombre}</strong>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        )}

      </div>
    </div>
  )
}

export default Registro;