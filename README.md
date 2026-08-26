# DOCCHAT

DOCCHAT is a multi-user Retrieval-Augmented Generation (RAG) application for asking grounded questions about your documents. Upload study material or technical documents, organise them by category and section, then chat with the relevant content.

The project is designed for student notes, research papers, course material, manuals, and other knowledge collections that benefit from focused, private retrieval.

## Features

- Secure sign-up and login with Argon2 password hashing and JWT authentication.
- Private per-user document collections in Chroma Cloud.
- Upload up to **3 files at once**: PDF, DOCX, HTML, TXT, and Markdown.
- Per-file category, section, validation, processing status, and failure feedback.
- PDF extraction modes:
  - **Fast** (default) for normal text PDFs.
  - **High res** for PDFs where images, tables, or layout matter.
- Automatic extraction for non-PDF file types.
- Guardrails that reject empty files, documents above 250,000 extracted characters, and documents that would create more than 90 chunks. Content is never silently truncated.
- Parallel document enrichment with bounded concurrency, batch embeddings, and live upload-job polling.
- Focused chat by category and section, or search across the full private library.
- Rich Markdown and math rendering, chat export to PDF, and document removal from both PostgreSQL and Chroma.
- Optional Tavily web search when the assistant needs current information or links.

## Architecture

```text
React + Vite frontend
        |
        | HTTPS / JWT
        v
FastAPI backend --> PostgreSQL   (users, upload jobs, extracted metadata)
        |
        +--> Chroma Cloud         (per-user vector collections)
        +--> Google Gemini        (embeddings and answers)
        +--> DeepSeek             (chunk descriptions during ingestion)
        `--> Tavily              (optional live web search)
```

During ingestion, DOCCHAT extracts document elements, checks document limits, chunks the content, creates searchable descriptions, generates embeddings, and persists the resulting vectors and metadata. A failed file does not fail the rest of the batch.

## Tech stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, Vite, Tailwind CSS, React Router |
| Backend | FastAPI, SQLAlchemy, Pydantic, Uvicorn |
| Relational database | PostgreSQL (MySQL is also supported by SQLAlchemy configuration) |
| Vector database | Chroma Cloud |
| AI | Google Gemini and DeepSeek |
| Document parsing | Unstructured, Tesseract OCR, Poppler, libmagic |
| Authentication | JWT and Argon2 |
| Deployment | Docker, Railway-compatible |

## Repository layout

```text
.
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── routers/
│   │   ├── auth.py             # Authentication and current-user routes
│   │   ├── set_info.py         # Upload, extraction, chunking, indexing
│   │   ├── get_info.py         # Retrieval and answers
│   │   └── documents.py        # List and remove uploaded documents
│   └── user_db/                # SQLAlchemy setup and models
├── frontend/
│   └── src/                    # React user interface
├── Dockerfile                  # Backend Docker image
└── requirements.txt
```

## Document support and limits

| Format | Maximum file size | Extraction strategy |
| --- | ---: | --- |
| PDF | 10 MB | Fast (default) or High res |
| DOCX | 5 MB | Auto |
| HTML / HTM | 2 MB | Auto |
| TXT | 2 MB | Auto |
| Markdown | 2 MB | Auto |

Additional limits: **3 files per batch**, **250,000 extracted characters per file**, **90 chunks per file**, 3,000 characters per chunk, and 200-character overlap.

> For non-PDF documents with images, complex tables, or layout-sensitive content, upload a PDF version for better extraction.

## Prerequisites

- Python 3.12+
- Node.js 20+ and npm
- PostgreSQL database
- Chroma Cloud tenant and database
- Google AI API key
- DeepSeek API key
- Tavily API key (optional, only for web-search augmentation)

The backend Docker image installs the operating-system dependencies used for PDF extraction. For local, non-Docker PDF processing, install Tesseract, Poppler, and libmagic on your machine.

## Configuration

Create `backend/.env` (or provide the same variables through your deployment platform):

```env
# Required
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
SECRET_KEY=replace-with-a-long-random-value
GOOGLE_API_KEY=your-google-ai-key
DEEPSEEK_API_KEY=your-deepseek-key
CHROMA_API_KEY=your-chroma-api-key
CHROMA_TENANT=your-chroma-tenant
CHROMA_DATABASE=your-chroma-database

# Optional: enables Gemini's web-search tool
TAVILY_API_KEY=your-tavily-key

# Optional ingestion tuning (defaults shown)
UPLOAD_FILE_CONCURRENCY=2
UPLOAD_SUMMARY_CONCURRENCY=3
UPLOAD_VECTOR_BATCH_SIZE=32
UPLOAD_SUMMARY_RETRIES=3
```

Create `frontend/.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For a deployed frontend, use the public HTTPS URL of the backend. Vite embeds `VITE_*` variables at build time, so rebuild the frontend after changing this value.

## Run locally

### Backend

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

The backend is available at `http://127.0.0.1:8000`.

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`, create an account, upload documents, and select **Chat with Docs**.

## API overview

Protected routes require:

```http
Authorization: Bearer <access_token>
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service response |
| `POST` | `/signup` | Create an account |
| `POST` | `/login` | Receive an access token |
| `GET` | `/users/me/` | Current user profile |
| `POST` | `/set_info` | Create a document upload job |
| `GET` | `/uploads/{job_id}` | Poll per-file upload progress |
| `POST` | `/get_info` | Ask a grounded question |
| `GET` | `/documents` | List the user's uploaded documents |
| `DELETE` | `/documents` | Remove one document's metadata and vectors |

### Upload request

`POST /set_info` uses `multipart/form-data`. Repeat `files`, `categories`, `sections`, and `partition_strategies` in matching order:

```bash
curl -X POST http://127.0.0.1:8000/set_info \
  -H "Authorization: Bearer <access_token>" \
  -F "files=@lecture.pdf" \
  -F "categories=CS3063" \
  -F "sections=Lecture 3" \
  -F "partition_strategies=fast" \
  -F "async_mode=true"
```

Poll `GET /uploads/{job_id}` until the status is `completed`. File stages are `queued`, `extracting`, `chunking`, `enriching`, `indexing`, `complete`, and `failed`.

## Docker and Railway

### Backend

```bash
docker build -t docchat-api .
docker run --env-file backend/.env -p 8080:8080 docchat-api
```

The Docker image honours the platform `PORT` variable and otherwise uses port 8080.

For Railway, deploy three services:

1. **PostgreSQL** — use its provided connection URL as `DATABASE_URL`.
2. **Backend** — deploy this repository with the root `Dockerfile`; add the backend environment variables above.
3. **Frontend** — deploy the `frontend/` directory or its image; set `VITE_API_BASE_URL` to the backend's public domain before building.

Generate public domains for the backend and frontend. Users visit the frontend domain; it calls the backend through `VITE_API_BASE_URL`.

## Production notes

- Set a long, unique `SECRET_KEY` and never commit real `.env` files.
- Restrict CORS to the frontend domain before a public production release; the current development configuration allows all origins.
- Use one backend replica with the current in-process upload worker. A restart marks active upload jobs as failed because temporary uploaded files do not survive container restarts.
- Use managed PostgreSQL backups and protect Chroma/API credentials.
- High-res PDF extraction is CPU and memory intensive. Keep its use limited to PDFs that need table, image, or layout extraction.

## License

No license has been added yet. Add one before distributing or accepting external contributions.
