import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addProduct } from '../api'

export default function Search() {
  const [name, setName]       = useState('')
  const [url, setUrl]         = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError('Enter a product name')
    if (!url.trim() || !url.startsWith('http')) return setError('Enter a valid URL')
    if (!url.includes('inelabteamdev.com')) return setError('URL must be from demo.inelabteamdev.com')

    setLoading(true)
    try {
      const product = await addProduct({ name, url })
      navigate(`/product/${product.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add product')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="search-page">
      <div className="search-dialog">
        <h1>Track a Product</h1>
        <p className="subtitle">
          Browse{' '}
          <a href="https://demo.inelabteamdev.com" target="_blank" rel="noreferrer">
            demo.inelabteamdev.com
          </a>
          , copy a product URL and paste it below.
        </p>

        <form className="form" onSubmit={handleSubmit}>
          <label>
            Product name
            <input
              type="text"
              placeholder="e.g. Auralite Touch Monitor X"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>

          <label>
            Product URL
            <input
              type="url"
              placeholder="https://demo.inelabteamdev.com/product/..."
              value={url}
              onChange={e => setUrl(e.target.value)}
            />
          </label>

          {error && <p className="error">⚠ {error}</p>}

          <button type="submit" className="btn-track" disabled={loading}>
            {loading ? 'Adding…' : '⚡ Start Tracking →'}
          </button>
        </form>
      </div>
    </div>
  )
}