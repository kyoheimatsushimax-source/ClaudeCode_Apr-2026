import { useState } from 'react'
import '../styles/SearchForm.css'

export default function SearchForm({ onSearch, prefectures }) {
  const [query, setQuery] = useState('')
  const [selectedPref, setSelectedPref] = useState('13')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsLoading(true)
    try {
      await onSearch(query, selectedPref)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      <h1>📚 図書館検索アプリ</h1>
      <p>書籍を検索して、図書館での利用可能状況を確認できます</p>

      <div className="search-inputs">
        <div className="input-group">
          <label htmlFor="query">書籍タイトル・著者</label>
          <input
            id="query"
            type="text"
            placeholder="本のタイトルや著者名を入力..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="input-group">
          <label htmlFor="prefecture">都道府県</label>
          <select
            id="prefecture"
            value={selectedPref}
            onChange={(e) => setSelectedPref(e.target.value)}
            disabled={isLoading}
          >
            {prefectures.map((pref) => (
              <option key={pref.code} value={pref.code}>
                {pref.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? '検索中...' : '検索'}
      </button>
    </form>
  )
}
