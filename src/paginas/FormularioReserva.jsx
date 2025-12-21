import { useState, useEffect } from 'react'
import { databases, TALLER_CONFIG } from '../lib/appwrite'
import { ID, Query } from 'appwrite' 
import { useNavigate } from 'react-router-dom'
import Calendar from 'react-calendar' 
import 'react-calendar/dist/Calendar.css'
import '../estilos/Formulario.css'

function FormularioReserva() {
  const navigate = useNavigate();
  
  // --- ESTADOS DE DATOS ---
  const [listaTalleres, setListaTalleres] = useState([]);
  const [listaSedesTotal, setListaSedesTotal] = useState([]); 
  const [servicios, setServicios] = useState([]);
  const [listaRelaciones, setListaRelaciones] = useState([]); 

  // --- ESTADOS DEL FORMULARIO ---
  const [pasoActual, setPasoActual] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Reprogramación
  const [citasDetectadas, setCitasDetectadas] = useState([]);
  const [buscandoPlaca, setBuscandoPlaca] = useState(false);
  const [citaExistenteId, setCitaExistenteId] = useState(null); 

  // FORMULARIO
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    correo: '',
    empresa: '', 
    telefono: '',
    placa: '',
    kilometraje: '',
    ciudad: '', // <--- NUEVO CAMPO
    tipo_requerimiento: '', 
    sede: '', 
    observaciones: '',
    asistencia_ruta: 'NO',
  });

  // --- ESTADOS FECHA Y HORA ---
  const [fechaCalendario, setFechaCalendario] = useState(new Date());
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toLocaleDateString('en-CA'));
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [horariosDisponibles, setHorariosDisponibles] = useState([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  const BLOQUES_BASE = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

  // --- 1. CARGA INICIAL DE DATOS ---
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        console.log("🔄 Iniciando carga de datos...");
        const [resTalleres, resSedes, resServicios, resRelaciones] = await Promise.all([
            databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_TALLERES || 'talleres', [Query.limit(100), Query.orderAsc('nombre')]),
            databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES, [Query.limit(100)]),
            databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SERVICIOS || 'servicios'),
            databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_RELACION_SEDE_SERVICIO, [Query.limit(1000)])
        ]);

        console.log(`✅ Datos cargados: ${resRelaciones.documents.length} relaciones.`);
        setListaTalleres(resTalleres.documents);
        setListaSedesTotal(resSedes.documents);
        setServicios(resServicios.documents);
        setListaRelaciones(resRelaciones.documents);
      } catch (error) { 
        console.error("❌ Error cargando datos:", error); 
        alert("Error de conexión. Revisa la consola.");
      }
    };
    cargarDatos();
  }, []); 

  // --- LIMPIEZA ---
  useEffect(() => { setHoraSeleccionada(''); }, [formData.sede, fechaSeleccionada]);
  useEffect(() => { setFormData(prev => ({ ...prev, sede: '' })); }, [formData.tipo_requerimiento]);

  // --- 2. CÁLCULO DISPONIBILIDAD ---
  useEffect(() => {
    if (!formData.sede || pasoActual !== 2) {
        setHorariosDisponibles([]);
        return;
    }
    const calcularDisponibilidad = async () => {
      setCargandoHorarios(true);
      setHorariosDisponibles([]); 
      try {
        let resConfig;
        try {
            resConfig = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, [ Query.equal('sedes', formData.sede) ]);
        } catch (err) {
            resConfig = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CUPOS, [ Query.equal('sede', formData.sede) ]);
        }
        const reglasPorHora = {};
        resConfig.documents.forEach(regla => { reglasPorHora[regla.hora] = regla.cantidad; });

        const resCitas = await databases.listDocuments(
          TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS,
          [ Query.equal('sede', formData.sede), Query.limit(100), Query.orderDesc('fecha_hora') ]
        );

        const conteoOcupacion = {}; 
        resCitas.documents.forEach(cita => {
            if (citaExistenteId && cita.$id === citaExistenteId) return; 
            const fechaCita = new Date(cita.fecha_hora);
            const fechaString = fechaCita.toLocaleDateString('en-CA'); 
            if (fechaString === fechaSeleccionada) {
                const horaString = fechaCita.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                conteoOcupacion[horaString] = (conteoOcupacion[horaString] || 0) + 1;
            }
        });
        const disponibles = BLOQUES_BASE.filter(hora => {
            const ocupados = conteoOcupacion[hora] || 0;
            const capacidadMaxima = reglasPorHora[hora] || 0;
            return capacidadMaxima > 0 && ocupados < capacidadMaxima;
        });
        setHorariosDisponibles(disponibles);
      } catch (error) { console.error("Error calculando:", error); } finally { setCargandoHorarios(false); }
    };
    calcularDisponibilidad();
  }, [fechaSeleccionada, formData.sede, pasoActual, citaExistenteId]);

  // --- MANEJADORES ---
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const onFechaChange = (date) => {
    setFechaCalendario(date);
    setFechaSeleccionada(date.toLocaleDateString('en-CA'));
  };

  const verificarPlaca = async () => {
    if (!formData.placa || formData.placa.length < 3) return;
    setBuscandoPlaca(true);
    try {
        const resultado = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS,
            [ Query.equal('placa', formData.placa.toUpperCase()), Query.equal('estado', 'pendiente'), Query.limit(5) ]
        );
        setCitasDetectadas(resultado.documents);
    } catch (error) { console.error(error); } finally { setBuscandoPlaca(false); }
  };

  const activarModoEdicion = (cita) => {
      if(!window.confirm("¿Reprogramar esta cita?")) return;
      setCitaExistenteId(cita.$id);
      
      const sedeId = cita.sede && cita.sede.$id ? cita.sede.$id : cita.sede;
      const servicioId = cita.servicio && cita.servicio.$id ? cita.servicio.$id : cita.servicio;

      let nombreRecuperado = cita.nombre || '';
      let apellidoRecuperado = cita.apellido || '';
      if (!nombreRecuperado && cita.cliente) { // Fallback de lectura solo si existe
          const partes = cita.cliente.split(' ');
          nombreRecuperado = partes[0];
          if (!apellidoRecuperado) apellidoRecuperado = partes.slice(1).join(' ');
      }

      setFormData({
          nombre: nombreRecuperado,
          apellido: apellidoRecuperado,
          correo: cita.email_cliente || '',
          telefono: cita.telefono || '',
          empresa: cita.empresa || '', 
          placa: cita.placa,
          kilometraje: cita.kilometraje || '',
          ciudad: cita.ciudad || '', // RECUPERAR CIUDAD
          tipo_requerimiento: servicioId || '', 
          sede: sedeId || '',
          observaciones: cita.observaciones || '', 
          asistencia_ruta: cita.asistencia_ruta || 'NO'
      });
      setCitasDetectadas([]);
      setFechaSeleccionada(new Date().toLocaleDateString('en-CA')); 
      setHoraSeleccionada(''); 
      alert("Datos cargados. Verifica y selecciona NUEVA fecha.");
      setPasoActual(1);
  };

  const siguientePaso = () => {
      if (pasoActual === 1) {
          if (!formData.nombre || !formData.apellido || !formData.correo || !formData.empresa || !formData.telefono) return alert("⚠️ Completa todos los campos del paso 1.");
      }
      if (pasoActual === 2) {
          if (!formData.placa || !formData.kilometraje || !formData.ciudad || !formData.sede || !fechaSeleccionada || !horaSeleccionada) return alert("⚠️ Faltan datos (Ciudad, Sede, Fecha u Hora).");
          if (!horariosDisponibles.includes(horaSeleccionada)) return alert("⚠️ El horario seleccionado ya no está disponible.");
      }
      setPasoActual(prev => prev + 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (!fechaSeleccionada || !horaSeleccionada) throw new Error("Falta fecha u hora.");
      
      const fechaFinal = new Date(`${fechaSeleccionada}T${horaSeleccionada}:00`);
      const kiloInt = parseInt(formData.kilometraje) || 0; 

      const datosParaGuardar = {
        fecha_hora: fechaFinal.toISOString(),
        estado: 'pendiente',
        sede: formData.sede,            
        servicio: formData.tipo_requerimiento, 
        
        // --- CLIENTE (SOLO CAMPOS NUEVOS) ---
        nombre: formData.nombre,
        apellido: formData.apellido,
        // cliente: ... <--- ELIMINADO PARA EVITAR ERROR
        
        email_cliente: formData.correo,
        telefono: formData.telefono,
        empresa: formData.empresa,
        
        placa: formData.placa.toUpperCase(),
        kilometraje: kiloInt, 
        ciudad: formData.ciudad, 
        
        asistencia_ruta: formData.asistencia_ruta,
        observaciones: formData.observaciones
      };

      console.log("Guardando:", datosParaGuardar);

      if (citaExistenteId) {
          await databases.updateDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, citaExistenteId, datosParaGuardar);
          alert("✅ Cita Reprogramada Correctamente");
      } else {
          await databases.createDocument(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, ID.unique(), datosParaGuardar);
          alert("✅ Cita Registrada con Éxito");
      }
      navigate(0); 
    } catch (error) { 
      console.error("ERROR AL GUARDAR:", error);
      alert("Error: " + error.message); 
    } finally { 
      setLoading(false); 
    }
  };

  // --- RENDERIZADO DEL SELECT DE SEDES (FILTRO PLURAL) ---
  const renderSedesOptions = () => {
    if (listaTalleres.length === 0) return <option disabled>Cargando empresas...</option>;
    if (!formData.tipo_requerimiento) return <option disabled>-- Selecciona un servicio primero --</option>;

    const idsSedesPermitidas = listaRelaciones
        .filter(rel => {
            const servicioEnFila = rel.servicios && rel.servicios.$id ? rel.servicios.$id : rel.servicios;
            return servicioEnFila === formData.tipo_requerimiento;
        })
        .map(rel => {
            return rel.sedes && rel.sedes.$id ? rel.sedes.$id : rel.sedes;
        });

    if (idsSedesPermitidas.length === 0) return <option disabled>⚠️ No hay sedes para este servicio</option>;

    return listaTalleres.map(taller => {
        const sedesFiltradas = listaSedesTotal.filter(s => {
            const relTaller = s.talleres || s.taller_id;
            const tId = (relTaller && typeof relTaller === 'object') ? relTaller.$id : relTaller;
            const esDeEsteTaller = (tId === taller.$id);
            const ofreceServicio = idsSedesPermitidas.includes(s.$id);
            return esDeEsteTaller && ofreceServicio;
        });

        if (sedesFiltradas.length === 0) return null;

        return (
            <optgroup key={taller.$id} label={taller.nombre}>
                {sedesFiltradas.map(s => <option key={s.$id} value={s.$id}>{s.direccion ? s.direccion : s.nombre}</option>)}
            </optgroup>
        );
    });
  };

  const nombreSede = listaSedesTotal.find(s => s.$id === formData.sede)?.nombre;
  const nombreServicio = servicios.find(s => s.$id === formData.tipo_requerimiento)?.nombre;

  return (
    <div className="layout-formulario">
      <div className="form-header-top" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div className="marca-logo"><h2>Reserva tu Cita</h2></div>
        <button onClick={() => navigate('/login')} style={{background:'transparent', border:'1px solid #bdc3c7', padding:'5px 10px', borderRadius:'5px', cursor:'pointer', fontSize:'0.8rem', color:'#7f8c8d'}}>🔒 Admin</button>
      </div>

      <div className="contenedor-blanco">
        <div className="stepper-container">
          <div className={`step-item ${pasoActual >= 1 ? 'active' : ''}`}><div className="step-circle">1</div><span>Datos</span></div>
          <div className="linea-conector"></div>
          <div className={`step-item ${pasoActual >= 2 ? 'active' : ''}`}><div className="step-circle">2</div><span>Servicio</span></div>
          <div className="linea-conector"></div>
          <div className={`step-item ${pasoActual >= 3 ? 'active' : ''}`}><div className="step-circle">3</div><span>Fin</span></div>
        </div>

        <form className="form-content" onSubmit={(e) => e.preventDefault()}>
          
          {/* PASO 1 */}
          {pasoActual === 1 && (
            <div className="paso-animado">
              <h3 className="titulo-seccion">{citaExistenteId ? 'Verifica tus Datos' : 'Datos del Solicitante'}</h3>
              <div className="grid-2-col">
                <div className="input-group"><label>Nombre *</label><input type="text" name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Ej. Juan" /></div>
                <div className="input-group"><label>Apellido *</label><input type="text" name="apellido" value={formData.apellido} onChange={handleChange} placeholder="Ej. Pérez" /></div>
              </div>
              <div className="grid-2-col">
                <div className="input-group"><label>Correo *</label><input type="email" name="correo" value={formData.correo} onChange={handleChange} /></div>
                <div className="input-group"><label>Teléfono *</label><input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} /></div>
              </div>
              <div className="input-group full-width">
                <label>Empresa (Cliente) *</label>
                <input type="text" name="empresa" value={formData.empresa} onChange={handleChange} className="input-destacado" />
              </div>
              <div className="footer-buttons right"><button className="btn-primary" onClick={siguientePaso}>Siguiente ➜</button></div>
            </div>
          )}

          {/* PASO 2 */}
          {pasoActual === 2 && (
            <div className="paso-animado">
              <h3 className="titulo-seccion">Detalles del Servicio</h3>
              <div className="bloque-formulario">
                  {/* CUADRÍCULA 2x2 */}
                  <div className="grid-2-col">
                      <div className="input-group">
                        <label>Placa *</label>
                        <input type="text" name="placa" value={formData.placa} onChange={handleChange} onBlur={verificarPlaca} placeholder="ABC-123" style={{textTransform:'uppercase', fontSize:'1.1rem', letterSpacing:'1px', textAlign:'center'}} />
                      </div>
                      <div className="input-group">
                        <label>Kilometraje *</label>
                        <input type="number" name="kilometraje" value={formData.kilometraje} onChange={handleChange} placeholder="Ej. 50000" />
                      </div>
                  </div>
                  <div className="grid-2-col">
                      <div className="input-group">
                        <label>Ciudad *</label>
                        <input type="text" name="ciudad" value={formData.ciudad} onChange={handleChange} placeholder="Ej. Lima" />
                      </div>
                      <div className="input-group">
                          <label>Tipo Requerimiento *</label>
                          <select name="tipo_requerimiento" value={formData.tipo_requerimiento} onChange={handleChange}>
                              <option value="">-- Selecciona Primero --</option>
                              {servicios.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}
                          </select>
                      </div>
                  </div>

                  {buscandoPlaca && <p style={{fontSize:'0.8rem', color:'#666', textAlign:'center'}}>Buscando...</p>}
                  {citasDetectadas.length > 0 && !citaExistenteId && (
                      <div className="alerta-existente animate-fade">
                          <div className="alerta-header">⚠️ Citas pendientes detectadas:</div>
                          <ul className="alerta-lista">
                              {citasDetectadas.map(cita => (
                                  <li key={cita.$id} style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                      <span>📅 {new Date(cita.fecha_hora).toLocaleDateString()} - {listaSedesTotal.find(s=>s.$id === (cita.sede?.$id||cita.sede))?.nombre}</span>
                                      <button className="btn-reprogramar-mini" onClick={() => activarModoEdicion(cita)}>Reprogramar ↻</button>
                                  </li>
                              ))}
                          </ul>
                      </div>
                  )}
              </div>

              <div className="bloque-formulario destacado">
                  <div className="input-group full-width">
                      <label style={{color:'#2c3e50', fontSize:'1rem'}}>📍 ¿Dónde realizarás el servicio? *</label>
                      <select 
                        name="sede" 
                        value={formData.sede} 
                        onChange={handleChange} 
                        className="select-grande"
                        disabled={!formData.tipo_requerimiento} 
                        style={{backgroundColor: !formData.tipo_requerimiento ? '#f0f0f0' : 'white', cursor: !formData.tipo_requerimiento ? 'not-allowed' : 'pointer'}}
                      >
                          <option value="">
                              {!formData.tipo_requerimiento 
                                ? '-- Selecciona un Tipo de Requerimiento arriba --' 
                                : '-- Sedes Disponibles para este Servicio --'}
                          </option>
                          {renderSedesOptions()}
                      </select>
                  </div>
              </div>

              <div className="grid-2-col">
                  <div className="input-group">
                     <label>¿Asistencia en ruta? *</label>
                     <div className="radio-pills">
                        <label className={formData.asistencia_ruta === 'SI' ? 'active' : ''}><input type="radio" name="asistencia_ruta" value="SI" checked={formData.asistencia_ruta === 'SI'} onChange={handleChange} /> SÍ</label>
                        <label className={formData.asistencia_ruta === 'NO' ? 'active' : ''}><input type="radio" name="asistencia_ruta" value="NO" checked={formData.asistencia_ruta === 'NO'} onChange={handleChange} /> NO</label>
                     </div>
                     {formData.asistencia_ruta === 'SI' && (
                         <div className="alerta-asistencia-ruta animate-fade">
                             📞 DEBE GESTIONARLO DIRECTAMENTE LLAMANDO AL XXX
                         </div>
                     )}
                  </div>
                  {/* OBSERVACIONES FIXED */}
                  <div className="input-group">
                     <label>Observaciones</label>
                     <textarea 
                        name="observaciones" 
                        value={formData.observaciones} 
                        onChange={handleChange} 
                        rows="3" 
                        placeholder="Detalles adicionales..."
                        style={{resize: 'none', height: '100px', width: '100%', borderRadius:'6px', border:'1px solid #ccc', padding:'8px'}}
                     ></textarea>
                  </div>
              </div>

              {formData.sede && (
                  <div className="seccion-calendario animate-fade">
                      <h4 style={{textAlign:'center', margin:'20px 0 10px', color:'#555'}}>Disponibilidad en: <strong>{nombreSede}</strong></h4>
                      <div className="contenedor-calendario-slots">
                          <div className="bloque-calendario"><Calendar onChange={onFechaChange} value={fechaCalendario} minDate={new Date()} locale="es-ES" /></div>
                          <div className="bloque-slots">
                              <small>Horarios para {fechaSeleccionada}:</small>
                              <div className="grid-horarios">
                                {horariosDisponibles.length > 0 ? (
                                    horariosDisponibles.map(hora => (
                                        <button key={hora} type="button" className={`btn-horario ${horaSeleccionada === hora ? 'seleccionado' : ''}`} onClick={() => setHoraSeleccionada(hora)}>{hora}</button>
                                    ))
                                ) : (<div className="sin-horarios">{cargandoHorarios ? 'Cargando...' : 'Sin cupos disponibles.'}</div>)}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              <div className="footer-buttons spaced">
                <button className="btn-secondary" onClick={() => setPasoActual(1)}>Atrás</button>
                <button className="btn-primary" onClick={siguientePaso}>Siguiente ➜</button>
              </div>
            </div>
          )}

          {/* PASO 3 */}
          {pasoActual === 3 && (
            <div className="paso-animado">
              <h3 className="titulo-seccion">{citaExistenteId ? 'Confirma Reprogramación' : 'Confirma Reserva'}</h3>
              <div className="resumen-card">
                <div className="resumen-row"><span>👤 Cliente:</span><strong>{formData.nombre} {formData.apellido}</strong></div>
                <div className="resumen-row"><span>🏢 Empresa:</span><strong>{formData.empresa}</strong></div>
                <hr/>
                <div className="resumen-row"><span>📍 Sede:</span><strong>{nombreSede}</strong></div>
                <div className="resumen-row"><span>🏙️ Ciudad:</span><strong>{formData.ciudad}</strong></div>
                <div className="resumen-row"><span>🚗 Vehículo:</span><strong>{formData.placa} ({formData.kilometraje} km)</strong></div>
                <div className="resumen-row"><span>🔧 Servicio:</span><strong>{nombreServicio}</strong></div>
                <div className="resumen-row"><span>📅 Nueva Fecha:</span><strong style={{color:'#27ae60'}}>{fechaSeleccionada} - {horaSeleccionada}</strong></div>
                {formData.asistencia_ruta === 'SI' && <div className="resumen-row" style={{color:'#c0392b'}}><span>⚠️ Nota:</span><strong>Requiere Asistencia en Ruta</strong></div>}
              </div>
              <div className="footer-buttons spaced">
                <button className="btn-secondary" onClick={() => setPasoActual(2)}>Atrás</button>
                <button type="button" className="btn-confirmar-final" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Procesando..." : (citaExistenteId ? "CONFIRMAR CAMBIOS" : "CONFIRMAR RESERVA")}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}

export default FormularioReserva;