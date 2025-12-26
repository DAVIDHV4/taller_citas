// CAMBIO IMPORTANTE: Usamos BrowserRouter en lugar de HashRouter
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MapaSedes from './paginas/MapaSedes' // Si lo usas
import FormularioReserva from './paginas/FormularioReserva'
import Login from './paginas/Login'
import Dashboard from './paginas/Dashboard'
import DashboardTrabajador from './paginas/DashboardTrabajador'
import Registro from './paginas/Registro'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FormularioReserva />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/dashboard" element={<Dashboard />} />
        <Route path="/trabajador/dashboard" element={<DashboardTrabajador />} />
        <Route path='/registro' element={<Registro/>}/>
      </Routes>
    </BrowserRouter>
  )
}

export default App