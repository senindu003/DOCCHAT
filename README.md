# 📚 DocChat

> **Turn a PDF collection into a focused, searchable conversation.**

DocChat is a full-stack, multi-tenant Retrieval-Augmented Generation (RAG) application for asking grounded questions about PDF documents. Its React client lets users upload and organise PDFs by category and section, choose the exact material to focus on, and hold a persistent conversation; its FastAPI service extracts text, tables, and images, builds a private vector collection for each user, and generates helpful answers from the most relevant material.

It is designed especially well for learning materials—lecture notes, course packs, research PDFs, manuals, and technical documentation.

## Why DocChat

- **Chat with your PDFs** using retrieval grounded in the documents you uploaded.
- **Preserve more than plain text**: the ingestion pipeline processes text, tables, and embedded images.
- **Keep knowledge organised** with per-document category and section metadata.
- **Keep user data separated**: every user has an independent Chroma collection and document metadata records.
- **Ask with focus**: narrow retrieval to a category and one or more sections, or search across the user's complete library.
- **Use the web only when appropriate**: Gemini can call a Tavily-powered search tool for current information, requested links, or extra context.
- **Use secure accounts** with Argon2 password hashing and JWT bearer authentication.
- **Read answers beautifully** with Markdown, GitHub-flavoured tables, and LaTeX math rendering.
- **Keep the conversation usable** with remembered chat history, scoped focus controls, response copying, and clear-chat actions.

## How it works

```mermaid
flowchart LR
    A[React web client] --> B[Upload PDFs and add metadata]
    B --> C[FastAPI RAG service]
    C --> D[Extract text, images, and tables]
    D --> E[Chunk and enrich content]
    E --> F[Chroma: per-user vectors]
    E --> G[Postgres: accounts and raw metadata]
    A --> H[Ask question with optional focus]
    H --> C
    C --> F
    C --> I[Gemini: grounded answer]
    I -. "When needed" .-> J[Tavily web search]
    I --> A
```

## Core capabilities

| Capability | What DocChat does |
| --- | --- |
| PDF ingestion | Accepts one or more PDF files in a single request, each labelled with a category and section |
| Document understanding | Uses Unstructured's high-resolution PDF pipeline with table inference and image extraction |
| Chunking | Chunks content by title with overlap to retain context between sections |
| Enrichment | Generates detailed, searchable chunk descriptions through DeepSeek-compatible chat completions |
| Vector retrieval | Uses Gemini embeddings and Chroma MMR or filtered similarity search |
| Focused questions | Retrieves across all documents or limits retrieval to a category and selected sections |
| Web augmentation | Lets Gemini call a Tavily search tool when fresh information or links are explicitly needed |
| Metadata library | Stores extracted text, table HTML, and images with source filename, category, section, and content type |
| Web experience | Provides account screens, protected pages, drag-and-drop uploads, focused chat, persistent history, and rich answer rendering |

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, Vite, React Router, Tailwind CSS, Lucide |
| Rich chat rendering | React Markdown, GFM, KaTeX, Remark Math |
| API | FastAPI, Uvicorn, Pydantic |
| Relational data | SQLAlchemy with PostgreSQL or MySQL |
| Vector database | Chroma Cloud via `langchain-chroma` |
| PDF processing | Unstructured, Tesseract OCR, Poppler, libmagic |
| AI | Google Gemini for embeddings and answers; DeepSeek for ingestion summaries |
| Search | Tavily, available to Gemini as a function tool |
| Authentication | JWT (`PyJWT`) and Argon2 (`pwdlib`) |
| Containerisation | Docker using Python 3.12 slim |

## Project structure

```text
DOCCHAT/                         # Backend repository
├── backend/
│   ├── main.py                  # FastAPI application and router registration
│   ├── routers/
│   │   ├── auth.py              # Sign-up, sign-in, JWT and current-user routes
│   │   ├── set_info.py          # PDF upload, parsing, enrichment, and indexing
│   │   └── get_info.py          # Retrieval, answering, and web-search tool
│   └── user_db/
│       ├── database.py          # SQLAlchemy engine and session dependency
│       └── models.py            # User and extracted-document metadata models
├── Dockerfile                   # API image with OCR and PDF system dependencies
├── .dockerignore
└── requirements.txt

frontend_/                       # Separate frontend repository/service
├── src/
│   ├── components/              # Account, home, upload, and chat pages
│   └── api.js                   # API base URL and auth helpers
├── Dockerfile                   # Builds and serves the Vite app
└── package.json
```

