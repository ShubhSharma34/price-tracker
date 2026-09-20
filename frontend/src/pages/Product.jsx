import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { getProducts, getHistory, getProductLogs, scrapeNow } from '../api'

function fmt(price) {
  if (price == null) return '—'
  return `₹${Number(price).toLocaleString('en-IN')}`
}

function timeAgo(ts) {
  if (!ts) return 'never'
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)    return `${Math.round(diff)}s ago`
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return `${Math.round(diff / 86400)}d ago`
}

function shortDate(ts) {
  return new Date(ts).toLocaleString('en-IN', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export default function Product() {
  const { id } = useParams()
  const [product, setProduct] = useState(null)
  const [history, setHistory] = useState([])
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [scraping, setScraping] = useState(false)

  async function load() {
    setLoading(true)
    const [products, hist, lg] = await Promise.all([
      getProducts(),
      getHistory(id),
      getProductLogs(id),
    ])
    setProduct(products.find(p => String(p.id) === String(id)))
    setHistory(hist)
    setLogs(lg)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleScrapeNow() {
    setScraping(true)
    try {
      await scrapeNow(id)
      await new Promise(r => setTimeout(r, 3000)) // wait for scrape to finish
      await load()
    } finally {
      setScraping(false)
    }
  }

  if (loading) return <div className="page"><p>Loading…</p></div>
  if (!product) return <div className="page"><p>Product not found. <Link to="/">Go back</Link></p></div>

  // Compute min/max price for chart domain
  const prices = history.map(h => h.price).filter(Boolean)
  const minPrice = prices.length ? Math.floor(Math.min(...prices) * 0.95) : 0
  const maxPrice = prices.length ? Math.ceil(Math.max(...prices) * 1.05) : 100

  const chartData = history.map(h => ({
    time: shortDate(h.scraped_at),
    price: h.price ? Number(h.price) : null,
    stock: h.stock,
  }))

  // Price change vs first ever recorded
  const firstPrice = history[0]?.price
  const latestPrice = product.current_price
  const priceDiff = firstPrice && latestPrice ? latestPrice - firstPrice : null

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>

      {/* Product header */}
      <div className="product-header">
        <div>
          <h1>{product.name}</h1>
          <a href={product.url} target="_blank" rel="noreferrer" className="muted small">
            {product.url}
          </a>
        </div>
        <button onClick={handleScrapeNow} disabled={scraping} className="btn-primary">
          {scraping ? 'Scraping…' : '▶ Scrape Now'}
        </button>
      </div>

      {/* Stats row */}
      <div className="summary-grid">
        <div className="stat-card">
          <span className="stat-num">{fmt(product.current_price)}</span>
          <span className="stat-label">Current price</span>
        </div>
        <div className="stat-card">
          <span className={`stat-num ${product.current_stock === 'in_stock' ? 'green' : 'red'}`}>
            {product.current_stock || 'unknown'}
          </span>
          <span className="stat-label">Stock status</span>
        </div>
        <div className="stat-card">
          <span className={`stat-num ${priceDiff === null ? '' : priceDiff < 0 ? 'green' : 'red'}`}>
            {priceDiff === null ? '—' : (priceDiff < 0 ? '▼' : '▲') + ' ' + fmt(Math.abs(priceDiff))}
          </span>
          <span className="stat-label">Since first track</span>
        </div>
        <div className="stat-card">
          <span className="stat-num small">{timeAgo(product.last_scraped)}</span>
          <span className="stat-label">Last scraped</span>
        </div>
      </div>

      {/* Price history chart */}
      <section className="section">
        <h2>Price History</h2>
        {chartData.length < 2 ? (
          <p className="muted">
            Not enough data yet. Price history builds up after each scrape (every 2 hours).
            <button onClick={handleScrapeNow} className="inline-btn" disabled={scraping}>
              {scraping ? ' Scraping…' : ' Run a scrape now →'}
            </button>
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis domain={[minPrice, maxPrice]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmt(v)} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Raw history table */}
      <section className="section">
        <h2>Price & Stock Log</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Price</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {[...history].reverse().map((h, i) => (
                <tr key={i}>
                  <td className="muted">{shortDate(h.scraped_at)}</td>
                  <td>{fmt(h.price)}</td>
                  <td>
                    <span className={`badge ${h.stock === 'in_stock' ? 'green' : h.stock === 'out_of_stock' ? 'red' : 'neutral'}`}>
                      {h.stock}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Scrape log */}
      <section className="section">
        <h2>Scrape Attempts</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Status</th><th>Retries</th><th>Duration</th><th>Error</th></tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={i}>
                  <td className="muted">{shortDate(l.scraped_at)}</td>
                  <td>
                    <span className={`badge ${l.status === 'success' ? 'green' : l.status === 'retried' ? 'yellow' : 'red'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td>{l.retries}</td>
                  <td>{l.duration_ms}ms</td>
                  <td className="muted small">{l.error_msg || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
