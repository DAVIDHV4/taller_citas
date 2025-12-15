import { HashRouter, Routes, Route } from 'react-router-dom'
import MapaSedes from './paginas/MapaSedes'
import FormularioReserva from './paginas/FormularioReserva'
import Login from './paginas/Login'
import Dashboard from './paginas/Dashboard'
import DashboardTrabajador from './paginas/DashboardTrabajador'
import Registro from './paginas/Registro'
import './App.css'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<MapaSedes />} />
        <Route path="/agendar" element={<FormularioReserva />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/trabajador/dashboard" element={<DashboardTrabajador />} />
        <Route path='/registro' element={<Registro/>}/>
      </Routes>
    </HashRouter>
  )
}

export default App