## Quick start

### Prerequisites

- Python 3.12+
- Node.js 20+ and npm (for the frontend)
- A PostgreSQL or MySQL database
- A Chroma Cloud account and database
- API keys for Google Gemini and DeepSeek
- A Tavily API key if web-search augmentation is required

> On local machines, PDF processing also needs Tesseract OCR, Poppler, libmagic, and OpenGL/GLib libraries. The supplied Docker image installs these dependencies for you.

### 1. Clone and configure

```bash
git clone <your-repository-url>
cd DOCCHAT
```

Create `.env` in the repository root:

```env
# Database: choose PostgreSQL or MySQL
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/docchat
# DATABASE_URL=mysql+pymysql://USER:PASSWORD@localhost:3306/docchat

# Authentication
SECRET_KEY=replace-with-a-long-random-secret

# AI services
GOOGLE_API_KEY=your-google-ai-api-key
DEEPSEEK_API_KEY=your-deepseek-api-key
TAVILY_API_KEY=your-tavily-api-key

# Chroma Cloud
CHROMA_API_KEY=your-chroma-api-key
CHROMA_TENANT=your-chroma-tenant
CHROMA_DATABASE=your-chroma-database
```

DocChat normalises standard PostgreSQL URLs to SQLAlchemy's `psycopg2` dialect automatically.

In the separate frontend repository, create `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

For deployment, set this value to the public URL of the DocChat backend service. `VITE_` variables are embedded by Vite during the build, so they must be present when the frontend is built.

### 2. Run locally

Create and activate a virtual environment:

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate
```

Install dependencies and start the API from the repository root:

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. Database tables are created on startup.

### 3. Run the frontend

In a second terminal, from the separate frontend repository:

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Sign up or sign in, upload PDFs with a category and section, then open **Chat with Docs** to begin a document-grounded conversation.

### Frontend experience

- **Protected routes** keep `/home`, `/upload`, and `/chat` behind a login token.
- **Upload portal** accepts multiple PDFs by drag-and-drop or file picker, prevents duplicate filenames, and requires a category and section for each file.
- **Per-file feedback** shows upload state, progress, successful processing, and failures.
- **Focused chat** lets a user select one category and one or more sections before asking questions.
- **Persistent session state** keeps the user, chat messages, and active focus in browser storage.
- **Readable AI answers** render Markdown, tables, lists, and mathematical notation. Quiz-like responses receive enhanced formatting and can be copied.

## API reference

All protected routes require a bearer token:

```http
Authorization: Bearer <access_token>
```

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | No | Basic health/welcome response |
| `POST` | `/signup` | No | Create a user account |
| `POST` | `/login` | No | Receive a JWT access token and the user's metadata map |
| `GET` | `/users/me/` | Yes | Read the current user profile |
| `POST` | `/set_info` | Yes | Upload, process, and index PDF files |
| `POST` | `/get_info` | Yes | Ask a document-grounded question |

### Create an account

`POST /signup`

```json
{
  "username": "ada",
  "firstname": "Ada",
  "lastname": "Lovelace",
  "email": "ada@example.com",
  "password": "use-a-strong-password"
}
```

### Sign in

`POST /login`

```json
{
  "username": "ada",
  "password": "use-a-strong-password"
}
```

The response includes `access_token` and a `user_details.meta_data` object mapping each category to its available sections—ideal for populating a focused-chat interface.

### Upload PDFs

`POST /set_info` uses `multipart/form-data`. Send matching, repeated fields for every uploaded document:

| Form field | Type | Description |
| --- | --- | --- |
| `files` | File (repeatable) | PDF files to process |
| `categories` | Text (repeatable) | Category for the corresponding file, e.g. `CS3063` |
| `sections` | Text (repeatable) | Section for the corresponding file, e.g. `Lecture 3` |

Example:

```bash
curl -X POST http://127.0.0.1:8000/set_info \
  -H "Authorization: Bearer <access_token>" \
  -F "files=@lecture-03.pdf" \
  -F "categories=CS3063" \
  -F "sections=Lecture 3"
```

Only PDFs are accepted. Files are checked by extension and, when available, MIME type; the per-file limit is **100 MB**.

### Ask a question

