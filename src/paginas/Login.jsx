import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { account, databases, TALLER_CONFIG } from '../lib/appwrite' 
import { Query } from 'appwrite'
import '../estilos/Login.css'

function Login() {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [step, setStep] = useState(1); 
  const [misSedes, setMisSedes] = useState([]);
  const [usuarioNombre, setUsuarioNombre] = useState('');
  const [usuarioIdPersonal, setUsuarioIdPersonal] = useState(null); // Guardamos el ID real de la tabla Personal

  // ==========================================
  // 1. MANEJAR EL INICIO DE SESIÓN
  // ==========================================
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      try { await account.deleteSession('current'); } catch (err) {} 

      // A. Autenticación (Email/Pass)
      try {
          await account.createEmailPasswordSession(formData.email, formData.password);
      } catch (err) { throw new Error("Credenciales inválidas."); }

      // B. BUSCAR EL 'ID' REAL EN LA TABLA PERSONAL
      // (Ahora esto es obligatorio para encontrar asignaciones)
      let personalDoc = null;
      if (TALLER_CONFIG.COLLECTION_PERSONAL) {
          const resPersonal = await databases.listDocuments(
              TALLER_CONFIG.DATABASE_ID, 
              TALLER_CONFIG.COLLECTION_PERSONAL, 
              [ Query.equal('email', formData.email) ]
          );
          if (resPersonal.documents.length > 0) {
               personalDoc = resPersonal.documents[0];
               setUsuarioNombre(personalDoc.Nombre || personalDoc.nombre || "Usuario");
               setUsuarioIdPersonal(personalDoc.$id); // <--- GUARDAMOS EL ID
          } else {
               // Si entra aquí, es que tiene cuenta Auth pero no está en la tabla Personal
               throw new Error("Tu usuario no tiene un perfil de personal creado. Contacta al administrador.");
          }
      }

      // C. BUSCAR ASIGNACIONES USANDO 'personal_id' (Ya no email)
      const resAsignaciones = await databases.listDocuments(
          TALLER_CONFIG.DATABASE_ID, 
          TALLER_CONFIG.COLLECTION_ASIGNACIONES, 
          [ Query.equal('personal_id', personalDoc.$id) ] // <--- CAMBIO AQUÍ
      );
      
      if (resAsignaciones.documents.length === 0) throw new Error("No tienes sedes asignadas.");

      // D. Buscar los datos reales de las Sedes
      const promesas = resAsignaciones.documents.map(async (a) => {
          try { return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, a.sede_id); } 
          catch (e) { return null; }
      });
      const sedesEncontradas = (await Promise.all(promesas)).filter(s => s !== null);

      if (sedesEncontradas.length === 0) throw new Error("Error de configuración de sedes.");

      // E. Decidir siguiente paso
      if (sedesEncontradas.length === 1) {
          verificarRolYRedirigir(sedesEncontradas[0], personalDoc.$id);
      } else {
          setMisSedes(sedesEncontradas); 
          setStep(2); 
          setLoading(false);
      }

    } catch (err) { 
        setError(err.message); 
        setLoading(false);
    } 
  };

  // ==========================================
  // 2. LÓGICA DE REDIRECCIÓN
  // ==========================================
  const entrarAlDashboard = (sede) => {
    verificarRolYRedirigir(sede, usuarioIdPersonal);
  };

  const verificarRolYRedirigir = async (sede, idPersonal) => {
      setLoading(true);
      try {
          // Buscamos la asignación usando ID DE PERSONAL y SEDE
          const res = await databases.listDocuments(
              TALLER_CONFIG.DATABASE_ID,
              TALLER_CONFIG.COLLECTION_ASIGNACIONES,
              [ 
                  Query.equal('personal_id', idPersonal), // <--- CAMBIO AQUÍ
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
              throw new Error("Error de permisos.");
          }
      } catch (error) {
          console.error(error);
          alert("Error verificando rol");
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        {step === 1 ? (
            <>
                <div className="login-header">
                    <h2>Acceso al Sistema</h2>
                    <p>Ingresa tus credenciales</p>
                </div>
                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Contraseña</label>
                        <input type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
                    </div>
                    
                    {error && <p className="error-msg">{error}</p>}
                    
                    <button type="submit" className="btn-entrar" disabled={loading}>{loading ? "Verificando..." : "Ingresar"}</button>

                    <div style={{marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                        <p style={{marginBottom:'5px', color:'#666'}}>¿Eres nuevo empleado?</p>
                        <span style={{color: '#3498db', cursor: 'pointer', fontWeight: 'bold'}} onClick={() => navigate('/registro')}>Activa tu cuenta aquí</span>
                    </div>
                </form>
                <button className="btn-volver-mapa" onClick={() => navigate('/')} style={{marginTop:'10px'}}>← Volver al Mapa</button>
            </>
        ) : (
            <div className="seleccion-sede">
                <h3>Hola, {usuarioNombre}</h3>
                <p>Selecciona una sede para continuar:</p>
                
                {loading ? (
                    <p style={{textAlign:'center', color:'#3498db'}}>Redirigiendo...</p>
                ) : (
                    <div className="lista-sedes-opciones" style={{display:'flex', flexDirection:'column', gap:'10px', marginTop:'20px'}}>
                        {misSedes.map(s => (
                            <button key={s.$id} className="btn-sede-opcion" style={{padding:'15px', border:'1px solid #ccc', cursor:'pointer', borderRadius:'6px', background:'#f8f9fa', fontSize:'1rem'}} onClick={() => entrarAlDashboard(s)}>
                                🏭 <strong>{s.nombre}</strong>
                            </button>
                        ))}
                    </div>
                )}
                
                {/* --- BOTÓN NUEVO: VOLVER A LOGIN --- */}
                <button 
                    onClick={() => { setStep(1); setMisSedes([]); setError(''); }}
                    style={{marginTop:'20px', width:'100%', padding:'10px', background:'transparent', border:'1px solid #ccc', borderRadius:'5px', cursor:'pointer', color:'#666'}}
                >
                    ← Cambiar Cuenta
                </button>
            </div>
        )}
      </div>
    </div>
  )
}

export default Login;