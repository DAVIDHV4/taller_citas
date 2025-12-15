import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { databases, TALLER_CONFIG, account } from '../lib/appwrite'
import { ID, Query } from 'appwrite'
import '../estilos/Dashboard.css'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const sedeActual = location.state?.sede;

  useEffect(() => {
    if (!sedeActual) { navigate('/login'); }
  }, [sedeActual, navigate]);

  const [tabActual, setTabActual] = useState('resumen'); 
  const [usuarioNombre, setUsuarioNombre] = useState('Cargando...'); 
  const [misSedesAsignadas, setMisSedesAsignadas] = useState([]);

  // DATOS
  const [metrics, setMetrics] = useState({ citasHoy: 0, personalTotal: 0 });
  const [chartDataRaw, setChartDataRaw] = useState({}); 
  const [listaCitas, setListaCitas] = useState([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toLocaleDateString('en-CA'));
  
  // CUPOS
  const BLOQUES_BASE = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
  const [listaCuposDB, setListaCuposDB] = useState([]); 
  const [nuevoCupoHora, setNuevoCupoHora] = useState('');
  const [nuevoCupoCantidad, setNuevoCupoCantidad] = useState(3);

  // --- GESTIÓN PERSONAL AVANZADA ---
  const [listaPersonalGlobal, setListaPersonalGlobal] = useState([]); 
  const [listaSedesSelector, setListaSedesSelector] = useState([]); 
  
  // FILTROS Y BUSCADOR PERSONAL
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSedeId, setFilterSedeId] = useState(''); // '' = Todos

  // MODAL CREAR NUEVO
  const [modalUserOpen, setModalUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserSede, setNewUserSede] = useState(sedeActual?.$id); // <--- Restaurado
  const [newUserRole, setNewUserRole] = useState('trabajador');    // <--- Restaurado

  // MODAL GESTIONAR
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [asignacionesEmpleado, setAsignacionesEmpleado] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(false);
  
  const [addSedeId, setAddSedeId] = useState('');
  const [addSedeRol, setAddSedeRol] = useState('trabajador');

  const [notification, setNotification] = useState(null); 
  const [modalConfirmOpen, setModalConfirmOpen] = useState(false); 
  const [itemToDelete, setItemToDelete] = useState(null); 

  const notify = (msg, type = 'success') => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
  };

  // =========================================
  // CARGA INICIAL
  // =========================================
  useEffect(() => {
    const cargarDatosIniciales = async () => {
        try {
            const user = await account.get();
            let personalId = null;

            if (TALLER_CONFIG.COLLECTION_PERSONAL) {
                try {
                    const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [ Query.equal('email', user.email) ]);
                    if (res.documents.length > 0) {
                        const p = res.documents[0];
                        setUsuarioNombre(p.Nombre || user.name);
                        personalId = p.$id;
                    } else { setUsuarioNombre(user.name); }
                } catch(e) { setUsuarioNombre(user.name); }
            }

            // Cargar TODAS las sedes (Para filtros y asignaciones)
            const resTodasSedes = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES);
            setListaSedesSelector(resTodasSedes.documents);
            if(resTodasSedes.documents.length > 0) {
                setAddSedeId(resTodasSedes.documents[0].$id);
            }

            // Sedes del Admin (Para el dropdown de cambio rápido)
            if (personalId) {
                const resAsign = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [ Query.equal('personal_id', personalId) ]);
                const sedesPropias = await Promise.all(resAsign.documents.map(async (asig) => {
                    try { return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, asig.sede_id); } 
                    catch { return null; }
                }));
                setMisSedesAsignadas(sedesPropias.filter(s => s !== null));
            }
        } catch (error) { console.error(error); }
    };
    cargarDatosIniciales();
  }, []);

  const cambiarSede = (idNuevaSede) => {
      const nuevaSedeObj = misSedesAsignadas.find(s => s.$id === idNuevaSede);
      if (nuevaSedeObj) navigate('/admin/dashboard', { state: { sede: nuevaSedeObj } });
  };

  // =========================================
  // CARGA DE DATOS
  // =========================================
  const cargarDatos = async () => {
      if (!sedeActual) return;
      try {
        if (tabActual === 'resumen') {
            const hoyStr = new Date().toLocaleDateString('en-CA');
            const resCitas = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, [ Query.equal('sede', sedeActual.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]);
            const citasHoy = resCitas.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === hoyStr);
            
            const conteo = {};
            citasHoy.forEach(c => {
                const h = new Date(c.fecha_hora).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
                const key = h.substring(0,2)+":00";
                conteo[key] = (conteo[key]||0) + 1;
            });

            let totalP = 0;
            if(TALLER_CONFIG.COLLECTION_PERSONAL) {
                const resP = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.limit(1)]);
                totalP = resP.total;
            }
            setMetrics({ citasHoy: citasHoy.length, personalTotal: totalP }); 
            setChartDataRaw(conteo);
        } 
        else if (tabActual === 'cupos') {
            const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, [ Query.equal('sede', sedeActual.$id), Query.limit(100) ]);
            setListaCuposDB(res.documents.sort((a,b) => a.hora.localeCompare(b.hora)));
        }
        else if (tabActual === 'citas') {
             const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, [ Query.equal('sede', sedeActual.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]);
            setListaCitas(res.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === fechaFiltro));
        }
        else if (tabActual === 'usuarios') {
             // LÓGICA DE FILTRADO POR SEDE
             if (TALLER_CONFIG.COLLECTION_PERSONAL) {
                 if (filterSedeId === '') {
                     // Ver TODOS
                     const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.limit(100)]);
                     setListaPersonalGlobal(res.documents);
                 } else {
                     // Ver SOLO SEDE SELECCIONADA
                     // 1. Buscar asignaciones de esa sede
                     const resAsig = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [Query.equal('sede_id', filterSedeId)]);
                     // 2. Traer los datos personales de esos IDs
                     const empleadosFiltrados = await Promise.all(resAsig.documents.map(async (a) => {
                        try { return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, a.personal_id); }
                        catch { return null; }
                     }));
                     setListaPersonalGlobal(empleadosFiltrados.filter(e => e !== null));
                 }
             }
        }
      } catch (error) { console.error("Error datos:", error); }
  };

  // Recargar si cambia el tab, el filtro de fecha, la sede actual O EL FILTRO DE SEDE EN PERSONAL
  useEffect(() => { cargarDatos(); }, [tabActual, fechaFiltro, sedeActual, filterSedeId]);

  // =========================================
  // GESTIÓN EMPLEADO
  // =========================================
  const abrirGestionEmpleado = async (empleado) => {
      setEmpleadoSeleccionado(empleado);
      setModalEditOpen(true);
      cargarAsignaciones(empleado.$id);
  };

  const cargarAsignaciones = async (idPersonal) => {
      setLoadingAsignaciones(true);
      try {
          const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [ Query.equal('personal_id', idPersonal) ]);
          const asignacionesCompletas = await Promise.all(res.documents.map(async (asig) => {
              try {
                  const infoSede = await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, asig.sede_id);
                  return { ...asig, nombreSede: infoSede.nombre };
              } catch { return { ...asig, nombreSede: 'Sede Eliminada' }; }
          }));
          setAsignacionesEmpleado(asignacionesCompletas);
      } catch (e) { console.error(e); }
      finally { setLoadingAsignaciones(false); }
  };

  const guardarCambiosBasicos = async (e) => {
      e.preventDefault();
      try {
          await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, empleadoSeleccionado.$id, { Nombre: empleadoSeleccionado.Nombre, email: empleadoSeleccionado.email });
          notify("✅ Datos actualizados"); cargarDatos();
      } catch (e) { notify("Error: " + e.message, "error"); }
  };

  const agregarNuevaSedeAlEmpleado = async () => {
      if(!addSedeId) return;
      const existe = asignacionesEmpleado.find(a => a.sede_id === addSedeId);
      if(existe) { notify("⚠️ Ya tiene asignada esa sede", "error"); return; }
      try {
          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), { personal_id: empleadoSeleccionado.$id, sede_id: addSedeId, rol: addSedeRol });
          notify("✅ Sede asignada"); cargarAsignaciones(empleadoSeleccionado.$id);
      } catch (e) { notify(e.message, "error"); }
  };

  const quitarSedeAlEmpleado = async (idAsignacion) => {
      if(!window.confirm("¿Quitar acceso a esta sede?")) return;
      try {
          await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, idAsignacion);
          notify("🗑️ Acceso eliminado"); cargarAsignaciones(empleadoSeleccionado.$id);
      } catch (e) { notify(e.message, "error"); }
  };

  // --- CREAR NUEVO EMPLEADO + ASIGNACIÓN EN 1 PASO ---
  const crearNuevoEmpleado = async (e) => {
      e.preventDefault();
      try {
          let personalId = null;

          // 1. Crear/Buscar Ficha Personal
          if (TALLER_CONFIG.COLLECTION_PERSONAL) {
              const check = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.equal('email', newUserEmail)]);
              if(check.documents.length > 0) { 
                  // Si ya existe, usamos ese ID
                  personalId = check.documents[0].$id;
                  notify("⚠️ El empleado ya existía, se le asignará la nueva sede.");
              } else {
                  // Si no, lo creamos
                  const nuevo = await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, ID.unique(), { email: newUserEmail, Nombre: newUserName });
                  personalId = nuevo.$id;
              }

              // 2. Crear Asignación Inmediata
              // Verificar si ya tiene esa sede para no duplicar
              const checkAsign = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [
                  Query.equal('personal_id', personalId),
                  Query.equal('sede_id', newUserSede)
              ]);

              if(checkAsign.documents.length === 0) {
                  await databases.createDocument(
                      TALLER_CONFIG.DATABASE_ID, 
                      TALLER_CONFIG.COLLECTION_ASIGNACIONES, 
                      ID.unique(), 
                      { personal_id: personalId, sede_id: newUserSede, rol: newUserRole }
                  );
                  notify("✅ Empleado creado y asignado exitosamente.");
              } else {
                  notify("⚠️ El empleado ya tenía acceso a esta sede.");
              }

              setModalUserOpen(false); setNewUserEmail(''); setNewUserName('');
              cargarDatos();
          }
      } catch (e) { notify(e.message, "error"); }
  };

  // --- FILTRADO EN MEMORIA (BUSCADOR) ---
  const listaPersonalFiltrada = listaPersonalGlobal.filter(p => {
      if (!searchTerm) return true;
      const texto = searchTerm.toLowerCase();
      return (p.Nombre && p.Nombre.toLowerCase().includes(texto)) || 
             (p.email && p.email.toLowerCase().includes(texto));
  });

  // --- UTILS ---
  const formatoIntervalo = (h) => { const f = parseInt(h.split(':')[0])+1; return `${h} - ${f < 10 ? '0'+f : f}:00`; };
  const horasDisponibles = useMemo(() => BLOQUES_BASE.filter(h => !listaCuposDB.map(c=>c.hora).includes(h)), [listaCuposDB]);
  const crearCupo = async () => { if(!nuevoCupoHora) return; try { await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, ID.unique(), { sede: sedeActual.$id, hora: nuevoCupoHora, cantidad: parseInt(nuevoCupoCantidad)}); notify("✅ Horario creado"); setNuevoCupoHora(''); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  const actualizarCupo = async (id, v) => { try { await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, id, {cantidad: parseInt(v)}); notify("✅ Actualizado"); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  const borrarCupo = async () => { if(itemToDelete) { await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, itemToDelete); notify("🗑️ Eliminado"); setModalConfirmOpen(false); cargarDatos(); } };
  const cerrarSesion = async () => { try { await account.deleteSession('current'); } catch(e){} navigate('/login'); };

  const chartDataConfig = { labels: Object.keys(chartDataRaw), datasets: [{ label: 'Vehículos', data: Object.values(chartDataRaw), backgroundColor: '#3498db', borderRadius: 4 }] };

  if (!sedeActual) return null;

  return (
    <div className="dashboard-layout">
        {notification && <div className={`notification-toast ${notification.type}`}>{notification.type==='success'?'👍':'⚠️'} {notification.msg}</div>}
        
        {modalConfirmOpen && <div className="modal-overlay"><div className="modal-content"><h3>Confirmar</h3><p>¿Eliminar horario?</p><div className="modal-buttons"><button className="btn-modal-cancel" onClick={()=>setModalConfirmOpen(false)}>No</button><button className="btn-modal-confirm" onClick={borrarCupo}>Sí</button></div></div></div>}

        {/* MODAL CREAR EMPLEADO + ASIGNACIÓN */}
        {modalUserOpen && (
            <div className="modal-overlay">
                <div className="modal-content">
                    <h3>Nuevo Empleado</h3>
                    <p>Registra y asigna acceso inmediato.</p>
                    <form onSubmit={crearNuevoEmpleado} className="form-modal-body">
                        <div><label>Nombre:</label><input value={newUserName} onChange={e=>setNewUserName(e.target.value)} required placeholder="Ej. Ana Gomez"/></div>
                        <div><label>Email:</label><input type="email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} required placeholder="ana@taller.com"/></div>
                        
                        {/* SELECTOR DE SEDE Y ROL EN LA CREACIÓN */}
                        <div style={{display:'flex', gap:'10px'}}>
                            <div style={{flex:1}}>
                                <label>Sede Inicial:</label>
                                <select value={newUserSede} onChange={e=>setNewUserSede(e.target.value)} style={{width:'100%', padding:'10px', background:'#f9f9f9'}}>
                                    {listaSedesSelector.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}
                                </select>
                            </div>
                            <div style={{width:'120px'}}>
                                <label>Rol:</label>
                                <select value={newUserRole} onChange={e=>setNewUserRole(e.target.value)} style={{width:'100%', padding:'10px'}}>
                                    <option value="trabajador">Trabajador</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>

                        <div className="modal-buttons" style={{marginTop:'15px'}}>
                            <button type="button" className="btn-modal-cancel" onClick={()=>setModalUserOpen(false)}>Cancelar</button>
                            <button type="submit" className="btn-add-user" style={{justifyContent:'center'}}>Guardar y Asignar</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL GESTIONAR EMPLEADO */}
        {modalEditOpen && empleadoSeleccionado && (
            <div className="modal-overlay"><div className="modal-content" style={{maxWidth:'600px', textAlign:'left'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}><h3 style={{margin:0}}>Gestionar: {empleadoSeleccionado.Nombre}</h3><button onClick={()=>setModalEditOpen(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>×</button></div>
                <form onSubmit={guardarCambiosBasicos} style={{background:'#f4f6f8', padding:'15px', borderRadius:'8px', marginBottom:'20px'}}><h4 style={{marginTop:0, fontSize:'0.9rem', color:'#555', textTransform:'uppercase'}}>Datos Personales</h4><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px'}}><div><label style={{fontSize:'0.8rem'}}>Nombre</label><input value={empleadoSeleccionado.Nombre} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, Nombre: e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}/></div><div><label style={{fontSize:'0.8rem'}}>Email</label><input value={empleadoSeleccionado.email} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, email: e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}/></div></div><button type="submit" style={{marginTop:'10px', padding:'6px 12px', background:'#2ecc71', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}>Guardar Cambios</button></form>
                <div><h4 style={{fontSize:'0.9rem', color:'#555', textTransform:'uppercase'}}>Acceso a Sedes</h4><div style={{maxHeight:'150px', overflowY:'auto', border:'1px solid #eee', borderRadius:'4px', marginBottom:'10px'}}>{loadingAsignaciones ? <p style={{padding:'10px'}}>Cargando...</p> : (asignacionesEmpleado.length === 0 ? <p style={{padding:'10px', color:'#999'}}>Sin sedes.</p> : (<table style={{width:'100%', borderCollapse:'collapse'}}><thead><tr style={{background:'#f9f9f9', fontSize:'0.8rem'}}><th style={{padding:'8px', textAlign:'left'}}>Sede</th><th style={{padding:'8px', textAlign:'left'}}>Rol</th><th></th></tr></thead><tbody>{asignacionesEmpleado.map(asig => (<tr key={asig.$id} style={{borderBottom:'1px solid #eee'}}><td style={{padding:'8px'}}>{asig.nombreSede}</td><td style={{padding:'8px'}}><span className="badge" style={{fontSize:'0.7rem', padding:'2px 6px'}}>{asig.rol}</span></td><td style={{padding:'8px', textAlign:'right'}}><button onClick={()=>quitarSedeAlEmpleado(asig.$id)} style={{background:'#e74c3c', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}>Quitar</button></td></tr>))}</tbody></table>))}</div><div style={{display:'flex', gap:'10px', alignItems:'end', background:'#eef2f7', padding:'10px', borderRadius:'6px'}}><div style={{flex:1}}><label style={{fontSize:'0.7rem'}}>Asignar Sede:</label><select value={addSedeId} onChange={e=>setAddSedeId(e.target.value)} style={{width:'100%', padding:'6px'}}>{listaSedesSelector.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}</select></div><div style={{width:'120px'}}><label style={{fontSize:'0.7rem'}}>Rol:</label><select value={addSedeRol} onChange={e=>setAddSedeRol(e.target.value)} style={{width:'100%', padding:'6px'}}><option value="trabajador">Trabajador</option><option value="admin">Admin</option></select></div><button onClick={agregarNuevaSedeAlEmpleado} style={{background:'#3498db', color:'white', border:'none', padding:'8px 15px', borderRadius:'4px', cursor:'pointer'}}>+ Asignar</button></div></div></div></div>
        )}

        <div className="dashboard-sidebar">
            <div className="sidebar-brand">
                <h3>Hola, {usuarioNombre}</h3>
                <select value={sedeActual.$id} onChange={(e) => cambiarSede(e.target.value)} style={{width: '100%', background: '#34495e', color: 'white', border: 'none', padding: '5px', borderRadius: '4px', marginTop: '5px', fontSize: '0.85rem', cursor: 'pointer'}}>
                    {misSedesAsignadas.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}
                    {misSedesAsignadas.length === 0 && <option value={sedeActual.$id}>{sedeActual.nombre}</option>}
                </select>
            </div>
            <nav className="sidebar-menu">
                <button className={tabActual === 'resumen'?'active':''} onClick={()=>setTabActual('resumen')}>📊 Resumen</button>
                <button className={tabActual === 'citas'?'active':''} onClick={()=>setTabActual('citas')}>📅 Citas</button>
                <button className={tabActual === 'cupos'?'active':''} onClick={()=>setTabActual('cupos')}>⚙️ Cupos</button>
                <button className={tabActual === 'usuarios'?'active':''} onClick={()=>setTabActual('usuarios')}>👥 Personal</button>
            </nav>
            <button className="btn-logout" onClick={cerrarSesion}>Salir</button>
        </div>

        <div className="dashboard-content">
            {tabActual === 'resumen' && (
                <div className="vista-resumen">
                    <h2>Resumen del Día</h2>
                    <div className="metrics-grid">
                        <div className="metric-card blue"><h3>Citas Hoy</h3><p className="metric-value">{metrics.citasHoy}</p></div>
                        <div className="metric-card purple"><h3>Personal Global</h3><p className="metric-value">{metrics.personalTotal}</p></div>
                    </div>
                    <div className="chart-container-wrapper"><Bar options={{ responsive: true }} data={chartDataConfig} /></div>
                </div>
            )}
            {tabActual === 'citas' && (
                <div className="vista-citas">
                    <div className="header-vista"><h2>Citas</h2><input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)}/></div>
                    <div className="tabla-container"><table className="tabla-datos"><thead><tr><th>Hora</th><th>Placa</th><th>Cliente</th><th>Servicio</th><th>Estado</th></tr></thead><tbody>{listaCitas.map(c=><tr key={c.$id}><td>{new Date(c.fecha_hora).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td><td>{c.placa}</td><td>{c.cliente}</td><td>{c.servicio?.nombre||'-'}</td><td>{c.estado}</td></tr>)}</tbody></table></div>
                </div>
            )}
            {tabActual === 'cupos' && (
                <div className="vista-cupos">
                    <h2>Configuración de Horarios</h2>
                    <div className="panel-agregar-cupo"><div className="input-group"><label>Nuevo</label><select value={nuevoCupoHora} onChange={e=>setNuevoCupoHora(e.target.value)}><option value="">--</option>{horasDisponibles.map(h=><option key={h} value={h}>{formatoIntervalo(h)}</option>)}</select></div><div className="input-group"><label>Cupos</label><input type="number" min="1" value={nuevoCupoCantidad} onChange={e=>setNuevoCupoCantidad(e.target.value)}/></div><button className="btn-add" onClick={crearCupo}>+ Agregar</button></div>
                    <h3>Horarios Activos</h3>{listaCuposDB.length===0?<p className="vacio-msg">Sin horarios.</p>:<div className="grid-config-cupos">{listaCuposDB.map(c=><div key={c.$id} className="card-cupo-admin"><div className="cupo-header"><h4>{formatoIntervalo(c.hora)}</h4><span className="badge-cupo">Activo</span></div><div className="cupo-body"><input type="number" id={`i-${c.$id}`} defaultValue={c.cantidad}/></div><div className="cupo-actions"><button className="btn-update" onClick={()=>actualizarCupo(c.$id, document.getElementById(`i-${c.$id}`).value)}>Guardar</button><button className="btn-delete" onClick={()=>{setItemToDelete(c.$id);setModalConfirmOpen(true)}}>Borrar</button></div></div>)}</div>}
                </div>
            )}

            {/* --- VISTA PERSONAL CON FILTROS --- */}
            {tabActual === 'usuarios' && (
                <div className="vista-usuarios">
                    <div className="header-users">
                        <div><h2>Personal</h2><p>Gestión global de empleados.</p></div>
                        <button className="btn-add-user" onClick={() => {
                            setNewUserSede(sedeActual.$id); // Pre-cargar sede actual
                            setModalUserOpen(true);
                        }}>+ Crear Empleado</button>
                    </div>
                    
                    {/* BARRA DE HERRAMIENTAS: BUSCADOR Y FILTRO SEDE */}
                    <div style={{display:'flex', gap:'10px', marginBottom:'20px', background:'white', padding:'10px', borderRadius:'8px', border:'1px solid #eee'}}>
                        <input 
                            type="text" 
                            placeholder="🔍 Buscar por nombre o email..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{flex:1, padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}
                        />
                        <select 
                            value={filterSedeId} 
                            onChange={e => setFilterSedeId(e.target.value)}
                            style={{width:'200px', padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}
                        >
                            <option value="">📁 Todas las Sedes</option>
                            {listaSedesSelector.map(s => <option key={s.$id} value={s.$id}>🏭 {s.nombre}</option>)}
                        </select>
                    </div>

                    <div className="lista-usuarios-grid">
                        {listaPersonalFiltrada.length === 0 && <p className="vacio-msg">No se encontraron empleados con ese criterio.</p>}
                        {listaPersonalFiltrada.map(p => (
                            <div key={p.$id} className="usuario-item" style={{cursor:'pointer'}} onClick={() => abrirGestionEmpleado(p)}>
                                <div className="user-info">
                                    <span className="user-email">{p.Nombre}</span>
                                    <span className="user-role" style={{fontSize:'0.8rem', color:'#666'}}>{p.email}</span>
                                </div>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                    <span style={{fontSize:'1.2rem', color:'#ccc'}}>➜</span>
                                    <button className="btn-editar" style={{background:'#f0f0f0', border:'1px solid #ccc', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>Gestionar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
  )
}

export default Dashboard;