`POST /get_info`

```json
{
  "query": {
    "query": "Explain the difference between a process and a thread.",
    "history": ""
  },
  "meta_data": {
    "category": "CS3063",
    "sections": ["Lecture 3"]
  }
}
```

Set `category` to an empty string to search the complete document library for the signed-in user. For a focused query, provide both a category and the applicable sections.

## Retrieval and answer behaviour

- **Unfocused search** uses maximal marginal relevance (MMR) to return 10 diverse chunks from the user's private collection.
- **Focused search** filters Chroma results by `category` and `section` before selecting the closest matching chunks.
- The answer model receives the retrieved context and supplied conversation history.
- The assistant is instructed to say it does not know when a question is not supported by the provided context, rather than inventing an answer.
- The assistant may run Tavily web search when current information, examples, extra information, or web links are explicitly needed.

## Docker

### Backend

Build and run the RAG API from the backend repository:

```bash
docker build -t docchat-api .
docker run --env-file .env -p 8080:8080 docchat-api
```

The container installs Tesseract OCR, English language data, Poppler, libmagic, GLib, and OpenGL libraries. It respects a platform-provided `PORT` environment variable and otherwise listens on `8080`.

### Frontend

Build and run the frontend from the separate frontend repository. Pass the public backend URL at build time:

```bash
docker build -t docchat-frontend .
docker run --rm -e VITE_API_BASE_URL=http://host.docker.internal:8080 -p 5173:8080 docchat-frontend
```

The frontend container uses Node 20 Alpine, runs `npm ci`, builds the Vite app at container startup, and serves the resulting single-page application on `PORT` (default `8080`).

## Railway deployment

The Railway deployment is intentionally split into three services:

```mermaid
flowchart LR
    U[Browser] --> F[DOCCHAT-Frontend\nReact/Vite container]
    F -->|VITE_API_BASE_URL| B[DOCCHAT\nFastAPI RAG container]
    B --> P[Postgres\nRailway database]
    B --> C[Chroma Cloud]
    B --> G[Google Gemini]
    B --> D[DeepSeek]
    B -. Optional .-> T[Tavily]
```

1. **Postgres** — create a Railway PostgreSQL service. Copy its connection URL into the backend's `DATABASE_URL` variable.
2. **DOCCHAT** — deploy the backend repository using its Dockerfile. Add `DATABASE_URL`, `SECRET_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `CHROMA_API_KEY`, `CHROMA_TENANT`, and `CHROMA_DATABASE`.
3. **DOCCHAT-Frontend** — deploy the frontend repository using its Dockerfile. Set `VITE_API_BASE_URL` to the generated public URL of the DOCCHAT backend service, then redeploy the frontend so Vite embeds it in the production build.
4. Generate public domains for the backend and frontend services. Users should visit the frontend domain; it calls the backend domain through `VITE_API_BASE_URL`.

> Railway provides `PORT` automatically. Both included Dockerfiles honour it. Keep the browser-facing URL and backend API URL separate; the frontend's value is public configuration, so it must never contain secrets.

## Security and deployment checklist

- [ ] Set a long, unique `SECRET_KEY` and keep all `.env` values out of version control.
- [ ] Configure a managed database with TLS, backups, and least-privilege credentials.
- [ ] Restrict CORS to your frontend domains before production; the current server configuration permits all origins.
- [ ] Set the frontend's `VITE_API_BASE_URL` to the backend's HTTPS public domain and redeploy it after any URL change.
- [ ] Place the API behind HTTPS and use a reverse proxy or platform gateway.
- [ ] Set upload-size and request-time limits at the gateway; high-resolution PDF extraction is resource intensive.
- [ ] Add rate limiting, logging/monitoring, migrations, tests, and background-job processing for production workloads.
- [ ] Review retention and deletion requirements for uploaded educational or sensitive documents.

## Important implementation notes

- A user's Chroma collection is named after their username. Usernames should therefore be treated as stable identifiers.
- The app stores the original extracted elements—text, HTML tables, and base64 image data—in the relational database alongside their source metadata.
- PDF extraction is CPU- and memory-intensive. For larger uploads, queue ingestion work or run it through a background worker to avoid holding a web request open.
- The project currently contains no explicit license file. Add one before offering the project for reuse or contribution.

---

**DocChat makes your document library a conversation—not a scavenger hunt.**
