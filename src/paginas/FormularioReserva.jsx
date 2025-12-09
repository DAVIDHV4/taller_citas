import { useState, useEffect } from 'react'
import { databases, TALLER_CONFIG } from '../lib/appwrite'
import { ID, Query } from 'appwrite' 
import { useLocation, useNavigate } from 'react-router-dom'
import Calendar from 'react-calendar' 
import 'react-calendar/dist/Calendar.css'
import '../estilos/Formulario.css'

function FormularioReserva() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [sedeActual, setSedeActual] = useState(location.state?.sedeSeleccionada || null);
  const [servicios, setServicios] = useState([]);
  const [todasLasSedes, setTodasLasSedes] = useState([]);
  
  const [pasoActual, setPasoActual] = useState(1);
  const [loading, setLoading] = useState(false);
  const [citaExistenteId, setCitaExistenteId] = useState(null);
  const [citasDetectadas, setCitasDetectadas] = useState([]);

  // --- ESTADOS FECHA Y HORA ---
  const [fechaCalendario, setFechaCalendario] = useState(new Date());
  const [fechaSeleccionada, setFechaSeleccionada] = useState(new Date().toLocaleDateString('en-CA'));
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [horariosDisponibles, setHorariosDisponibles] = useState([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  // ESTA LISTA SOLO SIRVE PARA EL ORDEN VISUAL. 
  // SI LA HORA NO ESTÁ EN TU BD (TABLA CUPOS), NO SE MOSTRARÁ.
  const BLOQUES_BASE = [
    "08:00", "09:00", "10:00", "11:00", 
    "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
  ]; 

  const [formData, setFormData] = useState({
    placa: '', servicio: '', nombre: '', dni: '', telefono: ''
  });

  // CARGAR DATOS
  useEffect(() => {
    if (!sedeActual) { navigate('/'); return; }
    
    const cargarDatos = async () => {
      try {
        const resServicios = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SERVICIOS);
        setServicios(resServicios.documents);

        const resSedes = await databases.listDocuments(TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_SEDES);
        setTodasLasSedes(resSedes.documents);
      } catch (error) { console.error(error); }
    };
    cargarDatos();
  }, []); 

  // --- CÁLCULO ESTRICTO (SOLO BD CUPOS) ---
  useEffect(() => {
    if (!fechaSeleccionada || !sedeActual || pasoActual !== 2) return;

    const calcularDisponibilidad = async () => {
      setCargandoHorarios(true);
      try {
        // 1. TRAER REGLAS DE CUPOS (ESTO ES LO QUE MANDA)
        const resConfig = await databases.listDocuments(
            TALLER_CONFIG.DATABASE_ID,
            TALLER_CONFIG.COLLECTION_CUPOS, 
            [ Query.equal('sede', sedeActual.$id) ]
        );
        
        // Mapa de reglas: { "08:00": 3, "09:00": 5 }
        const reglasPorHora = {};
        resConfig.documents.forEach(regla => { reglasPorHora[regla.hora] = regla.cantidad; });

        // 2. TRAER CITAS YA OCUPADAS
        const resCitas = await databases.listDocuments(
          TALLER_CONFIG.DATABASE_ID,
          TALLER_CONFIG.COLLECTION_CITAS,
          [
            Query.equal('sede', sedeActual.$id), 
            Query.limit(100), 
            Query.orderDesc('fecha_hora')
          ]
        );

        // 3. CONTAR OCUPACIÓN
        const conteoOcupacion = {}; 
        resCitas.documents.forEach(cita => {
            const fechaCita = new Date(cita.fecha_hora);
            const fechaString = fechaCita.toLocaleDateString('en-CA'); 
            if (fechaString === fechaSeleccionada) {
                const horaString = fechaCita.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                if (cita.$id !== citaExistenteId) {
                    conteoOcupacion[horaString] = (conteoOcupacion[horaString] || 0) + 1;
                }
            }
        });

        // 4. FILTRAR ESTRICTO
        const disponibles = BLOQUES_BASE.filter(hora => {
            const ocupados = conteoOcupacion[hora] || 0;
            
            // --- CAMBIO CRÍTICO AQUÍ ---
            // SI NO ESTÁ EN LA TABLA 'CUPOS', LA CAPACIDAD ES 0.
            // YA NO MIRAMOS LA TABLA 'SEDES'.
            const capacidadMaxima = reglasPorHora[hora] || 0; 
            
            // Solo mostramos si la capacidad definida en BD es mayor a 0 y hay espacio
            return capacidadMaxima > 0 && ocupados < capacidadMaxima;
        });

        setHorariosDisponibles(disponibles);

      } catch (error) {
        console.error("Error calculando horarios:", error);
      } finally {
        setCargandoHorarios(false);
      }
    };

    calcularDisponibilidad();
  }, [fechaSeleccionada, sedeActual, pasoActual, citaExistenteId]);


  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const onFechaChange = (date) => {
    setFechaCalendario(date);
    const fechaString = date.toLocaleDateString('en-CA'); 
    setFechaSeleccionada(fechaString);
    setHoraSeleccionada('');
  };

  const obtenerNombreSede = (cita) => {
    if (cita.sede && cita.sede.nombre) return cita.sede.nombre;
    const idBusqueda = cita.sede?.$id || cita.sede; 
    const sedeEncontrada = todasLasSedes.find(s => s.$id === idBusqueda);
    return sedeEncontrada ? sedeEncontrada.nombre : "Sede no encontrada";
  };

  const verificarYAvanzar = async (e) => {
    e.preventDefault();
    if (pasoActual === 1) {
      if (!formData.placa || !formData.servicio) return alert("Completa los datos");
      setLoading(true);
      try {
        const busqueda = await databases.listDocuments(
          TALLER_CONFIG.DATABASE_ID,
          TALLER_CONFIG.COLLECTION_CITAS,
          [ Query.equal('placa', formData.placa.toUpperCase()) ]
        );
        const encontradas = busqueda.documents.filter(c => c.estado === 'pendiente');

        if (encontradas.length > 0) {
          setCitasDetectadas(encontradas);
          setCitaExistenteId(null);
        } else {
          setCitasDetectadas([]);
          setCitaExistenteId(null);
          setSedeActual(location.state?.sedeSeleccionada);
        }
        setPasoActual(2);
      } catch (error) {
        console.error(error);
        alert("Error de conexión");
      } finally {
        setLoading(false);
      }
    } else {
      setPasoActual(prev => prev + 1);
    }
  };

  const activarModoEdicion = (citaSeleccionada) => {
    setCitaExistenteId(citaSeleccionada.$id);
    
    const fechaObj = new Date(citaSeleccionada.fecha_hora);
    const soloFecha = fechaObj.toLocaleDateString('en-CA'); 
    const soloHora = fechaObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    let servicioId = formData.servicio;
    if(citaSeleccionada.servicio) {
       servicioId = citaSeleccionada.servicio.$id || citaSeleccionada.servicio;
    }

    if (citaSeleccionada.sede) {
        const idSede = citaSeleccionada.sede.$id || citaSeleccionada.sede;
        const sedeReal = todasLasSedes.find(s => s.$id === idSede);
        if (sedeReal) setSedeActual(sedeReal);
    }

    setFormData({
      placa: citaSeleccionada.placa,
      servicio: servicioId,
      nombre: citaSeleccionada.cliente,
      dni: citaSeleccionada.dni,
      telefono: citaSeleccionada.telefono
    });
    
    setFechaCalendario(fechaObj); 
    setFechaSeleccionada(soloFecha);
    setHoraSeleccionada(soloHora);
    setCitasDetectadas([]);
  };

  const pasoAnterior = () => setPasoActual(prev => prev - 1);

  const handleSubmit = async () => {
    try {
      if (!fechaSeleccionada || !horaSeleccionada) return alert("Selecciona fecha y hora");
      
      const fechaFinal = new Date(`${fechaSeleccionada}T${horaSeleccionada}:00`);
      const fechaISO = fechaFinal.toISOString();
      
      const datosParaGuardar = {
        placa: formData.placa.toUpperCase(),
        cliente: formData.nombre,      
        dni: formData.dni,             
        telefono: formData.telefono,   
        fecha_hora: fechaISO,       
        estado: 'pendiente',
        sede: sedeActual.$id,       
        servicio: formData.servicio 
      };

      if (citaExistenteId) {
        await databases.updateDocument(
            TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, citaExistenteId, datosParaGuardar
        );
        alert(`✅ Cita Reprogramada en ${sedeActual.nombre}`);
      } else {
        await databases.createDocument(
            TALLER_CONFIG.DATABASE_ID, TALLER_CONFIG.COLLECTION_CITAS, ID.unique(), datosParaGuardar
        );
        alert("✅ ¡Cita Registrada con Éxito!");
      }
      navigate('/'); 
    } catch (error) {
      alert("Error: " + error.message);
    }
  };

  if (!sedeActual) return null;

  return (
    <div className="layout-formulario">
      <div className="form-header-top">
        <div className="marca-logo"><h2>{sedeActual.nombre}</h2></div>
        <button className="btn-cambiar-taller" onClick={() => navigate('/')}>↻ Cambiar Taller</button>
      </div>

      <div className="contenedor-blanco">
        <div className="stepper-container">
          <div className={`step-item ${pasoActual >= 1 ? 'active' : ''}`}><div className="step-circle">1</div></div>
          <div className="linea-conector"></div>
          <div className={`step-item ${pasoActual >= 2 ? 'active' : ''}`}><div className="step-circle">2</div></div>
          <div className="linea-conector"></div>
          <div className={`step-item ${pasoActual >= 3 ? 'active' : ''}`}><div className="step-circle">3</div></div>
        </div>

        <form className="form-content">
          {/* PASO 1 */}
          {pasoActual === 1 && (
            <div className="paso-animado">
              <h3 className="titulo-seccion">Datos del Vehículo</h3>
              <div className="grid-2-col">
                <div className="input-group">
                  <label>Placa del Vehículo *</label>
                  <input type="text" name="placa" placeholder="Ej: ABC-123" value={formData.placa} onChange={handleChange} maxLength={7} autoFocus />
                </div>
                <div className="input-group">
                  <label>Tipo de Requerimiento *</label>
                  <select name="servicio" value={formData.servicio} onChange={handleChange}>
                    <option value="">-- Seleccione --</option>
                    {servicios.map(s => <option key={s.$id} value={s.$id}>{s.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="footer-buttons right">
                <button className="btn-primary" onClick={verificarYAvanzar} disabled={loading || !formData.placa || !formData.servicio}>
                  {loading ? "Verificando..." : "Siguiente"}
                </button>
              </div>
            </div>
          )}

          {/* PASO 2 */}
          {pasoActual === 2 && (
            <div className="paso-animado">
              {citasDetectadas.length > 0 && (
                <div className="alerta-cita-existente">
                  <div className="titulo-alerta">⚠️ {citasDetectadas.length} cita(s) pendiente(s)</div>
                  <div className="lista-citas-pendientes">
                    {citasDetectadas.map((cita) => (
                      <div key={cita.$id} className="item-cita-pendiente">
                        <div className="info-cita">
                          <small>Fecha:</small>
                          <strong>{new Date(cita.fecha_hora).toLocaleString()}</strong>
                        </div>
                        <div className="info-cita">
                            <small>Sede:</small>
                            <strong>{obtenerNombreSede(cita)}</strong>
                        </div>
                        <button type="button" className="btn-reprogramar-mini" onClick={() => activarModoEdicion(cita)}>
                          Reprogramar Esta
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="titulo-seccion">{citaExistenteId ? "Reprogramando Cita" : "Tus Datos Personales"}</h3>
              <div className="grid-2-col">
                <div className="input-group"><label>DNI *</label><input type="number" name="dni" value={formData.dni} onChange={handleChange} /></div>
                <div className="input-group"><label>Nombre Completo *</label><input type="text" name="nombre" value={formData.nombre} onChange={handleChange} /></div>
                <div className="input-group"><label>Teléfono</label><input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} /></div>
              </div>

              {/* ZONA DE CALENDARIO VISUAL Y HORAS */}
              <div className="input-group" style={{marginTop: '20px'}}>
                  <label>Selecciona Fecha y Hora *</label>
                  <div className="contenedor-calendario-slots">
                      <div className="bloque-calendario">
                          <Calendar 
                            onChange={onFechaChange} 
                            value={fechaCalendario}
                            minDate={new Date()} 
                            locale="es-ES" 
                          />
                      </div>

                      <div className="bloque-slots">
                          <small style={{color:'#666', display:'block', marginBottom:'10px'}}>
                             Horarios disponibles:
                          </small>

                          {cargandoHorarios ? (
                              <p style={{color:'#007bff'}}>Consultando horarios...</p>
                          ) : (
                              <div className="grid-horarios">
                                {horariosDisponibles.length > 0 ? (
                                    horariosDisponibles.map(hora => {
                                        const horaFin = parseInt(hora.split(':')[0]) + 1;
                                        const horaFinString = horaFin < 10 ? `0${horaFin}:00` : `${horaFin}:00`;
                                        return (
                                            <button key={hora} type="button" className={`btn-horario ${horaSeleccionada === hora ? 'seleccionado' : ''}`} onClick={() => setHoraSeleccionada(hora)}>
                                                {hora} - {horaFinString}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="sin-horarios">
                                        No hay cupos disponibles. <br/>
                                        <span style={{fontSize: '0.8rem', color: '#888'}}>
                                            (Este taller no tiene horarios habilitados en BD para hoy)
                                        </span>
                                    </div>
                                )}
                              </div>
                          )}
                      </div>
                  </div>
              </div>

              <div className="footer-buttons spaced">
                <button className="btn-secondary" onClick={pasoAnterior}>Atrás</button>
                <button className="btn-primary" onClick={() => setPasoActual(3)} disabled={!formData.dni || !formData.nombre || !fechaSeleccionada || !horaSeleccionada}>Siguiente</button>
              </div>
            </div>
          )}

          {/* PASO 3 */}
          {pasoActual === 3 && (
            <div className="paso-animado">
              <h3 className="titulo-seccion">Confirmación</h3>
              <div className="resumen-card">
                <div className="resumen-row"><span>📍 Taller:</span><strong>{sedeActual.nombre}</strong></div>
                <div className="resumen-row"><span>🚗 Placa:</span><strong>{formData.placa.toUpperCase()}</strong></div>
                <div className="resumen-row"><span>🔧 Servicio:</span><strong>{servicios.find(s => s.$id === formData.servicio)?.nombre}</strong></div>
                <div className="resumen-row"><span>📅 Fecha:</span><strong>{fechaSeleccionada} | {horaSeleccionada}</strong></div>
                <div className="resumen-row"><span>👤 Cliente:</span><strong>{formData.nombre}</strong></div>
              </div>
              <div className="footer-buttons spaced">
                <button className="btn-secondary" onClick={pasoAnterior}>Atrás</button>
                <button type="button" className="btn-confirmar-final" onClick={handleSubmit}>
                  {citaExistenteId ? "GUARDAR CAMBIOS" : "CONFIRMAR CITA"}
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