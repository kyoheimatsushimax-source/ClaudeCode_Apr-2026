import BookCard from './BookCard'
import '../styles/SearchResults.css'

export default function SearchResults({ books, loading, error }) {
  if (loading) {
    return <div className="loading">検索中...</div>
  }

  if (error) {
    return <div className="error">エラー: {error}</div>
  }

  if (!books || books.length === 0) {
    return <div className="no-results">検索結果がありません。別のキーワードで試してください。</div>
  }

  return (
    <div className="search-results">
      <h2>検索結果 ({books.length}件)</h2>
      <div className="books-grid">
        {books.map((book, index) => (
          <BookCard key={`${book.isbn}-${index}`} book={book} />
        ))}
      </div>
    </div>
  )
}
