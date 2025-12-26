import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { account, functions, TALLER_CONFIG } from '../lib/appwrite' 
import '../estilos/Login.css'

function Login() {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  // --- ESTADOS ---
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); 
  const [usuarioNombre, setUsuarioNombre] = useState('');
  const [usuarioIdPersonal, setUsuarioIdPersonal] = useState(null); 
  
  // --- DATOS ---
  const [todasMisAsignaciones, setTodasMisAsignaciones] = useState([]); 
  const [talleresUnicos, setTalleresUnicos] = useState([]); 
  const [tallerSeleccionado, setTallerSeleccionado] = useState(null); 
  const [sedesDelTallerActivo, setSedesDelTallerActivo] = useState([]); 

  // --- 1. DETECTOR DE AUTO-LOGIN ---
  useEffect(() => {
      if (location.state?.autoLogin && location.state?.email && location.state?.password) {
          const { email, password } = location.state;
          setFormData({ email, password });
          ejecutarProcesoLogin(email, password);
      }
  }, [location]);

  // --- 2. LÓGICA CENTRAL DE LOGIN ---
  const ejecutarProcesoLogin = async (email, password) => {
    setError('');
    setLoading(true);
    
    try {
      try { await account.deleteSession('current'); } catch (err) {} 
      await account.createEmailPasswordSession(email, password);

      if (!TALLER_CONFIG.FUNCTION_LOGIN_ID) throw new Error("Falta configurar FUNCTION_LOGIN_ID");

      const execution = await functions.createExecution(
          TALLER_CONFIG.FUNCTION_LOGIN_ID, 
          '', 
          false, 
          `/?email=${encodeURIComponent(email)}`, 
          'GET' 
      );

      let response;
      try { response = JSON.parse(execution.responseBody); } 
      catch (e) { throw new Error("El servidor devolvió una respuesta inválida."); }
      
      if (!response.ok) throw new Error(response.error || "Error al obtener datos.");

      const { personal, asignaciones, sedes, talleres } = response.data;

      setUsuarioNombre(personal.Nombre || personal.nombre || "Usuario");
      setUsuarioIdPersonal(personal.$id);

      const asignacionesCruzadas = asignaciones.map(asig => {
          const sede = sedes.find(s => s.$id === asig.sede_id);
          if (!sede) return null;

          let tallerObj = { $id: 'gen', nombre: 'General' };
          const relTaller = sede.talleres || sede.taller_id;
          if (relTaller) {
              const tId = (typeof relTaller === 'object') ? relTaller.$id : relTaller;
              const encontrado = talleres.find(t => t.$id === tId);
              if (encontrado) tallerObj = encontrado;
          }
          return { ...asig, sedeFull: sede, tallerFull: tallerObj };
      }).filter(Boolean);

      if (asignacionesCruzadas.length === 0) throw new Error("Cuenta creada, pero sin sedes asignadas aún.");

      setTodasMisAsignaciones(asignacionesCruzadas);

      const mapaUnicos = new Map();
      asignacionesCruzadas.forEach(item => {
          if (item.tallerFull && item.tallerFull.$id) mapaUnicos.set(item.tallerFull.$id, item.tallerFull);
      });
      const listaTalleres = Array.from(mapaUnicos.values());
      setTalleresUnicos(listaTalleres);

      // --- AUTOMATIZACIÓN SI SOLO TIENE 1 SEDE ---
      if (asignacionesCruzadas.length === 1) {
          const unicaSede = asignacionesCruzadas[0].sedeFull;
          const unicoTaller = asignacionesCruzadas[0].tallerFull;
          
          setTallerSeleccionado(unicoTaller);
          localStorage.setItem('tallerActivo', JSON.stringify(unicoTaller));
          localStorage.setItem('sedeActiva', JSON.stringify(unicaSede));
          
          // Importante: Pasamos el nombre del usuario para que el dashboard sepa quién es
          verificarRolYRedirigir(unicaSede, personal.$id, asignacionesCruzadas, personal.Nombre || personal.nombre);
          return; 
      }

      if (listaTalleres.length > 0) {
          const primerTaller = listaTalleres[0];
          setTallerSeleccionado(primerTaller);
          filtrarSedesPorTaller(primerTaller.$id, asignacionesCruzadas);
      }

      setStep(2); 

    } catch (err) { 
        console.error(err);
        setError(err.message || "Error de conexión."); 
    } finally {
        setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    ejecutarProcesoLogin(formData.email, formData.password);
  };

  const filtrarSedesPorTaller = (tallerId, listaAsignaciones) => {
      const sedes = listaAsignaciones
          .filter(a => a.tallerFull && a.tallerFull.$id === tallerId)
          .map(a => a.sedeFull);
      
      const sedesUnicas = [];
      const map = new Map();
      for (const item of sedes) {
          if(!map.has(item.$id)){ map.set(item.$id, true); sedesUnicas.push(item); }
      }
      setSedesDelTallerActivo(sedesUnicas);
  };

  const handleCambioTaller = (e) => {
      const tallerId = e.target.value;
      const tallerObj = talleresUnicos.find(t => t.$id === tallerId);
      setTallerSeleccionado(tallerObj);
      filtrarSedesPorTaller(tallerId, todasMisAsignaciones);
  };

  const entrarAlDashboard = (sede) => {
    localStorage.setItem('tallerActivo', JSON.stringify(tallerSeleccionado));
    localStorage.setItem('sedeActiva', JSON.stringify(sede));
    verificarRolYRedirigir(sede, usuarioIdPersonal, todasMisAsignaciones, usuarioNombre);
  };

  // --- FUNCIÓN CORREGIDA DE REDIRECCIÓN ---
  const verificarRolYRedirigir = (sede, idPersonal, listaAsignaciones, nombreUser) => {
      const asignacion = listaAsignaciones.find(a => a.personal_id === idPersonal && a.sede_id === sede.$id);

      if (asignacion) {
          const rolRaw = asignacion.rol || 'trabajador';
          const rol = rolRaw.toLowerCase().trim(); 
          
          // Objeto con los datos que necesitan los dashboards
          const datosParaDashboard = { 
              state: { 
                  sede: sede, 
                  usuarioNombre: nombreUser // Pasamos el nombre para que salga en "Hola, Juan"
              } 
          };

          if (rol === 'admin' || rol === 'administrador') {
              navigate('/admin/dashboard', datosParaDashboard); 
          } else {
              navigate('/trabajador/dashboard', datosParaDashboard);
          }
      } else {
          alert("Error de permisos: No tienes rol asignado en esta sede.");
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
                    <button type="submit" className="btn-entrar" disabled={loading}>{loading ? "Conectando..." : "Ingresar"}</button>
                    <div style={{marginTop: '20px', textAlign: 'center', fontSize: '0.9rem', borderTop:'1px solid #eee', paddingTop:'15px'}}>
                        <p style={{marginBottom:'5px', color:'#666'}}>¿Eres nuevo empleado?</p>
                        <span style={{color: '#3498db', cursor: 'pointer', fontWeight: 'bold'}} onClick={() => navigate('/registro')}>Activa tu cuenta aquí</span>
                    </div>
                </form>
                <button className="btn-volver-mapa" onClick={() => navigate('/')} style={{marginTop:'10px'}}>← Volver al Mapa</button>
            </>
        ) : (
            <div className="seleccion-sede">
                <div style={{marginBottom:'20px', textAlign:'center'}}>
                    <p style={{color:'#7f8c8d', fontSize:'0.9rem'}}>Hola, <strong>{usuarioNombre}</strong></p>
                    <div style={{marginTop:'15px'}}>
                        {talleresUnicos.length > 1 ? (
                            <div style={{textAlign:'left'}}>
                                <label style={{fontSize:'0.85rem', color:'#666', display:'block', marginBottom:'5px'}}>Selecciona Empresa:</label>
                                <select value={tallerSeleccionado?.$id} onChange={handleCambioTaller} style={{width:'100%', padding:'10px', fontSize:'1rem', borderRadius:'6px', border:'2px solid #3498db', fontWeight:'bold', color:'#2c3e50', background:'white'}}>
                                    {talleresUnicos.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}
                                </select>
                            </div>
                        ) : (
                            <div style={{background:'#f0f8ff', padding:'10px', borderRadius:'8px', border:'1px solid #d6eaf8'}}>
                                <h2 style={{color:'#2c3e50', margin:'0', fontSize:'1.3rem'}}>🏢 {tallerSeleccionado?.nombre || 'Mi Taller'}</h2>
                            </div>
                        )}
                    </div>
                </div>
                <hr style={{border:'0', borderTop:'1px solid #eee', margin:'20px 0'}}/>
                <p style={{marginBottom:'10px', fontSize:'0.9rem', color:'#555', fontWeight:'600'}}>Selecciona la Sede:</p>
                <div className="lista-sedes-opciones" style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                    {sedesDelTallerActivo.length > 0 ? (
                        sedesDelTallerActivo.map(s => (
                            <button key={s.$id} className="btn-sede-opcion" style={{padding:'15px', border:'1px solid #e0e0e0', cursor:'pointer', borderRadius:'8px', background:'#fff', fontSize:'1rem', textAlign:'left', display:'flex', alignItems:'center', gap:'15px', transition:'all 0.2s', boxShadow:'0 2px 5px rgba(0,0,0,0.05)'}} onClick={() => entrarAlDashboard(s)}>
                                <span style={{fontSize:'1.5rem'}}>📍</span>
                                <div>
                                    <div style={{fontWeight:'bold', color:'#2c3e50'}}>{s.direccion || s.nombre}</div>
                                    {s.direccion && s.nombre !== s.direccion && <div style={{fontSize:'0.8rem', color:'#888'}}>{s.nombre}</div>}
                                </div>
                            </button>
                        ))
                    ) : (
                        <p style={{color:'#e74c3c', fontSize:'0.9rem', textAlign:'center', padding:'20px', background:'#fdedec', borderRadius:'6px'}}>No hay sedes asignadas en esta empresa.</p>
                    )}
                </div>
                <button onClick={() => { setStep(1); setTodasMisAsignaciones([]); setError(''); }} style={{marginTop:'30px', width:'100%', padding:'10px', background:'transparent', border:'none', cursor:'pointer', color:'#95a5a6', fontSize:'0.9rem', textDecoration:'underline'}}>Cerrar Sesión</button>
            </div>
        )}
      </div>
    </div>
  )
}

export default Login;