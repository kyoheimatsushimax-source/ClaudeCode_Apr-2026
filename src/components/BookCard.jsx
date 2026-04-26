import '../styles/BookCard.css'

export default function BookCard({ book }) {
  return (
    <div className="book-card">
      {book.cover && (
        <img src={book.cover} alt={book.title} className="book-cover" />
      )}

      <div className="book-info">
        <h3 className="book-title">{book.title}</h3>

        {book.author && <p className="book-author">著者: {book.author}</p>}

        {book.publisher && (
          <p className="book-publisher">出版社: {book.publisher}</p>
        )}

        {book.pubdate && <p className="book-date">出版年: {book.pubdate}</p>}

        {book.isbn && <p className="book-isbn">ISBN: {book.isbn}</p>}

        {book.volume && <p className="book-volume">巻数: {book.volume}</p>}

        {book.description && (
          <p className="book-description">{book.description}</p>
        )}
      </div>
    </div>
  )
}
