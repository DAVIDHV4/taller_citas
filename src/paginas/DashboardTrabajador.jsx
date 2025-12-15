import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { databases, TALLER_CONFIG, account } from '../lib/appwrite'
import { Query } from 'appwrite'
import '../estilos/Dashboard.css' // Reusamos los estilos para que se vea igual de bien

function DashboardTrabajador() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sede, usuarioNombre } = location.state || {};

  // Seguridad: Si no hay sede, fuera.
  useEffect(() => {
    if (!sede) navigate('/login');
  }, [sede, navigate]);

  const [citasHoy, setCitasHoy] = useState([]);
  const [loading, setLoading] = useState(true);

  // Cargar SOLO citas de hoy
  const cargarCitas = async () => {
    try {
        setLoading(true);
        const hoyStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

        // Traemos las citas pendientes o confirmadas de esta sede
        const res = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID,
            TALLER_CONFIG.COLLECTION_CITAS,
            [ 
                Query.equal('sede', sede.$id),
                Query.orderAsc('fecha_hora'), // Las más tempranas primero
                Query.limit(100)
            ]
        );

        // Filtramos en memoria para asegurar la fecha exacta
        const filtradas = res.documents.filter(cita => {
            const fechaCita = new Date(cita.fecha_hora).toLocaleDateString('en-CA');
            return fechaCita === hoyStr;
        });

        setCitasHoy(filtradas);
    } catch (error) {
        console.error("Error:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => { if(sede) cargarCitas(); }, [sede]);

  const cerrarSesion = async () => {
      try { await account.deleteSession('current'); } catch(e){}
      navigate('/login');
  };

  if (!sede) return null;

  return (
    <div className="dashboard-layout">
        {/* SIDEBAR SIMPLIFICADA */}
        <div className="dashboard-sidebar" style={{background: '#2c3e50'}}>
            <div className="sidebar-brand">
                <h3>Hola, {usuarioNombre}</h3>
                <small>Panel de Operaciones</small>
            </div>
            <nav className="sidebar-menu">
                <button className="active">📅 Agenda de Hoy</button>
            </nav>
            <div style={{padding: '20px', color:'#aaa', fontSize:'0.8rem'}}>
                Sede: <br/> <strong>{sede.nombre}</strong>
            </div>
            <button className="btn-logout" onClick={cerrarSesion}>Cerrar Turno</button>
        </div>

        {/* CONTENIDO PRINCIPAL */}
        <div className="dashboard-content">
            <div className="header-vista">
                <h2>Citas para Hoy ({new Date().toLocaleDateString()})</h2>
                <button className="btn-add" onClick={cargarCitas}>↻ Actualizar Lista</button>
            </div>

            {loading ? <p>Cargando agenda...</p> : (
                <div className="tabla-container">
                    {citasHoy.length === 0 ? (
                        <p className="vacio">🎉 No hay trabajo pendiente para hoy.</p>
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
                                            <span style={{background:'#eee', padding:'5px 10px', borderRadius:'4px', fontWeight:'bold', border:'1px solid #ccc'}}>
                                                {cita.placa}
                                            </span>
                                        </td>
                                        <td>{cita.servicio ? cita.servicio.nombre : 'General'}</td>
                                        <td>{cita.cliente}<br/><small>{cita.telefono}</small></td>
                                        <td><span className="badge">{cita.estado}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    </div>
  )
}

export default DashboardTrabajador;