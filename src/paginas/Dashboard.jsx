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

  // 1. INICIALIZACIÓN
  const [sedeActual, setSedeActual] = useState(() => {
      if (location.state?.sede) return location.state.sede;
      const guardado = localStorage.getItem('sedeActiva');
      return guardado ? JSON.parse(guardado) : null;
  });

  // --- ESTADOS ---
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [tabActual, setTabActual] = useState('resumen'); 
  const [usuarioNombre, setUsuarioNombre] = useState('Cargando...'); 
  
  // Datos
  const [misSedesAsignadas, setMisSedesAsignadas] = useState([]);
  const [listaTalleres, setListaTalleres] = useState([]); 
  const [misTalleresUnicos, setMisTalleresUnicos] = useState([]); 
  const [listaSedesGlobal, setListaSedesGlobal] = useState([]); 
  const [metrics, setMetrics] = useState({ citasHoy: 0, personalTotal: 0 });
  const [chartDataRaw, setChartDataRaw] = useState({}); 
  const [listaCitas, setListaCitas] = useState([]);
  const [fechaFiltro, setFechaFiltro] = useState(new Date().toLocaleDateString('en-CA'));
  const [listaCuposDB, setListaCuposDB] = useState([]); 
  const [listaPersonalGlobal, setListaPersonalGlobal] = useState([]); 
  
  // --- NUEVOS ESTADOS: SERVICIOS ---
  const [listaServiciosAsignados, setListaServiciosAsignados] = useState([]); 
  const [catServiciosGlobal, setCatServiciosGlobal] = useState([]); 
  const [nuevoServicioNombre, setNuevoServicioNombre] = useState('');
  const [servicioSeleccionado, setServicioSeleccionado] = useState(''); 
  
  // Inputs Simples
  const [nuevoCupoHora, setNuevoCupoHora] = useState('');
  const [nuevoCupoCantidad, setNuevoCupoCantidad] = useState(3);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTallerId, setFilterTallerId] = useState('');

  // Modales
  const [modalUserOpen, setModalUserOpen] = useState(false);
  const [modalEditOpen, setModalEditOpen] = useState(false);
  const [modalConfirmOpen, setModalConfirmOpen] = useState(false); 
  const [notification, setNotification] = useState(null); 
  
  // Datos Modales
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newAssignments, setNewAssignments] = useState([]); 
  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState(null);
  const [asignacionesEmpleado, setAsignacionesEmpleado] = useState([]);
  const [loadingAsignaciones, setLoadingAsignaciones] = useState(false);
  const [addTallerId, setAddTallerId] = useState('');
  const [addSedeId, setAddSedeId] = useState('');
  const [addSedeRol, setAddSedeRol] = useState('trabajador');
  const [itemToDelete, setItemToDelete] = useState(null); 
  const [collectionToDelete, setCollectionToDelete] = useState(null);

  const notify = (msg, type = 'success') => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };
  const BLOQUES_BASE = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  // --- CARGAS DE DATOS ---
  useEffect(() => {
    const init = async () => {
        try {
            if (!sedeActual) { setLoadingGlobal(false); return; }

            const user = await account.get();
            let pid = null;
            try {
                const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.equal('email', user.email)]);
                if(res.documents.length>0) { setUsuarioNombre(res.documents[0].Nombre); pid=res.documents[0].$id; } else { setUsuarioNombre(user.name); }
            } catch { setUsuarioNombre(user.name); }

            const [rt, rs, globalServ] = await Promise.all([
                databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_TALLERES || 'talleres', [Query.limit(100), Query.orderAsc('nombre')]).catch(()=>({documents:[]})),
                databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, [Query.limit(100)]).catch(()=>({documents:[]})),
                databases.listDocuments(TALLER_CONFIG.DATABASE_ID, 'servicios', [Query.limit(100), Query.orderAsc('nombre')]).catch(()=>({documents:[]}))
            ]);

            setListaTalleres(rt.documents);
            setListaSedesGlobal(rs.documents);
            setCatServiciosGlobal(globalServ.documents);

            if(pid){
                const ra = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [Query.equal('personal_id', pid)]);
                const sp = await Promise.all(ra.documents.map(async a => { try{return await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, a.sede_id)}catch{return null}}));
                setMisSedesAsignadas(sp.filter(s=>s!==null));
            }
        } catch(e){
            console.error(e);
        } finally {
            setLoadingGlobal(false);
        }
    }; 
    init();
  }, []);

  useEffect(() => {
    if (misSedesAsignadas.length > 0 && listaTalleres.length > 0) {
        const mapa = new Map();
        misSedesAsignadas.forEach(sede => {
            const relacion = sede.talleres || sede.taller_id;
            const tId = (typeof relacion === 'object') ? relacion.$id : relacion;
            const tallerObj = listaTalleres.find(t => t.$id === tId);
            if (tallerObj && !mapa.has(tId)) {
                mapa.set(tId, tallerObj);
            }
        });
        setMisTalleresUnicos(Array.from(mapa.values()));
    }
  }, [misSedesAsignadas, listaTalleres]);

  // --- FUNCIÓN CENTRAL DE CARGA DE DATOS ---
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
            const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, [ Query.equal('sedes', sedeActual.$id), Query.limit(100) ]);
            setListaCuposDB(res.documents.sort((a,b) => a.hora.localeCompare(b.hora)));

        } else if (tabActual === 'citas') {
             const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, [ Query.equal('sede', sedeActual.$id), Query.limit(100), Query.orderDesc('fecha_hora') ]);
            const citasFiltradas = res.documents.filter(c => new Date(c.fecha_hora).toLocaleDateString('en-CA') === fechaFiltro);

             const citasCompletas = await Promise.all(citasFiltradas.map(async (c) => {
                 const nombreCompleto = `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Cliente sin nombre';
                 let nombreServicio = '-';
                 if (c.servicio) {
                     const enCache = catServiciosGlobal.find(s => s.$id === c.servicio);
                     if (enCache) { nombreServicio = enCache.nombre; } 
                     else {
                         try { const docServ = await databases.getDocument(TALLER_CONFIG.DATABASE_ID, 'servicios', c.servicio); nombreServicio = docServ.nombre; } 
                         catch (e) { nombreServicio = '(No encontrado)'; }
                     }
                 }
                 return { ...c, clienteNombre: nombreCompleto, servicioNombre: nombreServicio };
             }));
             setListaCitas(citasCompletas);

        } else if (tabActual === 'usuarios') {
             if (TALLER_CONFIG.COLLECTION_PERSONAL) {
                 if (filterTallerId) {
                     try {
                         let userIds = [];
                         try {
                             const resAsig = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [ Query.equal('talleres', filterTallerId) ]);
                             userIds = resAsig.documents.map(a => a.personal_id);
                         } catch (errAsig) {
                             const resAsig2 = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [ Query.equal('taller_id', filterTallerId) ]);
                             userIds = resAsig2.documents.map(a => a.personal_id);
                         }

                         if (userIds.length > 0) {
                             const uniqueIds = [...new Set(userIds)];
                             const resUsers = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [ Query.equal('$id', uniqueIds) ]);
                             setListaPersonalGlobal(resUsers.documents);
                         } else { setListaPersonalGlobal([]); }
                     } catch (e) { console.error("Error filtrando usuarios:", e); }
                 } else {
                     const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, [Query.limit(100)]);
                     setListaPersonalGlobal(res.documents);
                 }
             }

        } else if (tabActual === 'servicios') {
             try {
                 const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, 'sedes_servicios', [ Query.equal('sedes', sedeActual.$id) ]);
                 const enriquecidos = await Promise.all(res.documents.map(async (item) => {
                     let nombreMostrar = 'Cargando...'; 
                     if (item.servicios) { 
                         try {
                             const docServicio = await databases.getDocument(TALLER_CONFIG.DATABASE_ID, 'servicios', item.servicios);
                             nombreMostrar = docServicio.nombre;
                         } catch (err) { nombreMostrar = '(Servicio eliminado)'; }
                     }
                     return { ...item, nombreMostrar };
                 }));
                 setListaServiciosAsignados(enriquecidos);
             } catch (e) { console.error("Error cargando sedes_servicios:", e); }
        }
      } catch (error) { console.error("Error datos:", error); }
  };

  useEffect(() => { if(!loadingGlobal) cargarDatos(); }, [tabActual, fechaFiltro, sedeActual, filterTallerId, loadingGlobal]);

  const getTallerActualId = () => {
      const rel = sedeActual.talleres || sedeActual.taller_id;
      return (typeof rel === 'object') ? rel.$id : rel;
  }

  // ACCIONES
  const cambiarSede = (id) => { const s = misSedesAsignadas.find(x => x.$id === id); if(s) { setSedeActual(s); navigate('/admin/dashboard', { state: { sede: s } }); } };
  const cambiarTaller = (nuevoTallerId) => {
      const primeraSedeDelTaller = misSedesAsignadas.find(s => {
          const tRel = s.talleres || s.taller_id;
          const tId = (typeof tRel === 'object') ? tRel.$id : tRel;
          return tId === nuevoTallerId;
      });
      if (primeraSedeDelTaller) {
          setSedeActual(primeraSedeDelTaller);
          navigate('/admin/dashboard', { state: { sede: primeraSedeDelTaller } });
          notify(`🏢 Cambiado a ${primeraSedeDelTaller.direccion || 'nueva sede'}`);
      }
  };
  const cerrarSesion = async () => { try { await account.deleteSession('current'); } catch(e){} navigate('/login'); };
  
  // GESTIÓN EMPLEADO
  const abrirGestionEmpleado = async (e) => { setEmpleadoSeleccionado(e); setModalEditOpen(true); setAddTallerId(''); setAddSedeId(''); cargarAsignaciones(e.$id); };
  const cargarAsignaciones = async (id) => { setLoadingAsignaciones(true); try { const res = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, [Query.equal('personal_id', id)]); const full = await Promise.all(res.documents.map(async a => { let nombreSede = 'Eliminada', nombreTaller = '-'; try{ const i=await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, a.sede_id); nombreSede=i.direccion; }catch{} try{ const relacionTaller = a.talleres || a.taller_id; if(relacionTaller) { const tID = (typeof relacionTaller === 'object' && relacionTaller.$id) ? relacionTaller.$id : relacionTaller; if(typeof relacionTaller === 'object' && relacionTaller.nombre) nombreTaller = relacionTaller.nombre; else { const t=await databases.getDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_TALLERES || 'talleres', tID); nombreTaller=t.nombre; } } }catch{} return {...a, nombreSede, nombreTaller} })); setAsignacionesEmpleado(full); } catch(e){console.error(e)} finally{setLoadingAsignaciones(false)} };
  const guardarCambiosBasicos = async (e) => { e.preventDefault(); try { await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_PERSONAL, empleadoSeleccionado.$id, { Nombre: empleadoSeleccionado.Nombre, email: empleadoSeleccionado.email }); notify("✅ Actualizado"); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  const agregarNuevaSedeAlEmpleado = async () => { if(!addTallerId || !addSedeId) return notify("⚠️ Faltan datos", "error"); try{ await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), { personal_id:empleadoSeleccionado.$id, talleres: addTallerId, sede_id:addSedeId, rol:addSedeRol }); notify("✅ Asignado"); cargarAsignaciones(empleadoSeleccionado.$id); } catch(e){ try { await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, ID.unique(), { personal_id:empleadoSeleccionado.$id, taller_id: addTallerId, sede_id:addSedeId, rol:addSedeRol }); notify("✅ Asignado"); cargarAsignaciones(empleadoSeleccionado.$id); } catch(err2) { notify(e.message,"error"); } } };
  const quitarSedeAlEmpleado = async (id) => { if(!window.confirm("¿Quitar acceso?"))return; try{ await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_ASIGNACIONES, id); notify("🗑️ Quitado"); cargarAsignaciones(empleadoSeleccionado.$id); }catch(e){notify(e.message,"error");} };
  const agregarFilaSede = () => setNewAssignments([...newAssignments, { taller: '', sede: '', rol: 'trabajador' }]);
  const quitarFilaSede = (i) => { const c=[...newAssignments]; c.splice(i,1); setNewAssignments(c); };
  const actualizarFila = (i,f,v) => { const c=[...newAssignments]; c[i][f]=v; if(f==='taller')c[i]['sede']=''; setNewAssignments(c); };
  const crearNuevoEmpleado = async (e) => { e.preventDefault(); try { let pid=null; const chk=await databases.listDocuments(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_PERSONAL,[Query.equal('email',newUserEmail)]); if(chk.documents.length>0){pid=chk.documents[0].$id; notify("ℹ️ Usuario existente, asignando...");} else{const n=await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_PERSONAL,ID.unique(),{email:newUserEmail,Nombre:newUserName}); pid=n.$id;} let c=0; for(const a of newAssignments){ if(a.taller && a.sede) { try { await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_ASIGNACIONES,ID.unique(),{ personal_id:pid, talleres: a.taller, sede_id:a.sede, rol:a.rol }); c++; } catch(err) { await databases.createDocument(TALLER_CONFIG.DATABASE_ID,TALLER_CONFIG.COLLECTION_ASIGNACIONES,ID.unique(),{ personal_id:pid, taller_id: a.taller, sede_id:a.sede, rol:a.rol }); c++; } } } notify(`✅ Listo. ${c} asignaciones.`); setModalUserOpen(false); setNewUserEmail(''); setNewUserName(''); cargarDatos(); } catch(e){notify(e.message,"error");} };
  const abrirModalCreacion = () => { setNewUserName(''); setNewUserEmail(''); setNewAssignments([{ taller: '', sede: '', rol: 'trabajador' }]); setModalUserOpen(true); };
  
  // FUNCIONES DE CUPOS
  const crearCupo = async () => { 
      if(!nuevoCupoHora) return; 
      try { 
          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, ID.unique(), { sedes: sedeActual.$id, hora: nuevoCupoHora, cantidad: parseInt(nuevoCupoCantidad)}); 
          notify("✅ Horario creado"); setNuevoCupoHora(''); cargarDatos(); 
      } catch(e){ notify(e.message,"error"); } 
  };
  const actualizarCupo = async (id, v) => { try { await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, id, {cantidad: parseInt(v)}); notify("✅ Actualizado"); cargarDatos(); } catch(e){ notify(e.message,"error"); } };
  
  // --- LÓGICA SERVICIOS ---
  const agregarServicio = async () => {
      let servicioIdFinal = servicioSeleccionado;
      if (!servicioIdFinal) return notify("Por favor, selecciona un servicio.", "error");
      try {
          if (servicioIdFinal === 'crear_nuevo') {
              const nombreLimpio = nuevoServicioNombre.trim();
              if(!nombreLimpio) return notify("Escribe el nombre del nuevo servicio.", "error");
              const existeGlobal = catServiciosGlobal.find(s => s.nombre.toLowerCase() === nombreLimpio.toLowerCase());
              if (existeGlobal) {
                  servicioIdFinal = existeGlobal.$id;
                  notify("ℹ️ El servicio ya existía. Asignándolo...");
              } else {
                  const nuevoGlobal = await databases.createDocument(TALLER_CONFIG.DATABASE_ID, 'servicios', ID.unique(), { nombre: nombreLimpio, estado: 'activo' });
                  servicioIdFinal = nuevoGlobal.$id;
                  setCatServiciosGlobal([...catServiciosGlobal, nuevoGlobal]);
                  notify("✨ Servicio nuevo creado.");
              }
          }
          const yaAsignado = listaServiciosAsignados.find(item => item.servicios === servicioIdFinal);
          if (yaAsignado) return notify("Este servicio ya está asignado.", "error");

          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, 'sedes_servicios', ID.unique(), { sedes: sedeActual.$id, servicios: servicioIdFinal });
          notify("✅ Servicio asignado exitosamente");
          setServicioSeleccionado(''); setNuevoServicioNombre(''); cargarDatos();
      } catch(e) { console.error(e); notify("Error al guardar: " + e.message, "error"); }
  };

  const borrarItem = async () => { 
      if(itemToDelete && collectionToDelete) { 
          try { await databases.deleteDocument(TALLER_CONFIG.DATABASE_ID, collectionToDelete, itemToDelete); notify("🗑️ Eliminado"); setModalConfirmOpen(false); cargarDatos(); } 
          catch(e) { notify(e.message, "error"); }
      } 
  };
  
  const listaPersonalFiltrada = listaPersonalGlobal.filter(p => (!searchTerm || (p.Nombre && p.Nombre.toLowerCase().includes(searchTerm.toLowerCase())) || (p.email && p.email.toLowerCase().includes(searchTerm.toLowerCase()))));
  const formatoIntervalo = (h) => { const f = parseInt(h.split(':')[0])+1; return `${h} - ${f < 10 ? '0'+f : f}:00`; };
  const horasDisponibles = useMemo(() => BLOQUES_BASE.filter(h => !listaCuposDB.map(c=>c.hora).includes(h)), [listaCuposDB]);
  const chartDataConfig = { labels: Object.keys(chartDataRaw), datasets: [{ label: 'Vehículos', data: Object.values(chartDataRaw), backgroundColor: '#3498db', borderRadius: 4 }] };
  const HEADER_HEIGHT = '70px';

  if (!sedeActual) {
    return (
        <div style={{color: '#333', padding: '50px', textAlign: 'center'}}>
            <h2>⚠️ Sesión no encontrada</h2>
            <p>Por favor, inicia sesión nuevamente.</p>
            <button onClick={() => navigate('/login')} style={{padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer'}}>Ir al Login</button>
        </div>
    );
  }

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
        {notification && <div className={`notification-toast ${notification.type}`}>{notification.type==='success'?'👍':'⚠️'} {notification.msg}</div>}
        {modalConfirmOpen && <div className="modal-overlay"><div className="modal-content"><h3>Confirmar</h3><p>¿Eliminar este elemento?</p><div className="modal-buttons"><button className="btn-modal-cancel" onClick={()=>setModalConfirmOpen(false)}>No</button><button className="btn-modal-confirm" onClick={borrarItem}>Sí</button></div></div></div>}
        
        {modalUserOpen && (<div className="modal-overlay"><div className="modal-content" style={{maxWidth:'550px'}}><div className="modal-header"><h3>Nuevo Empleado</h3><p>Crea el perfil y asigna sus accesos</p></div><form onSubmit={crearNuevoEmpleado}><div className="form-group"><label>Nombre Completo</label><input className="form-input" value={newUserName} onChange={e=>setNewUserName(e.target.value)} required placeholder="Ej. Juan Pérez" /></div><div className="form-group"><label>Correo Electrónico</label><input className="form-input" type="email" value={newUserEmail} onChange={e=>setNewUserEmail(e.target.value)} required placeholder="juan@taller.com" /></div><div style={{borderTop:'1px solid #eee', paddingTop:'15px', marginTop:'20px'}}><label style={{display:'block', marginBottom:'10px', color:'#7f8c8d', fontSize:'0.9rem', fontWeight:'600'}}>ASIGNACIONES</label><div className="assignments-container">{newAssignments.map((a, i) => {const sedesDelTaller = listaSedesGlobal.filter(s => {const relacion = s.talleres || s.taller_id; const tId = (relacion && typeof relacion === 'object') ? relacion.$id : relacion; return tId === a.taller;}); return (<div key={i} className="assignment-card">{newAssignments.length > 1 && (<button type="button" className="btn-remove-mini" onClick={() => quitarFilaSede(i)}>×</button>)}<div className="assignment-row"><div style={{flex: 1}}><select className="form-input" value={a.taller} onChange={e => actualizarFila(i, 'taller', e.target.value)}><option value="">-- Taller --</option>{listaTalleres.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}</select></div><div style={{width: '130px'}}><select className="form-input" value={a.rol} onChange={e => actualizarFila(i, 'rol', e.target.value)}><option value="trabajador">Trabajador</option><option value="admin">Admin</option></select></div></div><div><select className="form-input" value={a.sede} onChange={e => actualizarFila(i, 'sede', e.target.value)} disabled={!a.taller} style={{backgroundColor: !a.taller ? '#f0f0f0' : 'white'}}><option value="">{a.taller ? '-- Sede --' : '-- --'}</option>{sedesDelTaller.map(s => (<option key={s.$id} value={s.$id}>{s.direccion ? s.direccion : s.nombre}</option>))}</select></div></div>)})}</div><button type="button" className="btn-add-dashed" onClick={agregarFilaSede}>+ Agregar asignación</button></div><div className="modal-buttons" style={{marginTop:'25px'}}><button type="button" className="btn-modal-cancel" onClick={()=>setModalUserOpen(false)}>Cancelar</button><button type="submit" className="btn-add-user">Guardar Todo</button></div></form></div></div>)}
        {modalEditOpen && empleadoSeleccionado && (<div className="modal-overlay"><div className="modal-content" style={{maxWidth:'600px', textAlign:'left'}}><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}><h3 style={{margin:0}}>Gestionar: {empleadoSeleccionado.Nombre}</h3><button onClick={()=>setModalEditOpen(false)} style={{background:'none', border:'none', fontSize:'1.5rem', cursor:'pointer'}}>×</button></div><form onSubmit={guardarCambiosBasicos} style={{background:'#f9f9f9', padding:'15px', borderRadius:'8px', marginBottom:'20px'}}><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}><div><label style={{fontSize:'0.8rem', fontWeight:'bold'}}>Nombre</label><input className="form-input" value={empleadoSeleccionado.Nombre} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, Nombre: e.target.value})}/></div><div><label style={{fontSize:'0.8rem', fontWeight:'bold'}}>Email</label><input className="form-input" value={empleadoSeleccionado.email} onChange={e => setEmpleadoSeleccionado({...empleadoSeleccionado, email: e.target.value})}/></div></div><button type="submit" style={{marginTop:'10px', padding:'8px 15px', background:'#2ecc71', color:'white', border:'none', borderRadius:'4px', cursor:'pointer'}}>Guardar Cambios</button></form><h4 style={{fontSize:'0.9rem', color:'#555', borderBottom:'1px solid #eee', paddingBottom:'5px'}}>Accesos</h4><div style={{maxHeight:'200px', overflowY:'auto', marginBottom:'15px'}}>{asignacionesEmpleado.length === 0 ? <p style={{padding:'10px', color:'#999'}}>Sin accesos.</p> : (<table style={{width:'100%', borderCollapse:'collapse'}}><thead><tr style={{background:'#f1f2f6', fontSize:'0.8rem', color:'#555'}}><th style={{padding:'8px', textAlign:'left'}}>Taller</th><th style={{padding:'8px', textAlign:'left'}}>Sede</th><th style={{padding:'8px'}}>Rol</th><th></th></tr></thead><tbody>{asignacionesEmpleado.map(asig => (<tr key={asig.$id} style={{borderBottom:'1px solid #eee'}}><td style={{padding:'8px', fontSize:'0.9rem'}}>{asig.nombreTaller}</td><td style={{padding:'8px', fontSize:'0.9rem'}}>{asig.nombreSede}</td><td style={{padding:'8px', textAlign:'center'}}><span className="badge" style={{fontSize:'0.7rem'}}>{asig.rol}</span></td><td style={{padding:'8px', textAlign:'right'}}><button onClick={()=>quitarSedeAlEmpleado(asig.$id)} style={{background:'#e74c3c', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'0.8rem'}}>Quitar</button></td></tr>))}</tbody></table>)}</div><div style={{background:'#eef2f7', padding:'15px', borderRadius:'8px', border:'1px solid #dae1e7'}}><h5 style={{margin:'0 0 10px 0'}}>Agregar Acceso</h5><div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px'}}><select className="form-input" value={addTallerId} onChange={e=>{setAddTallerId(e.target.value); setAddSedeId('');}}><option value="">-- Taller --</option>{listaTalleres.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}</select><select className="form-input" value={addSedeId} onChange={e=>setAddSedeId(e.target.value)} disabled={!addTallerId}><option value="">-- Sede --</option>{listaSedesGlobal.filter(s => {const relacion = s.talleres || s.taller_id; const tId = (relacion && typeof relacion === 'object') ? relacion.$id : relacion; return tId === addTallerId;}).map(s => (<option key={s.$id} value={s.$id}>{s.direccion ? s.direccion : s.nombre}</option>))}</select></div><div style={{display:'flex', gap:'10px'}}><select className="form-input" value={addSedeRol} onChange={e=>setAddSedeRol(e.target.value)} style={{width:'150px'}}><option value="trabajador">Trabajador</option><option value="admin">Admin</option></select><button onClick={agregarNuevaSedeAlEmpleado} style={{flex:1, background:'#3498db', color:'white', border:'none', borderRadius:'6px', cursor:'pointer', fontWeight:'bold'}}>+ Asignar</button></div></div></div></div>)}

        {/* 1. BOTÓN FLOTANTE */}
        {!sidebarOpen && (
            <button className="mobile-toggle" onClick={() => setSidebarOpen(true)} title="Abrir Menú">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
        )}

        {/* EFEKTO BLUR MÓVIL */}
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
                <div className="control-group">
                    <span className="control-label">Empresa</span>
                    {misTalleresUnicos.length > 1 ? (
                        <select className="custom-select-dark" value={getTallerActualId()} onChange={(e) => cambiarTaller(e.target.value)}>
                            {misTalleresUnicos.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}
                        </select>
                    ) : (
                        <div style={{fontWeight:'bold', fontSize:'1.1rem'}}>{misTalleresUnicos[0]?.nombre || '...'}</div>
                    )}
                </div>

                <div className="control-group">
                    <span className="control-label">Sede Actual</span>
                    <select className="custom-select-dark" value={sedeActual.$id} onChange={(e) => cambiarSede(e.target.value)}>
                        {misSedesAsignadas.filter(s => {
                            const r = s.talleres || s.taller_id; const tid = (typeof r==='object')?r.$id:r; return tid === getTallerActualId();
                        }).map(s => <option key={s.$id} value={s.$id}>{s.direccion}</option>)}
                    </select>
                </div>
            </div>

            <nav className="sidebar-menu">
                <button className={`menu-btn ${tabActual==='resumen'?'active':''}`} onClick={()=>{setTabActual('resumen'); if(window.innerWidth<=768) setSidebarOpen(false);}}>
                    <span className="icon">📊</span> <span className="label">Resumen</span>
                </button>
                <button className={`menu-btn ${tabActual==='citas'?'active':''}`} onClick={()=>{setTabActual('citas'); if(window.innerWidth<=768) setSidebarOpen(false);}}>
                    <span className="icon">📅</span> <span className="label">Citas</span>
                </button>
                <button className={`menu-btn ${tabActual==='cupos'?'active':''}`} onClick={()=>{setTabActual('cupos'); if(window.innerWidth<=768) setSidebarOpen(false);}}>
                    <span className="icon">⚙️</span> <span className="label">Cupos</span>
                </button>
                {/* --- BOTÓN DE SERVICIOS --- */}
                <button className={`menu-btn ${tabActual==='servicios'?'active':''}`} onClick={()=>{setTabActual('servicios'); if(window.innerWidth<=768) setSidebarOpen(false);}}>
                    <span className="icon">🛠️</span> <span className="label">Servicios</span>
                </button>
                <button className={`menu-btn ${tabActual==='usuarios'?'active':''}`} onClick={()=>{setTabActual('usuarios'); if(window.innerWidth<=768) setSidebarOpen(false);}}>
                    <span className="icon">👥</span> <span className="label">Personal</span>
                </button>
            </nav>
        </aside>

        {/* --- CONTENIDO PRINCIPAL --- */}
        <main className="dashboard-content">
            <header className="top-bar-sticky" style={{height: HEADER_HEIGHT}}>
                <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
                    <div style={{textAlign:'right'}}>
                        <div style={{fontWeight:'bold', color:'#333', fontSize:'0.9rem'}}>{usuarioNombre}</div>
                        <div style={{fontSize:'0.7rem', color:'#888'}}>En línea</div>
                    </div>
                    <button onClick={cerrarSesion} style={{background:'#ffe2e5', color:'#f64e60', border:'none', padding:'8px 12px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.8rem'}}>
                        Salir
                    </button>
                </div>
            </header>

            <div className="main-view-container">
                {/* VISTAS PREVIAS */}
                {tabActual === 'resumen' && (
                    <div className="vista-resumen">
                        <h2 style={{marginTop:0}}>Resumen del Día</h2>
                        <div className="metrics-grid">
                            <div className="metric-card blue"><h3>Citas Hoy</h3><p className="metric-value">{metrics.citasHoy}</p></div>
                            <div className="metric-card purple"><h3>Personal Global</h3><p className="metric-value">{metrics.personalTotal}</p></div>
                        </div>
                        {/* ⭐ FIX VISUAL DEL GRÁFICO (height + relative) ⭐ */}
                        <div className="chart-container-wrapper" style={{marginTop:'30px', background:'white', padding:'20px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', position: 'relative', height: '400px'}}>
                            {/* ⭐ FIX CHART.JS (maintainAspectRatio: false) ⭐ */}
                            <Bar options={{ responsive: true, maintainAspectRatio: false }} data={{ labels: Object.keys(chartDataRaw), datasets: [{ label: 'Vehículos', data: Object.values(chartDataRaw), backgroundColor: '#3699ff', borderRadius: 4 }] }} />
                        </div>
                    </div>
                )}

                {tabActual === 'citas' && (
                    <div className="vista-citas">
                        <div className="header-vista"><h2>Citas</h2><input type="date" value={fechaFiltro} onChange={e=>setFechaFiltro(e.target.value)}/></div>
                        <div className="tabla-container">
                            <table className="tabla-datos">
                                <thead><tr><th>Hora</th><th>Placa</th><th>Cliente</th><th>Servicio</th><th>Estado</th></tr></thead>
                                <tbody>
                                    {listaCitas.map(c=>(
                                        <tr key={c.$id}>
                                            <td>{new Date(c.fecha_hora).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</td>
                                            <td>{c.placa}</td>
                                            <td>{c.clienteNombre}</td>
                                            <td>{c.servicioNombre}</td>
                                            <td>{c.estado}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tabActual === 'cupos' && (
                    <div className="vista-cupos">
                        <h2>Configuración de Horarios</h2>
                        <div className="panel-agregar-cupo">
                            <div className="input-group"><label>Nuevo Horario</label><select value={nuevoCupoHora} onChange={e=>setNuevoCupoHora(e.target.value)}><option value="">-- Seleccionar --</option>{horasDisponibles.map(h=><option key={h} value={h}>{formatoIntervalo(h)}</option>)}</select></div>
                            <div className="input-group"><label>Cupos</label><input type="number" min="1" value={nuevoCupoCantidad} onChange={e=>setNuevoCupoCantidad(e.target.value)}/></div>
                            <button className="btn-add" onClick={crearCupo}>+ Agregar</button>
                        </div>
                        <h3>Horarios Activos</h3>
                        {listaCuposDB.length===0 ? <p className="vacio-msg">Sin horarios configurados.</p> : (
                            <div className="grid-config-cupos">
                                {listaCuposDB.map(c=>(
                                    <div key={c.$id} className="card-cupo-admin">
                                        <div className="cupo-header"><h4>{formatoIntervalo(c.hora)}</h4><span className="badge-cupo">Activo</span></div>
                                        <div className="cupo-body"><input type="number" id={`i-${c.$id}`} defaultValue={c.cantidad}/></div>
                                        <div className="cupo-actions"><button className="btn-update" onClick={()=>actualizarCupo(c.$id, document.getElementById(`i-${c.$id}`).value)}>Guardar</button><button className="btn-delete" onClick={()=>{setItemToDelete(c.$id); setCollectionToDelete(TALLER_CONFIG.COLLECTION_CUPOS); setModalConfirmOpen(true)}}>Borrar</button></div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- VISTA SERVICIOS (CON SELECT Y OPCIÓN CREAR NUEVO) --- */}
                {tabActual === 'servicios' && (
                    <div className="vista-servicios">
                        <h2>Servicios de la Sede</h2>
                        
                        <div className="panel-agregar-cupo" style={{alignItems:'flex-end', flexWrap:'wrap'}}>
                            <div className="input-group" style={{minWidth: '250px', flex: 3}}>
                                <label>Seleccionar Servicio</label>
                                <select 
                                    className="custom-select-dark" // Reusamos estilo o creamos uno si prefieres
                                    style={{background:'white', color:'#333', border:'1px solid #ddd'}}
                                    value={servicioSeleccionado}
                                    onChange={(e) => setServicioSeleccionado(e.target.value)}
                                >
                                    <option value="">-- Elige un servicio --</option>
                                    {catServiciosGlobal.map(gs => (
                                        <option key={gs.$id} value={gs.$id}>{gs.nombre}</option>
                                    ))}
                                    <option disabled>──────────</option>
                                    <option value="crear_nuevo">➕ Crear nuevo servicio...</option>
                                </select>
                            </div>

                            {servicioSeleccionado === 'crear_nuevo' && (
                                <div className="input-group" style={{minWidth: '200px', flex: 2, animation: 'fadeIn 0.3s'}}>
                                    <label>Nombre del Nuevo Servicio</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej. Scanner Motor" 
                                        value={nuevoServicioNombre} 
                                        onChange={e => setNuevoServicioNombre(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            )}

                            <button className="btn-add" onClick={agregarServicio} disabled={!servicioSeleccionado}>
                                {servicioSeleccionado === 'crear_nuevo' ? 'Crear y Asignar' : 'Asignar a Sede'}
                            </button>
                        </div>

                        <h3>Lista de Servicios Asignados</h3>
                        {listaServiciosAsignados.length === 0 ? <p className="vacio-msg">No hay servicios asignados a esta sede.</p> : (
                            <div className="lista-usuarios-grid">
                                {listaServiciosAsignados.map(serv => (
                                    <div key={serv.$id} className="usuario-item" style={{borderLeft: '4px solid #3498db'}}>
                                        <div className="user-info">
                                            <span className="user-email" style={{fontSize:'1rem', fontWeight:'bold'}}>{serv.nombreMostrar}</span>
                                            <span className="user-role" style={{fontSize:'0.75rem'}}>Activo</span>
                                        </div>
                                        <div style={{display:'flex', gap:'10px'}}>
                                            <button 
                                                className="btn-delete" 
                                                onClick={() => {
                                                    setItemToDelete(serv.$id);
                                                    setCollectionToDelete('sedes_servicios'); 
                                                    setModalConfirmOpen(true);
                                                }}
                                                title="Quitar"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tabActual === 'usuarios' && (
                    <div className="vista-usuarios">
                        <div className="header-users">
                            <div><h2>Personal</h2><p style={{color:'#7f8c8d', marginTop:'-15px'}}>Gestión global de empleados.</p></div>
                            <button className="btn-add-user" onClick={abrirModalCreacion}>+ Crear Empleado</button>
                        </div>
                        <div style={{display:'flex', gap:'10px', marginBottom:'20px', background:'white', padding:'10px', borderRadius:'8px', border:'1px solid #eee'}}>
                            <input type="text" placeholder="🔍 Buscar por nombre o email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{flex:1, padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}} />
                            <select value={filterTallerId} onChange={e => setFilterTallerId(e.target.value)} style={{width:'200px', padding:'8px', border:'1px solid #ddd', borderRadius:'4px'}}><option value="">🏢 Todas las Empresas</option>{listaTalleres.map(t => <option key={t.$id} value={t.$id}>{t.nombre}</option>)}</select>
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
        </main>
    </div>
  )
}
export default Dashboard;