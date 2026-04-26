import { useState } from 'react'
import SearchForm from './components/SearchForm'
import SearchResults from './components/SearchResults'
import { searchBooks, getPrefectures } from './services/calilApi'
import './App.css'

function App() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const prefectures = getPrefectures()

  const handleSearch = async (query, prefCode) => {
    setLoading(true)
    setError(null)
    setBooks([])

    try {
      const results = await searchBooks(query)

      if (results.books && Array.isArray(results.books)) {
        setBooks(results.books)
      } else {
        setBooks([])
      }
    } catch (err) {
      setError('検索に失敗しました。もう一度お試しください。')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <SearchForm onSearch={handleSearch} prefectures={prefectures} />
      <SearchResults books={books} loading={loading} error={error} />
    </div>
  )
}

export default App
