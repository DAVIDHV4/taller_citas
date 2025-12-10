import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { databases, TALLER_CONFIG, account } from '../lib/appwrite'
import { ID, Query } from 'appwrite'
import '../estilos/Dashboard.css'

// --- GRÁFICOS ---
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const sede = location.state?.sede;

  // Redirigir si no hay sede
  useEffect(() => {
    if (!sede) { navigate('/login'); }
  }, [sede, navigate]);

  const [tabActual, setTabActual] = useState('resumen'); 
  
  // DATOS GENERALES
  const [usuarioNombre, setUsuarioNombre] = useState('Admin'); // <--- NUEVO ESTADO PARA EL NOMBRE
  const [metrics, setMetrics] = useState({ citasHoy: 0, personalTotal: 0 });
  const [chartDataRaw, setChartDataRaw] = useState({}); 
  const [listaCitas, setListaCitas] = useState([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toLocaleDateString('en-CA'));

  // CUPOS
  const BLOQUES_BASE = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const [listaCuposDB, setListaCuposDB] = useState([]); 
  const [nuevoCupoHora, setNuevoCupoHora] = useState('');
  const [nuevoCupoCantidad, setNuevoCupoCantidad] = useState(3);

  // PERSONAL
  const [emailNuevo, setEmailNuevo] = useState('');
  const [listaPersonal, setListaPersonal] = useState([]);


  // =========================================
  // 1. OBTENER NOMBRE DEL USUARIO
  // =========================================
  useEffect(() => {
    const obtenerUsuario = async () => {
        try {
            const user = await account.get();
            // Usamos el nombre de la cuenta, si no tiene, usamos 'Admin'
            setUsuarioNombre(user.name || 'Admin');
        } catch (error) {
            console.error("No se pudo obtener usuario", error);
        }
    };
    obtenerUsuario();
  }, []);


  // =========================================
  // 2. CARGA DE DATOS DEL DASHBOARD
  // =========================================
  const cargarDatos = async () => {
      if (!sede) return;
      
      // VERIFICACIÓN DE SEGURIDAD
      if (!TALLER_CONFIG.COLLECTION_CUPOS) {
          alert("Falta configuración de CUPOS en appwrite.js"); return;
      }

      try {
        // 1. RESUMEN
        if (tabActual === 'resumen') {
            const hoyStr = new Date().toLocaleDateString('en-CA');
            const resCitasHoy = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS,
                [ Query.equal('sede', sede.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]
            );
            const citasFiltradas = resCitasHoy.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === hoyStr);
            
            const conteo = {};
            citasFiltradas.forEach(c => {
                const h = new Date(c.fecha_hora).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                const key = h.substring(0,2)+":00";
                conteo[key] = (conteo[key]||0) + 1;
            });
            
            let totalP = 0;
            try {
                const resP = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [Query.equal('sede_id', sede.$id)]);
                totalP = resP.total;
            } catch(e){}

            setMetrics({ citasHoy: citasFiltradas.length, personalTotal: totalP }); 
            setChartDataRaw(conteo);
        } 
        
        // 2. CUPOS
        else if (tabActual === 'cupos') {
            const res = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS,
                [ Query.equal('sede', sede.$id), Query.limit(100) ] 
            );
            const ordenados = res.documents.sort((a,b) => a.hora.localeCompare(b.hora));
            setListaCuposDB(ordenados);
        }

        // 3. CITAS
        else if (tabActual === 'citas') {
             const res = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS,
                [ Query.equal('sede', sede.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]
            );
            setListaCitas(res.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === fechaFiltro));
        }

        // 4. USUARIOS
        else if (tabActual === 'usuarios') {
             const res = await databases.listDocuments(
                TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES,
                [ Query.equal('sede_id', sede.$id) ]
            );
            setListaPersonal(res.documents);
        }

      } catch (error) { console.error("Error cargando datos:", error); }
  };

  useEffect(() => { cargarDatos(); }, [tabActual, fechaFiltro, sede]);


  // =========================================
  // GESTIÓN
  // =========================================
  
  const horasDisponiblesParaAgregar = useMemo(() => {
      const horasOcupadas = listaCuposDB.map(c => c.hora);
      return BLOQUES_BASE.filter(h => !horasOcupadas.includes(h));
  }, [listaCuposDB]);

  const formatoIntervalo = (hora) => {
      const fin = parseInt(hora.split(':')[0]) + 1;
      const finStr = fin < 10 ? `0${fin}:00` : `${fin}:00`;
      return `${hora} - ${finStr}`;
  };

  const crearCupo = async () => {
      if (!nuevoCupoHora) return alert("Selecciona una hora");
      try {
          await databases.createDocument(
              TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, ID.unique(),
              { sede: sede.$id, hora: nuevoCupoHora, cantidad: parseInt(nuevoCupoCantidad) }
          );
          alert("Horario habilitado correctamente.");
          setNuevoCupoHora('');
          cargarDatos(); 
      } catch (e) { alert("Error al crear: " + e.message); }
  };

  const actualizarCupo = async (id, cantidad) => {
      try {
          await databases.updateDocument(
              TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, id,
              { cantidad: parseInt(cantidad) }
          );
          alert("Actualizado.");
          cargarDatos();
      } catch (e) { alert(e.message); }
  };

  const borrarCupo = async (id) => {
      if(!window.confirm("¿Eliminar este horario?")) return;
      try {
          await databases.deleteDocument(
              TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, id
          );
          alert("Eliminado.");
          cargarDatos();
      } catch (e) { alert(e.message); }
  };

  const chartDataConfig = { labels: Object.keys(chartDataRaw), datasets: [{ label: 'Vehículos', data: Object.values(chartDataRaw), backgroundColor: '#3498db', borderRadius: 4 }] };

  const chartOptions = { responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Demanda por Horario' } } };

  const agregarUsuario = async (e) => {
      e.preventDefault();
      try {
          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), { email: emailNuevo, sede_id: sede.$id });
          alert("Usuario agregado."); setEmailNuevo(''); cargarDatos();
      } catch (e) { alert(e.message); }
  };

  const cerrarSesion = async () => {
      try { await account.deleteSession('current'); } catch(e){}
      navigate('/login');
  };

  if (!sede) return null;

  return (
    <div className="dashboard-layout">
        <div className="dashboard-sidebar">
            <div className="sidebar-brand">
                {/* --- CAMBIO AQUÍ: SALUDO PERSONALIZADO --- */}
                <h3>Hola, {usuarioNombre}</h3>
                <small>{sede.nombre}</small>
            </div>
            <nav className="sidebar-menu">
                <button className={tabActual === 'resumen' ? 'active' : ''} onClick={() => setTabActual('resumen')}>Resumen</button>
                <button className={tabActual === 'citas' ? 'active' : ''} onClick={() => setTabActual('citas')}>Citas</button>
                <button className={tabActual === 'cupos' ? 'active' : ''} onClick={() => setTabActual('cupos')}>Cupos</button>
                <button className={tabActual === 'usuarios' ? 'active' : ''} onClick={() => setTabActual('usuarios')}>Personal</button>
            </nav>
            <button className="btn-logout" onClick={cerrarSesion}>Salir</button>
        </div>

        <div className="dashboard-content">
            {/* RESUMEN */}
            {tabActual === 'resumen' && (
                <div className="vista-resumen">
                    <h2>Resumen del Día</h2>
                    <div className="metrics-grid">
                        <div className="metric-card blue"><h3>Citas Hoy</h3><p className="metric-value">{metrics.citasHoy}</p></div>
                        <div className="metric-card purple"><h3>Personal</h3><p className="metric-value">{metrics.personalTotal}</p></div>
                    </div>
                    <div className="chart-container-wrapper">
                        {metrics.citasHoy >= 0 && <Bar options={chartOptions} data={chartDataConfig} />}
                    </div>
                </div>
            )}

            {/* CITAS */}
            {tabActual === 'citas' && (
                <div className="vista-citas">
                    <div className="header-vista"><h2>Citas</h2><input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} /></div>
                    <div className="tabla-container">
                        <table className="tabla-datos">
                            <thead><tr><th>Hora</th><th>Placa</th><th>Cliente</th><th>Servicio</th><th>Estado</th></tr></thead>
                            <tbody>
                                {listaCitas.map(cita => (
                                    <tr key={cita.$id}>
                                        <td>{new Date(cita.fecha_hora).toLocaleTimeString()}</td>
                                        <td>{cita.placa}</td>
                                        <td>{cita.cliente}</td>
                                        <td>{cita.servicio ? cita.servicio.nombre : '-'}</td>
                                        <td>{cita.estado}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* GESTIÓN DE CUPOS */}
            {tabActual === 'cupos' && (
                <div className="vista-cupos">
                    <h2>Configuración de Horarios</h2>
                    <div className="panel-agregar-cupo">
                        <div className="input-group">
                            <label>Nuevo Horario</label>
                            <select value={nuevoCupoHora} onChange={e => setNuevoCupoHora(e.target.value)}>
                                <option value="">-- Seleccionar --</option>
                                {horasDisponiblesParaAgregar.map(h => (
                                    <option key={h} value={h}>{formatoIntervalo(h)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="input-group">
                            <label>Cupos</label>
                            <input type="number" min="1" value={nuevoCupoCantidad} onChange={e => setNuevoCupoCantidad(e.target.value)} />
                        </div>
                        <button className="btn-add" onClick={crearCupo} disabled={!nuevoCupoHora}>+ Agregar</button>
                    </div>

                    <h3>Horarios Activos:</h3>
                    {listaCuposDB.length === 0 ? <p className="vacio-msg">No hay horarios configurados.</p> : (
                        <div className="grid-config-cupos">
                            {listaCuposDB.map(cupo => (
                                <div key={cupo.$id} className="card-cupo-admin">
                                    <div className="cupo-header"><h4>{formatoIntervalo(cupo.hora)}</h4><span className="badge-cupo">Activo</span></div>
                                    <div className="cupo-body">
                                        <label>Cupos:</label>
                                        <input type="number" id={`input-cupo-${cupo.$id}`} defaultValue={cupo.cantidad} min="1" />
                                    </div>
                                    <div className="cupo-actions">
                                        <button className="btn-update" onClick={() => actualizarCupo(cupo.$id, document.getElementById(`input-cupo-${cupo.$id}`).value)}>Guardar</button>
                                        <button className="btn-delete" onClick={() => borrarCupo(cupo.$id)}>Borrar</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* USUARIOS */}
            {tabActual === 'usuarios' && (
                <div className="vista-usuarios">
                    <h2>Personal</h2>
                    <form className="form-add-user" onSubmit={agregarUsuario}>
                        <input type="email" value={emailNuevo} onChange={e => setEmailNuevo(e.target.value)} required />
                        <button type="submit">Agregar</button>
                    </form>
                    <div className="lista-usuarios"><ul>{listaPersonal.map(p => <li key={p.$id}>{p.email}</li>)}</ul></div>
                </div>
            )}
        </div>
    </div>
  )
}

export default Dashboard;