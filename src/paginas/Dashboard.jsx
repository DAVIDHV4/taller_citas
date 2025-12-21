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

  // Evitar pantalla blanca si recargan
  if (!sedeActual) {
    return (
        <div style={{color: '#333', padding: '50px', textAlign: 'center'}}>
            <h2>⚠️ Sesión no encontrada</h2>
            <p>Por favor, inicia sesión nuevamente.</p>
            <button onClick={() => navigate('/login')} style={{padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>Ir al Login</button>
        </div>
    );
  }

  // --- ESTADO MENÚ LATERAL ---
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const [tabActual, setTabActual] = useState('resumen'); 
  const [usuarioNombre, setUsuarioNombre] = useState('Cargando...'); 
  const [misSedesAsignadas, setMisSedesAsignadas] = useState([]);

  // --- NUEVOS ESTADOS ---
  const [listaTalleres, setListaTalleres] = useState([]); 
  const [listaSedesGlobal, setListaSedesGlobal] = useState([]); 

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

  // GESTIÓN PERSONAL
  const [listaPersonalGlobal, setListaPersonalGlobal] = useState([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSedeId, setFilterSedeId] = useState('');

  // MODALES
  const [modalUserOpen, setModalUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newAssignments, setNewAssignments] = useState([]); 

  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [asignacionesEmpleado, setAsignacionesEmpleado] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(false);
  
  const [addTallerId, setAddTallerId] = useState('');
  const [addSedeId, setAddSedeId] = useState('');
  const [addSedeRol, setAddSedeRol] = useState('trabajador');

  const [notification, setNotification] = useState(null); 
  const [modalConfirmOpen, setModalConfirmOpen] = useState(false); 
  const [itemToDelete, setItemToDelete] = useState(null); 

  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };

  // --- CARGAS DE DATOS ---
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

            // 1. CARGAR TALLERES
            try {
                const idTalleres = TALLER_CONFIG.COLLECTION_TALLERES || 'talleres'; 
                const resTalleres = await databases.listDocuments(
                    TALLER_CONFIG.DATABASE_ID, 
                    idTalleres, 
                    [
                        Query.limit(100),       
                        Query.orderAsc('nombre') 
                    ]
                );
                setListaTalleres(resTalleres.documents);
            } catch (e) { 
                console.error("Error cargando talleres:", e); 
                notify("Error cargando lista de talleres", "error");
            }

            // 2. CARGAR SEDES (GLOBAL)
            const resSedes = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, [Query.limit(100)]);
            setListaSedesGlobal(resSedes.documents); 

            if (personalId) {
                const resAsign = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [ Query.equal('personal_id', personalId) ]);
                const sedesPropias = await Promise.all(resAsign.documents.map(async (asig) => {
                    try { return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, asig.sede_id); } catch { return null; }
                }));
                setMisSedesAsignadas(sedesPropias.filter(s => s !== null));
            }
        } catch (error) { console.error(error); }
    };
    cargarDatosIniciales();
  }, []);

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
        } else if (tabActual === 'cupos') {
            const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, [ Query.equal('sede', sedeActual.$id), Query.limit(100) ]);
            setListaCuposDB(res.documents.sort((a,b) => a.hora.localeCompare(b.hora)));
        } else if (tabActual === 'citas') {
             const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, [ Query.equal('sede', sedeActual.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]);
            setListaCitas(res.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === fechaFiltro));
        } else if (tabActual === 'usuarios') {
             if (TALLER_CONFIG.COLLECTION_PERSONAL) {
                 const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.limit(100)]);
                 setListaPersonalGlobal(res.documents);
             }
        }
      } catch (error) { console.error("Error datos:", error); }
  };
  useEffect(() => { cargarDatos(); }, [tabActual, fechaFiltro, sedeActual, filterSedeId]);

  // --- DESCARGAR SEDES ---
  const descargarSedesCSV = async () => {
    try {
      const res = await databases.listDocuments(
        TALLER_CONFIG.DATABASE_ID, 
        TALLER_CONFIG.COLLECTION_SEDES, 
        [Query.limit(100)]
      );

      if (res.documents.length === 0) return alert("No hay sedes para exportar");

      const primerDoc = res.documents[0];
      const columnasIgnoradas = ['$databaseId', '$collectionId', '$permissions', '$updatedAt'];
      // Forzamos que el $id salga primero, luego el resto
      const otrasKeys = Object.keys(primerDoc).filter(key => !columnasIgnoradas.includes(key) && key !== '$id');
      const cabeceras = ['$id', ...otrasKeys];

      const filas = res.documents.map(doc => {
        return cabeceras.map(columna => {
          let valor = doc[columna];
          if (valor === null || valor === undefined) return "";
          if (typeof valor === 'object') return `"${valor.$id || 'Objeto'}"`; 
          return `"${String(valor).replace(/"/g, '""')}"`; 
        }).join(",");
      });

      const csvContent = [cabeceras.join(","), ...filas].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "lista_sedes.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) { console.error(error); alert("Error: " + error.message); }
  };

  // --- DESCARGAR SERVICIOS ---
  const descargarServiciosCSV = async () => {
    try {
      const res = await databases.listDocuments(
        TALLER_CONFIG.DATABASE_ID, 
        TALLER_CONFIG.COLLECTION_SERVICIOS || 'servicios', 
        [Query.limit(100)]
      );

      if (res.documents.length === 0) return alert("No hay servicios para exportar");

      const primerDoc = res.documents[0];
      const columnasIgnoradas = ['$databaseId', '$collectionId', '$permissions', '$updatedAt'];
      const otrasKeys = Object.keys(primerDoc).filter(key => !columnasIgnoradas.includes(key) && key !== '$id');
      const cabeceras = ['$id', ...otrasKeys];

      const filas = res.documents.map(doc => {
        return cabeceras.map(columna => {
          let valor = doc[columna];
          if (valor === null || valor === undefined) return "";
          if (typeof valor === 'object') return `"${valor.$id || 'Objeto'}"`;
          return `"${String(valor).replace(/"/g, '""')}"`; 
        }).join(",");
      });

      const csvContent = [cabeceras.join(","), ...filas].join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", "lista_servicios.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) { console.error(error); alert("Error: " + error.message); }
  };

  // FUNCIONES AUXILIARES
  const cambiarSede = (id) => { const s = misSedesAsignadas.find(x => x.$id === id); if(s) navigate('/admin/dashboard', { state: { sede: s } }); };
  const cerrarSesion = async () => { try { await account.deleteSession('current'); } catch(e){} navigate('/login'); };
  
  // GESTION EMPLEADO
  const abrirGestionEmpleado = async (e) => { 
      setEmpleadoSeleccionado(e); setModalEditOpen(true); setAddTallerId(''); setAddSedeId(''); 
      cargarAsignaciones(e.$id); 
  };
  const cargarAsignaciones = async (id) => { 
      setLoadingAsignaciones(true); 
      try { 
          const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [Query.equal('personal_id', id)]); 
          const full = await Promise.all(res.documents.map(async a => { 
              let nombreSede = 'Eliminada', nombreTaller = '-';
              try{ const i=await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, a.sede_id); nombreSede=i.nombre; }catch{}
              try{ 
                  const relacionTaller = a.talleres || a.taller_id;
                  if(relacionTaller) { 
                       if (typeof relacionTaller === 'object' && relacionTaller.nombre) {
                           nombreTaller = relacionTaller.nombre;
                       } else {
                           const tID = (typeof relacionTaller === 'object') ? relacionTaller.$id : relacionTaller;
                           const t=await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_TALLERES || 'talleres', tID); 
                           nombreTaller=t.nombre; 
                       }
                  } 
              }catch{}
              return {...a, nombreSede, nombreTaller}
          })); 
          setAsignacionesEmpleado(full); 
      } catch(e){console.error(e)} finally{setLoadingAsignaciones(false)} 
  };
  const guardarCambiosBasicos = async (e) => { e.preventDefault(); try { await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, empleadoSeleccionado.$id, { Nombre: empleadoSeleccionado.Nombre, email: empleadoSeleccionado.email }); notify("✅ Actualizado"); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  
  const agregarNuevaSedeAlEmpleado = async () => { 
      if(!addTallerId || !addSedeId) return notify("⚠️ Faltan datos", "error");
      try{ 
          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), {
              personal_id:empleadoSeleccionado.$id, 
              talleres: addTallerId, 
              sede_id:addSedeId, 
              rol:addSedeRol
          }); 
          notify("✅ Asignado"); 
          cargarAsignaciones(empleadoSeleccionado.$id); 
      } catch(e){
          try {
             await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), {
              personal_id:empleadoSeleccionado.$id, 
              taller_id: addTallerId, 
              sede_id:addSedeId, 
              rol:addSedeRol
             });
             notify("✅ Asignado");
             cargarAsignaciones(empleadoSeleccionado.$id);
          } catch(err2) { notify(e.message,"error"); }
      } 
  };
  const quitarSedeAlEmpleado = async (id) => { if(!window.confirm("¿Quitar acceso?"))return; try{ await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, id); notify("🗑️ Quitado"); cargarAsignaciones(empleadoSeleccionado.$id); }catch(e){notify(e.message,"error");} };
  
  // --- NUEVA LÓGICA DEL MODAL "CREAR EMPLEADO" ---
  const agregarFilaSede = () => setNewAssignments([...newAssignments, { taller: '', sede: '', rol: 'trabajador' }]);
  const quitarFilaSede = (i) => { const c=[...newAssignments]; c.splice(i,1); setNewAssignments(c); };
  const actualizarFila = (i,f,v) => { const c=[...newAssignments]; c[i][f]=v; if(f==='taller')c[i]['sede']=''; setNewAssignments(c); };
  
  const crearNuevoEmpleado = async (e) => { 
      e.preventDefault(); 
      try { 
          let pid=null; 
          const chk=await databases.listDocuments(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_PERSONAL,[Query.equal('email',newUserEmail)]); 
          if(chk.documents.length>0){pid=chk.documents[0].$id; notify("ℹ️ Usuario existente, asignando...");}
          else{const n=await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_PERSONAL,ID.unique(),{email:newUserEmail,Nombre:newUserName}); pid=n.$id;} 
          
          let c=0; 
          for(const a of newAssignments){ 
              if(a.taller && a.sede) {
                  try {
                      await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_ASIGNACIONES,ID.unique(),{
                          personal_id:pid, 
                          talleres: a.taller,
                          sede_id:a.sede, 
                          rol:a.rol
                      }); 
                      c++;
                  } catch(err) {
                      await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_ASIGNACIONES,ID.unique(),{
                          personal_id:pid, 
                          taller_id: a.taller,
                          sede_id:a.sede, 
                          rol:a.rol
                      }); 
                      c++;
                  }
              }
          } 
          notify(`✅ Listo. ${c} asignaciones.`); setModalUserOpen(false); setNewUserEmail(''); setNewUserName(''); cargarDatos(); 
      } catch(e){notify(e.message,"error");} 
  };
  
  const abrirModalCreacion = () => { setNewUserName(''); setNewUserEmail(''); setNewAssignments([{ taller: '', sede: '', rol: 'trabajador' }]); setModalUserOpen(true); };
  
  const crearCupo = async () => { if(!nuevoCupoHora) return; try { await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, ID.unique(), { sede: sedeActual.$id, hora: nuevoCupoHora, cantidad: parseInt(nuevoCupoCantidad)}); notify("✅ Horario creado"); setNuevoCupoHora(''); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  const actualizarCupo = async (id, v) => { try { await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, id, {cantidad: parseInt(v)}); notify("✅ Actualizado"); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  const borrarCupo = async () => { if(itemToDelete) { await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, itemToDelete); notify("🗑️ Eliminado"); setModalConfirmOpen(false); cargarDatos(); } };
  
  const listaPersonalFiltrada = listaPersonalGlobal.filter(p => (!searchTerm || (p.Nombre && p.Nombre.toLowerCase().includes(searchTerm.toLowerCase())) || (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))));
  const formatoIntervalo = (h) => { const f = parseInt(h.split(':')[0])+1; return `${h} - ${f < 10 ? '0'+f : f}:00`; };
  const horasDisponibles = useMemo(() => BLOQUES_BASE.filter(h => !listaCuposDB.map(c=>c.hora).includes(h)), [listaCuposDB]);
  const chartDataConfig = { labels: Object.keys(chartDataRaw), datasets: [{ label: 'Vehículos', data: Object.values(chartDataRaw), backgroundColor: '#3498db', borderRadius: 4 }] };

  return (
    <div className="dashboard-layout">
        {notification && <div className={`notification-toast ${notification.type}`}>{notification.type==='success'?'👍':'⚠️'} {notification.msg}</div>}
        {modalConfirmOpen && <div className="modal-overlay"><div className="modal-content"><h3>Confirmar</h3><p>¿Eliminar horario?</p><div className="modal-buttons"><button className="btn-modal-cancel" onClick={()=>setModalConfirmOpen(false)}>No</button><button className="btn-modal-confirm" onClick={borrarCupo}>Sí</button></div></div></div>}
        
        <button className={`menu-toggle-btn ${sidebarOpen ? 'text-white' : 'text-dark'}`} onClick={() => setSidebarOpen(!sidebarOpen)} title="Menú">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>

        {/* MODAL CREAR USUARIO - SOLO DIRECCIÓN (O NOMBRE SI NO HAY DIRECCIÓN) */}
        {modalUserOpen && (
            <div className="modal-overlay">
                <div className="modal-content" style={{maxWidth:'550px'}}>
                    <div className="modal-header">
                        <h3>Nuevo Empleado</h3>
                        <p>Crea el perfil y asigna sus accesos</p>
                    </div>
                    
                    <form onSubmit={crearNuevoEmpleado}>
                        {/* DATOS BÁSICOS */}
                        <div className="form-group">
                            <label>Nombre Completo</label>
                            <input className="form-input" value={newUserName} onChange={e=>setNewUserName(e.target.value)} required placeholder="Ej. Juan Pérez" />
                        </div>
                        <div className="form-group">
                            <label>Correo Electrónico</label>
                            <input className="form-input" type="email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} required placeholder="juan@taller.com" />
                        </div>

                        {/* LISTA DE ASIGNACIONES */}
                        <div style={{borderTop:'1px solid #eee', paddingTop:'15px', marginTop:'20px'}}>
                            <label style={{display:'block', marginBottom:'10px', color:'#7f8c8d', fontSize:'0.9rem', fontWeight:'600'}}>ASIGNACIONES DE TALLER Y SEDE</label>
                            
                            <div className="assignments-container">
                                {newAssignments.map((a, i) => {
                                    // CORRECCIÓN: Filtrar buscando la columna 'talleres' o 'taller_id'
                                    const sedesDelTaller = listaSedesGlobal.filter(s => {
                                        const relacion = s.talleres || s.taller_id;
                                        const tId = (relacion && typeof relacion === 'object') ? relacion.$id : relacion;
                                        return tId === a.taller;
                                    });

                                    return (
                                        <div key={i} className="assignment-card">
                                            {newAssignments.length > 1 && (
                                                <button type="button" className="btn-remove-mini" onClick={() => quitarFilaSede(i)}>×</button>
                                            )}
                                            
                                            <div className="assignment-row">
                                                <div style={{flex: 1}}>
                                                    <select className="form-input" value={a.taller} onChange={e => actualizarFila(i, 'taller', e.target.value)}>
                                                        <option value="">-- Selecciona Taller --</option>
                                                        {listaTalleres.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}
                                                    </select>
                                                </div>
                                                <div style={{width: '130px'}}>
                                                    <select className="form-input" value={a.rol} onChange={e => actualizarFila(i, 'rol', e.target.value)}>
                                                        <option value="trabajador">Trabajador</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <select className="form-input" value={a.sede} onChange={e => actualizarFila(i, 'sede', e.target.value)} disabled={!a.taller} style={{backgroundColor: !a.taller ? '#f0f0f0' : 'white'}}>
                                                    <option value="">{a.taller ? '-- Selecciona Sede --' : '-- Primero elige Taller --'}</option>
                                                    {sedesDelTaller.map(s => (
                                                        <option key={s.$id} value={s.$id}>
                                                            {/* CAMBIO AQUÍ: SOLO DIRECCIÓN */}
                                                            {s.direccion ? s.direccion : s.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            <button type="button" className="btn-add-dashed" onClick={agregarFilaSede}>
                                + Agregar otra asignación
                            </button>
                        </div>

                        <div className="modal-buttons" style={{marginTop:'25px'}}>
                            <button type="button" className="btn-modal-cancel" onClick={()=>setModalUserOpen(false)}>Cancelar</button>
                            <button type="submit" className="btn-add-user" style={{justifyContent:'center', minWidth:'150px'}}>Guardar Todo</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL EDITAR - SOLO DIRECCIÓN */}
        {modalEditOpen && empleadoSeleccionado && (
            <div className="modal-overlay">
                <div className="modal-content" style={{maxWidth:'600px', textAlign:'left'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                        <h3 style={{margin:0}}>Gestionar: {empleadoSeleccionado.Nombre}</h3>
                        <button onClick={()=>setModalEditOpen(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>×</button>
                    </div>
                    <form onSubmit={guardarCambiosBasicos} style={{background:'#f9f9f9', padding:'15px', borderRadius:'8px', marginBottom:'20px'}}>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                            <div><label style={{fontSize:'0.8rem', fontWeight:'bold'}}>Nombre</label><input className="form-input" value={empleadoSeleccionado.Nombre} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, Nombre: e.target.value})}/></div>
                            <div><label style={{fontSize:'0.8rem', fontWeight:'bold'}}>Email</label><input className="form-input" value={empleadoSeleccionado.email} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, email: e.target.value})}/></div>
                        </div>
                        <button type="submit" style={{marginTop:'10px', padding:'8px 15px', background:'#2ecc71', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}>Guardar Cambios</button>
                    </form>
                    
                    <h4 style={{fontSize:'0.9rem', color:'#555', textTransform:'uppercase', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>Accesos y Permisos</h4>
                    <div style={{maxHeight:'200px', overflowY:'auto', marginBottom:'15px'}}>
                        {asignacionesEmpleado.length === 0 ? <p style={{padding:'10px', color:'#999'}}>Sin accesos.</p> : (
                            <table style={{width:'100%', borderCollapse:'collapse'}}>
                                <thead><tr style={{background:'#f1f2f6', fontSize:'0.8rem', color:'#555'}}><th style={{padding:'8px', textAlign:'left'}}>Taller</th><th style={{padding:'8px', textAlign:'left'}}>Sede</th><th style={{padding:'8px'}}>Rol</th><th></th></tr></thead>
                                <tbody>
                                    {asignacionesEmpleado.map(asig => (
                                        <tr key={asig.$id} style={{borderBottom:'1px solid #eee'}}>
                                            <td style={{padding:'8px', fontSize:'0.9rem'}}>{asig.nombreTaller}</td>
                                            <td style={{padding:'8px', fontSize:'0.9rem'}}>{asig.nombreSede}</td>
                                            <td style={{padding:'8px', textAlign:'center'}}><span className="badge" style={{fontSize:'0.7rem'}}>{asig.rol}</span></td>
                                            <td style={{padding:'8px', textAlign:'right'}}><button onClick={()=>quitarSedeAlEmpleado(asig.$id)} style={{background:'#e74c3c', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}>Quitar</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div style={{background:'#eef2f7', padding:'15px', borderRadius:'8px', border:'1px solid #dae1e7'}}>
                        <h5 style={{margin:'0 0 10px 0'}}>Agregar Nuevo Acceso</h5>
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px'}}>
                            <select className="form-input" value={addTallerId} onChange={e=>{setAddTallerId(e.target.value); setAddSedeId('');}}>
                                <option value="">-- Taller --</option>
                                {listaTalleres.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}
                            </select>
                            <select className="form-input" value={addSedeId} onChange={e=>setAddSedeId(e.target.value)} disabled={!addTallerId}>
                                <option value="">-- Sede --</option>
                                {listaSedesGlobal.filter(s => {
                                    const relacion = s.talleres || s.taller_id;
                                    const tId = (relacion && typeof relacion === 'object') ? relacion.$id : relacion;
                                    return tId === addTallerId;
                                }).map(s => (
                                    <option key={s.$id} value={s.$id}>
                                        {/* CAMBIO AQUÍ: SOLO DIRECCIÓN */}
                                        {s.direccion ? s.direccion : s.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div style={{display:'flex', gap:'10px'}}>
                            <select className="form-input" value={addSedeRol} onChange={e=>setAddSedeRol(e.target.value)} style={{width:'150px'}}>
                                <option value="trabajador">Trabajador</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button onClick={agregarNuevaSedeAlEmpleado} style={{flex:1, background:'#3498db', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>+ Asignar</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* SIDEBAR Y CONTENIDO */}
        <div className={`dashboard-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-brand">
                <div className={!sidebarOpen ? 'hidden-content' : ''}>
                    <h3>Hola, {usuarioNombre}</h3>
                    <select value={sedeActual.$id} onChange={(e) => cambiarSede(e.target.value)} style={{width: '100%', background: '#34495e', color: 'white', border: 'none', padding: '5px', borderRadius: '4px', marginTop: '5px', fontSize: '0.85rem', cursor: 'pointer'}}>
                        {misSedesAsignadas.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}
                        {misSedesAsignadas.length === 0 && <option value={sedeActual.$id}>{sedeActual.nombre}</option>}
                    </select>
                </div>
            </div>
           
            <nav className="sidebar-menu">
                <button title="Resumen" className={tabActual === 'resumen'?'active':''} onClick={()=>{setTabActual('resumen'); if(window.innerWidth<=768) setSidebarOpen(false);}}><span>📊</span> <span className={!sidebarOpen ? 'hidden-content' : ''}>Resumen</span></button>
                <button title="Citas" className={tabActual === 'citas'?'active':''} onClick={()=>{setTabActual('citas'); if(window.innerWidth<=768) setSidebarOpen(false);}}><span>📅</span> <span className={!sidebarOpen ? 'hidden-content' : ''}>Citas</span></button>
                <button title="Cupos" className={tabActual === 'cupos'?'active':''} onClick={()=>{setTabActual('cupos'); if(window.innerWidth<=768) setSidebarOpen(false);}}><span>⚙️</span> <span className={!sidebarOpen ? 'hidden-content' : ''}>Cupos</span></button>
                <button title="Personal" className={tabActual === 'usuarios'?'active':''} onClick={()=>{setTabActual('usuarios'); if(window.innerWidth<=768) setSidebarOpen(false);}}><span>👥</span> <span className={!sidebarOpen ? 'hidden-content' : ''}>Personal</span></button>
            </nav>
            <div className={!sidebarOpen ? 'hidden-content' : ''}><button className="btn-logout" onClick={cerrarSesion}>Salir</button></div>
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
            {tabActual === 'usuarios' && (
                <div className="vista-usuarios">
                    <div className="header-users">
                        <div><h2>Personal</h2><p>Gestión global de empleados.</p></div>
                        <button className="btn-add-user" onClick={abrirModalCreacion}>+ Crear Empleado</button>
                    </div>
                    {/* Barra de Filtro de Personal */}
                    <div style={{display:'flex', gap:'10px', marginBottom:'20px', background:'white', padding:'10px', borderRadius:'8px', border:'1px solid #eee'}}>
                        <input type="text" placeholder="🔍 Buscar por nombre o email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{flex:1, padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}} />
                        <select value={filterSedeId} onChange={e => setFilterSedeId(e.target.value)} style={{width:'200px', padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}>
                            <option value="">📁 Todas las Sedes</option>
                            {listaSedesGlobal.map(s => <option key={s.$id} value={s.$id}>🏭 {s.nombre}</option>)}
                        </select>
                    </div>
                    <div className="lista-usuarios-grid">
                        {listaPersonalFiltrada.length === 0 && <p className="vacio-msg">No se encontraron empleados.</p>}
                        {listaPersonalFiltrada.map(p => (
                            <div key={p.$id} className="usuario-item" style={{cursor:'pointer'}} onClick={() => abrirGestionEmpleado(p)}>
                                <div className="user-info"><span className="user-email">{p.Nombre}</span><span className="user-role" style={{fontSize:'0.8rem', color:'#666'}}>{p.email}</span></div>
                                <div style={{display:'flex', alignItems:'center', gap:'10px'}}><span style={{fontSize:'1.2rem', color:'#ccc'}}>➜</span><button className="btn-editar" style={{background:'#f0f0f0', border:'1px solid #ccc', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>Gestionar</button></div>
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