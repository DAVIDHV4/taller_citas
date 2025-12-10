import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { databases, TALLER_CONFIG } from '../lib/appwrite' 
import { useNavigate } from 'react-router-dom'
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import '../estilos/Mapa.css' // Asegúrate de importar el CSS

// Configuración de iconos
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
});
L.Marker.prototype.options.icon = DefaultIcon;

function VolarAlMapa({ destino }) {
  const map = useMap();
  useEffect(() => {
    if (destino) map.flyTo(destino, 15, { duration: 1.5 });
  }, [destino, map]);
  return null;
}

function MapaSedes() {
  const [sedes, setSedes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [centroMapa, setCentroMapa] = useState([-12.046, -77.042]);
  
  // ESTADO PARA EL BUSCADOR
  const [busqueda, setBusqueda] = useState("");

  const markerRefs = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    const cargarSedes = async () => {
      try {
        const response = await databases.listDocuments(
          TALLER_CONFIG.DATABASE_ID,
          TALLER_CONFIG.COLLECTION_SEDES
        );
        // Filtramos solo las que tienen coordenadas válidas
        const validas = response.documents.filter(s => s.latitud && s.longitud);
        setSedes(validas);
        
        // Centrar mapa en la primera sede si existe
        if(validas.length > 0) setCentroMapa([validas[0].latitud, validas[0].longitud]);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    cargarSedes();
  }, []);

  // --- LÓGICA DE FILTRADO ---
  const sedesFiltradas = sedes.filter((sede) => {
    // Si no hay búsqueda, mostramos todas
    if (!busqueda) return true;

    const texto = busqueda.toLowerCase();
    const nombre = sede.nombre ? sede.nombre.toLowerCase() : "";
    const direccion = sede.direccion ? sede.direccion.toLowerCase() : "";

    // Retorna TRUE si el nombre O la dirección contienen el texto
    return nombre.includes(texto) || direccion.includes(texto);
  });

  const handleVerEnMapa = (sede) => {
    setCentroMapa([sede.latitud, sede.longitud]);
    // Pequeño timeout para asegurar que el mapa vuele antes de abrir el popup
    setTimeout(() => {
        const marker = markerRefs.current[sede.$id];
        if (marker) marker.openPopup();
    }, 100);
  };

  const irAFormulario = (sede) => {
    navigate('/agendar', { state: { sedeSeleccionada: sede } });
  };

  if (loading) return <div className="loading-screen">Cargando mapa...</div>;

  return (
    <div className="layout-principal">
      
      {/* 1. COLUMNA IZQUIERDA (INTACTA) */}
      <div className="sidebar-lista">
        <div className="sidebar-header">
          <h2>Red de Talleres</h2>
          <p>Selecciona una sede para comenzar</p>
          
          <div className="buscador-container">
            <input 
                type="text" 
                className="input-buscador"
                placeholder="Buscar por nombre o dirección..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        <div className="lista-scroll">
          {sedesFiltradas.length > 0 ? (
            sedesFiltradas.map((sede) => (
                <div key={sede.$id} className="tarjeta-sede">
                <h3>{sede.nombre}</h3>
                <p className="direccion">📍 {sede.direccion}</p>
                <div className="acciones-sede">
                    <button className="btn-ver-mapa" onClick={() => handleVerEnMapa(sede)}>Ver mapa</button>
                    <button className="btn-agendar" onClick={() => irAFormulario(sede)}>Agendar</button>
                </div>
                </div>
            ))
          ) : (
            <div className="sin-resultados">
                <p>No encontramos talleres con "{busqueda}"</p>
            </div>
          )}
        </div>
      </div>

     
      <div className="mapa-container">
        
        <button 
            className="btn-login-flotante" 
            onClick={() => navigate('/login')}
        >
            Admin
        </button>
        {/* ----------------------- */}

        <MapContainer center={centroMapa} zoom={13} style={{height: '100%', width: '100%'}}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <VolarAlMapa destino={centroMapa} />
          
          {sedesFiltradas.map((sede) => (
            <Marker 
              key={sede.$id} 
              position={[sede.latitud, sede.longitud]}
              ref={(ref) => markerRefs.current[sede.$id] = ref}
            >
              <Popup>
                <strong>{sede.nombre}</strong><br/>
                {sede.direccion}<br/>
                <button className="btn-agendar-popup" onClick={() => irAFormulario(sede)}>Agendar Aquí</button>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      
    </div>
  )
}

export default MapaSedes;