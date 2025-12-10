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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 1. LIMPIEZA
      try { await account.deleteSession('current'); } catch (err) {}

      // 2. LOGIN REAL
      try {
          await account.createEmailPasswordSession(formData.email, formData.password);
      } catch (err) {
          console.error("ERROR REAL DE APPWRITE:", err);
          throw new Error(err.message); 
      }

      // 3. BUSCAR NOMBRE
      try {
        const resPersonal = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID,
            TALLER_CONFIG.COLLECTION_PERSONAL,
            [ Query.equal('email', formData.email) ]
        );
        if (resPersonal.documents.length > 0) {
            const p = resPersonal.documents[0];
            setUsuarioNombre(p.Nombre || p.nombre || "Usuario");
        } else {
            setUsuarioNombre("Admin");
        }
      } catch (err) { setUsuarioNombre("Admin"); }

      // 4. BUSCAR ASIGNACIONES
      const resAsignaciones = await databases.listDocuments(
        TALLER_CONFIG.DATABASE_ID,
        TALLER_CONFIG.COLLECTION_ASIGNACIONES,
        [ Query.equal('email', formData.email) ]
      );

      if (resAsignaciones.documents.length === 0) {
        throw new Error("No tienes sedes asignadas en la tabla 'Asignaciones'.");
      }

      // 5. BUSCAR DATOS DE SEDES
      const promesasDeSedes = resAsignaciones.documents.map(async (asignacion) => {
          try {
              return await databases.getDocument(
                  TALLER_CONFIG.DATABASE_ID,
                  TALLER_CONFIG.COLLECTION_SEDES,
                  asignacion.sede_id 
              );
          } catch (err) { return null; }
      });

      const sedesEncontradas = (await Promise.all(promesasDeSedes)).filter(s => s !== null);

      if (sedesEncontradas.length === 0) {
        throw new Error("Las sedes asignadas no existen (IDs incorrectos).");
      }

      // 6. FLUJO EXITOSO
      if (sedesEncontradas.length === 1) {
        entrarAlDashboard(sedesEncontradas[0]);
      } else {
        setMisSedes(sedesEncontradas);
        setStep(2); 
      }

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- AQUÍ ESTABA EL PROBLEMA ---
  const entrarAlDashboard = (sede) => {
    // Ya no mostramos alerta, vamos directo al grano.
    // Enviamos 'sede' porque así lo espera el Dashboard.
    navigate('/admin/dashboard', { state: { sede: sede } });
  };

  const cerrarSesion = async () => {
      try {
          await account.deleteSession('current');
          setStep(1);
          setFormData({ email: '', password: '' });
      } catch (error) { console.error(error); }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {step === 1 && (
            <>
                <div className="login-header">
                <h2>Panel Administrativo</h2>
                <p>Ingresa tus credenciales</p>
                </div>
                <form onSubmit={handleLogin}>
                <div className="form-group">
                    <label>Correo Electrónico</label>
                    <input type="email" placeholder="admin@taller.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required />
                </div>
                <div className="form-group">
                    <label>Contraseña</label>
                    <input type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required />
                </div>
                {error && <p className="error-msg" style={{color:'#d32f2f', background:'#ffebee', padding:'10px', borderRadius:'5px', fontSize:'0.9rem'}}>{error}</p>}
                <button type="submit" className="btn-entrar" disabled={loading}>{loading ? "Verificando..." : "Ingresar al Sistema"}</button>
                </form>
                <button className="btn-volver-mapa" onClick={() => navigate('/')}>← Volver al Mapa</button>
            </>
        )}
        {step === 2 && (
            <div className="seleccion-sede">
                <div className="login-header">
                    <h2>Hola, {usuarioNombre}</h2>
                    <p>Selecciona una sede:</p>
                </div>
                <div className="lista-sedes-opciones" style={{display:'flex', flexDirection:'column', gap:'10px', margin:'20px 0'}}>
                    {misSedes.map(sede => (
                        <button key={sede.$id} className="btn-sede-opcion" style={{padding:'15px', border:'1px solid #ddd', borderRadius:'8px', cursor:'pointer', background:'#f8f9fa', textAlign:'left', display:'flex', alignItems:'center', gap:'10px'}} onClick={() => entrarAlDashboard(sede)}>
                            <span>🏭</span><strong>{sede.nombre}</strong>
                        </button>
                    ))}
                </div>
                <button className="btn-volver-mapa" onClick={cerrarSesion}>Cerrar Sesión</button>
            </div>
        )}
      </div>
    </div>
  )
}

export default Login;