import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MapaSedes from './paginas/MapaSedes'
import FormularioReserva from './paginas/FormularioReserva'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta principal: Muestra el Mapa */}
        <Route path="/" element={<MapaSedes />} />
        
        {/* Ruta secundaria: Muestra el Formulario */}
        <Route path="/agendar" element={<FormularioReserva />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App