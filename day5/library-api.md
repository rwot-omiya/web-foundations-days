# Library Books API Design

This REST API manages a library's **books** resource. The API returns JSON responses and uses `/api` as its base path.

## Endpoints

### List all books

- **Method:** `GET`
- **Path:** `/api/books`
- **Description:** Returns all books in the library.
- **Success status:** `200 OK`
- **Example request:** `GET /api/books`

### Get one book

- **Method:** `GET`
- **Path:** `/api/books/:id`
- **Description:** Returns the book with the requested ID.
- **Success status:** `200 OK`
- **Example request:** `GET /api/books/42`

### Create a book

- **Method:** `POST`
- **Path:** `/api/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

  ```json
  {
    "title": "The Left Hand of Darkness",
    "author": "Ursula K. Le Guin",
    "publishedYear": 1969,
    "isbn": "9780441478125"
  }
  ```

- **Success status:** `201 Created`

### Update a book

- **Method:** `PUT`
- **Path:** `/api/books/:id`
- **Description:** Replaces the details of an existing book.
- **Example request body:**

  ```json
  {
    "title": "The Left Hand of Darkness",
    "author": "Ursula K. Le Guin",
    "publishedYear": 1969,
    "isbn": "9780441478125"
  }
  ```

- **Success status:** `200 OK`

### Delete a book

- **Method:** `DELETE`
- **Path:** `/api/books/:id`
- **Description:** Removes the book with the requested ID.
- **Success status:** `204 No Content`
- **Example request:** `DELETE /api/books/42`

### List books by author

- **Method:** `GET`
- **Path:** `/api/books?author={author}`
- **Description:** Returns books whose author matches the `author` query parameter.
- **Success status:** `200 OK`
- **Example request:** `GET /api/books?author=Ursula%20K.%20Le%20Guin`

## Error responses

- **`400 Bad Request`:** The request is invalid, such as a create request that is missing the required `title` or `author` field.
- **`404 Not Found`:** The requested book does not exist, such as `GET /api/books/99999` when no book has ID `99999`.
