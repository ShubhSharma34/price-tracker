import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Search from './pages/Search'
import Dashboard from './pages/Dashboard'
import Product from './pages/Product'
import './index.css'

export default function App() {
  const [dark, setDark] = useState(() => {
    return localStorage.getItem('theme') !== 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <BrowserRouter>
      <nav className="navbar">
        <span className="brand">⚡ PriceTracker</span>
        <NavLink to="/" end>Search</NavLink>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <button
          className="theme-toggle"
          onClick={() => setDark(d => !d)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark ? '☀️' : '🌙'}
        </button>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/"            element={<Search />} />
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/product/:id" element={<Product />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}