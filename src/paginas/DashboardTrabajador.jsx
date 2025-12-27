import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { databases, TALLER_CONFIG, account } from '../lib/appwrite'
import { Query } from 'appwrite'
import '../estilos/Dashboard.css' // Usamos el mismo CSS del Admin

function DashboardTrabajador() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sede, usuarioNombre } = location.state || {};

  // --- ESTADOS VISUALES ---
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [loadingGlobal, setLoadingGlobal] = useState(true);

  // --- ESTADOS DE DATOS ---
  const [citasHoy, setCitasHoy] = useState([]);
  const [loadingDatos, setLoadingDatos] = useState(false);
  
  // NUEVO: Estado para el nombre de la empresa
  const [nombreEmpresa, setNombreEmpresa] = useState('Cargando...');

  // 1. SEGURIDAD Y CARGA INICIAL
  useEffect(() => {
    if (!sede) {
        navigate('/login');
        return;
    }
    // Simula carga para evitar salto en iPhone
    setTimeout(() => setLoadingGlobal(false), 500);
  }, [sede, navigate]);

  // 2. NUEVO: OBTENER NOMBRE DE LA EMPRESA (TALLER)
  useEffect(() => {
      const fetchEmpresa = async () => {
          if (!sede) return;
          try {
              // Revisamos si la relación viene como objeto o como ID
              const relacion = sede.talleres || sede.taller_id;
              
              if (relacion) {
                  // Si ya tenemos el objeto con nombre, lo usamos directo
                  if (typeof relacion === 'object' && relacion.nombre) {
                      setNombreEmpresa(relacion.nombre);
                  } else {
                      // Si es solo un ID (o un objeto incompleto), consultamos la base de datos
                      const tId = (typeof relacion === 'object') ? relacion.$id : relacion;
                      const docTaller = await databases.getDocument(
                          TALLER_CONFIG.DATABASE_ID,
                          TALLER_CONFIG.COLLECTION_TALLERES || 'talleres',
                          tId
                      );
                      setNombreEmpresa(docTaller.nombre);
                  }
              } else {
                  setNombreEmpresa('Sin Empresa Asignada');
              }
          } catch (e) {
              console.error("Error buscando empresa:", e);
              setNombreEmpresa('Empresa');
          }
      };
      fetchEmpresa();
  }, [sede]);

  // 3. CARGAR CITAS
  const cargarCitas = async () => {
    try {
        setLoadingDatos(true);
        const hoyStr = new Date().toLocaleDateString('en-CA'); 

        const res = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID,
            TALLER_CONFIG.COLLECTION_CITAS,
            [ 
                Query.equal('sede', sede.$id),
                Query.orderAsc('fecha_hora'),
                Query.limit(100)
            ]
        );

        const filtradasPorFecha = res.documents.filter(cita => {
            const fechaCita = new Date(cita.fecha_hora).toLocaleDateString('en-CA');
            return fechaCita === hoyStr;
        });

        // ENRIQUECER DATOS
        const citasCompletas = await Promise.all(filtradasPorFecha.map(async (c) => {
            const nombreCompleto = `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Cliente sin nombre';
            let nombreServicio = '-';
            if (c.servicio) {
                try {
                    const docServ = await databases.getDocument(
                        TALLER_CONFIG.DATABASE_ID, 
                        'servicios', 
                        c.servicio
                    );
                    nombreServicio = docServ.nombre;
                } catch (e) {
                    nombreServicio = '(Servicio no encontrado)';
                }
            }
            return { ...c, clienteNombre: nombreCompleto, servicioNombre: nombreServicio };
        }));

        setCitasHoy(citasCompletas);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        setLoadingDatos(false);
    }
  };

  useEffect(() => { if (!loadingGlobal && sede) cargarCitas(); }, [loadingGlobal, sede]);

  const cerrarSesion = async () => {
      try { await account.deleteSession('current'); } catch(e){}
      navigate('/login');
  };

  const HEADER_HEIGHT = '70px';

  if (!sede) return null;

  if (loadingGlobal) {
      return (
          <div style={{height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f4f6f9', flexDirection:'column'}}>
              <div className="spinner" style={{width:'40px', height:'40px', border:'4px solid #3498db', borderTop:'4px solid transparent', borderRadius:'50%', animation:'spin 1s linear infinite'}}></div>
              <p style={{marginTop:'15px', color:'#555', fontWeight:'bold'}}>Cargando panel...</p>
              <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
      );
  }

  return (
    <div className="dashboard-layout">
        
        {/* BOTÓN FLOTANTE MÓVIL */}
        {!sidebarOpen && (
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)} title="Abrir Menú">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
        )}

        {/* BLUR MÓVIL */}
        {sidebarOpen && (
            <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)}></div>
        )}

        {/* --- SIDEBAR IZQUIERDO --- */}
        <aside className={`dashboard-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header-box" style={{height: HEADER_HEIGHT}}>
                <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Cerrar menú">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
            </div>

            <div className="sidebar-controls">
                {/* --- NUEVO: EMPRESA --- */}
                <div className="control-group">
                    <span className="control-label">Empresa</span>
                    <div style={{
                        color:'white', 
                        fontWeight:'bold', 
                        fontSize:'1.1rem', // Un poco más grande que la sede
                        marginBottom: '5px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {nombreEmpresa}
                    </div>
                </div>

                {/* --- SEDE ACTUAL --- */}
                <div className="control-group">
                    <span className="control-label">Sede Actual</span>
                    <div 
                        title={sede.direccion || sede.nombre} 
                        style={{
                            color:'white', 
                            fontWeight:'normal', // Normal para diferenciar de la empresa
                            fontSize:'0.9rem', 
                            padding:'10px', 
                            background:'rgba(255,255,255,0.1)', 
                            borderRadius:'6px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%'
                        }}
                    >
                        {sede.direccion || sede.nombre}
                    </div>
                </div>
            </div>

            <nav className="sidebar-menu">
                <button className="menu-btn active">
                    <span className="icon">📅</span> <span className="label">Agenda de Hoy</span>
                </button>
            </nav>
        </aside>

        {/* --- CONTENIDO PRINCIPAL --- */}
        <main className="dashboard-content">
            <header className="top-bar-sticky" style={{height: HEADER_HEIGHT}}>
                <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                    <div style={{textAlign:'right'}}>
                        <div style={{fontWeight:'bold', color:'#333', fontSize:'0.9rem'}}>{usuarioNombre}</div>
                        <div style={{fontSize:'0.7rem', color:'#888'}}>Trabajador</div>
                    </div>
                    <button onClick={cerrarSesion} style={{background:'#ffe2e5', color:'#f64e60', border:'none', padding:'8px 12px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.8rem'}}>
                        Cerrar Turno
                    </button>
                </div>
            </header>

            <div className="main-view-container">
                <div className="header-vista">
                    <h2>Citas para Hoy ({new Date().toLocaleDateString()})</h2>
                    <button className="btn-add" onClick={cargarCitas}>↻ Actualizar</button>
                </div>

                {loadingDatos ? <p style={{textAlign:'center', marginTop:'20px'}}>Cargando agenda...</p> : (
                    <div className="tabla-container">
                        {citasHoy.length === 0 ? (
                            <p className="vacio-msg">🎉 No hay trabajo pendiente para hoy.</p>
                        ) : (
                            <table className="tabla-datos">
                                <thead>
                                    <tr>
                                        <th>Hora</th>
                                        <th>Vehículo</th>
                                        <th>Servicio</th>
                                        <th>Cliente</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {citasHoy.map(cita => (
                                        <tr key={cita.$id}>
                                            <td style={{fontSize:'1.2rem', fontWeight:'bold', color:'#333'}}>
                                                {new Date(cita.fecha_hora).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </td>
                                            <td>
                                                <span style={{background:'#eee', padding:'5px 10px', borderRadius:'4px', fontWeight:'bold', border:'1px solid #ccc', display:'inline-block'}}>
                                                    {cita.placa}
                                                </span>
                                            </td>
                                            <td>{cita.servicioNombre}</td>
                                            <td>
                                                {cita.clienteNombre}
                                                <br/>
                                                <small style={{color:'#777'}}>{cita.telefono}</small>
                                            </td>
                                            <td><span className="badge-cupo">{cita.estado}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </main>
    </div>
  )
}

export default DashboardTrabajador;