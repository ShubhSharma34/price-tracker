import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProducts, getAllLogs, scrapeNow, deleteProduct } from '../api'

// Format a price number nicely
function fmt(price) {
  if (price == null) return '—'
  return `$${Number(price).toFixed(2)}`
}

// How long ago was a timestamp
function timeAgo(ts) {
  if (!ts) return 'never'
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)   return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

// Price change badge
function PriceBadge({ current, prev }) {
  if (!current || !prev || current === prev) return <span className="badge neutral">—</span>
  const diff = current - prev
  const pct  = ((diff / prev) * 100).toFixed(1)
  return diff < 0
    ? <span className="badge green">▼ {fmt(Math.abs(diff))} ({Math.abs(pct)}%)</span>
    : <span className="badge red">▲ {fmt(diff)} ({pct}%)</span>
}

// Status badge for scrape log
function StatusBadge({ status }) {
  const map = { success: 'green', retried: 'yellow', failed: 'red' }
  return <span className={`badge ${map[status] || 'neutral'}`}>{status}</span>
}

export default function Dashboard() {
  const [products, setProducts] = useState([])
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const navigate = useNavigate()

  async function load() {
    setLoading(true)
    const [p, l] = await Promise.all([getProducts(), getAllLogs()])
    setProducts(p)
    setLogs(l)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── Summary stats ────────────────────────────────────────────────────────
  const totalProducts   = products.length
  const inStock         = products.filter(p => p.current_stock === 'in_stock').length
  const priceDrops      = products.filter(p =>
    p.current_price && p.prev_price && p.current_price < p.prev_price
  ).length
  const recentLogs      = logs.slice(0, 20)
  const successRate     = logs.length
    ? Math.round((logs.filter(l => l.status !== 'failed').length / logs.length) * 100)
    : 100

  const lastRun = logs[0]?.scraped_at

  if (loading) return <div className="page"><p>Loading dashboard…</p></div>

  return (
    <div className="page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <button className="btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="summary-grid">
        <div className="stat-card">
          <span className="stat-num">{totalProducts}</span>
          <span className="stat-label">Products tracked</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{inStock}</span>
          <span className="stat-label">In stock</span>
        </div>
        <div className="stat-card">
          <span className="stat-num green">{priceDrops}</span>
          <span className="stat-label">Price drops</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">{successRate}%</span>
          <span className="stat-label">Scrape success rate</span>
        </div>
        <div className="stat-card wide">
          <span className="stat-num small">{lastRun ? timeAgo(lastRun) : 'No runs yet'}</span>
          <span className="stat-label">Last scrape run</span>
        </div>
      </div>

      {/* ── All products table ────────────────────────────────────────────── */}
      <section className="section">
        <h2>All Tracked Products</h2>
        {products.length === 0 ? (
          <p>No products yet. <a href="/">Add one →</a></p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Change</th>
                  <th>Stock</th>
                  <th>Last scraped</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id} onClick={() => navigate(`/product/${p.id}`)} className="clickable-row">
                    <td><strong>{p.name}</strong></td>
                    <td>{fmt(p.current_price)}</td>
                    <td><PriceBadge current={p.current_price} prev={p.prev_price} /></td>
                    <td>
                      <span className={`badge ${p.current_stock === 'in_stock' ? 'green' : p.current_stock === 'out_of_stock' ? 'red' : 'neutral'}`}>
                        {p.current_stock || 'unknown'}
                      </span>
                    </td>
                    <td className="muted">{timeAgo(p.last_scraped)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-sm" onClick={() => scrapeNow(p.id).then(load)}>
                        Scrape now
                      </button>
                      <button className="btn-sm danger" onClick={async () => {
                        if (confirm(`Remove "${p.name}"?`)) {
                          await deleteProduct(p.id)
                          load()
                        }
                      }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Recent scrape log (all products) ─────────────────────────────── */}
      <section className="section">
        <h2>Recent Scrape Log</h2>
        {recentLogs.length === 0 ? (
          <p className="muted">No scrape attempts yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Status</th>
                  <th>Retries</th>
                  <th>Duration</th>
                  <th>Error</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((l, i) => (
                  <tr key={i}>
                    <td>{l.product_name}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td>{l.retries}</td>
                    <td>{l.duration_ms}ms</td>
                    <td className="muted small">{l.error_msg || '—'}</td>
                    <td className="muted">{timeAgo(l.scraped_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
