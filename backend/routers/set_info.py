import os
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import BoundedSemaphore, Lock, local
from time import sleep
from typing import Annotated, Callable, List
from fastapi import BackgroundTasks, HTTPException, status, APIRouter, File, UploadFile, Depends, Form
from fastapi.responses import JSONResponse
from routers.models import User
from routers.auth import get_current_active_user
from uuid import uuid4
import zipfile
from openai import OpenAI
from user_db.database import SessionLocal, get_db
from user_db.models import MetaData, UserData
from user_db.models import UploadJob, UploadJobFile
from sqlalchemy.orm import Session
import magic


# Unstructured for document parsing
from unstructured.partition.pdf import partition_pdf
from unstructured.chunking.title import chunk_by_title

# LangChain components
from langchain_core.documents import Document
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.messages import HumanMessage
from dotenv import load_dotenv

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
_deepseek_clients = local()


def _positive_int_env(name: str, default: int) -> int:
    try:
        return max(1, int(os.getenv(name, default)))
    except ValueError:
        return default


# Defaults are deliberately conservative for Railway's limited CPU and memory.
FILE_WORKERS = _positive_int_env("UPLOAD_FILE_CONCURRENCY", 2)
SUMMARY_WORKERS = _positive_int_env("UPLOAD_SUMMARY_CONCURRENCY", 3)
VECTOR_BATCH_SIZE = _positive_int_env("UPLOAD_VECTOR_BATCH_SIZE", 32)
SUMMARY_RETRIES = _positive_int_env("UPLOAD_SUMMARY_RETRIES", 3)
LLM_SEMAPHORE = BoundedSemaphore(SUMMARY_WORKERS)
_vector_locks: dict[str, Lock] = {}
_vector_locks_guard = Lock()


def _deepseek_client() -> OpenAI:
    """Keep one HTTP client per worker thread without requiring a key at import time."""
    if not hasattr(_deepseek_clients, "client"):
        _deepseek_clients.client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
    return _deepseek_clients.client


def _is_retryable_enrichment_error(error: Exception) -> bool:
    message = str(error).lower()
    return any(marker in message for marker in ("429", "rate limit", "timeout", "timed out", "connection", "500", "502", "503", "504"))

set_info_router = APIRouter()

def seperate_content_data(chunk):
  content_data = {"text":[], "images":[], "tables": []}
  for element in chunk.metadata.orig_elements:
    content_data["text"].append(element.text)
    if element.category == "Image":
      content_data["images"].append(element.metadata.image_base64)
    elif element.category == "Table":
      content_data["tables"].append(element.metadata.text_as_html)
    else:
      pass
  return content_data


def create_ai_enhanced_summary_gemini(text: list[str], images: list[str], tables: list[str]):
    try:
        # Set safety filters to 'BLOCK_NONE' to ensure technical content isn't flagged
        safety_settings = {
    "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
    "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
    "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
    "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
}

        llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            api_key=GOOGLE_API_KEY,
            temperature=0.7, # Lowered slightly for more consistent summaries
            safety_settings=safety_settings
        )

        # Clean text to ensure it's not just whitespace
        cleaned_text = " ".join([t.strip() for t in text if t.strip()])
        if not cleaned_text and not images and not tables:
            return "Empty Chunk: No extractable content found."

        instruction = "Generate a detailed, searchable description for this document segment. "
        message_content = [{"type": "text", "text": f"{instruction}\n\nCONTENT: {cleaned_text}"}]

        if tables:
            message_content.append({"type": "text", "text": f"TABLE DATA: {' '.join(tables)}"})

        if images:
            for img in images:
                # Clean base64 string (remove any potential newlines)
                img_data = img.replace("\n", "").strip()
                message_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}
                })

        message = HumanMessage(content=message_content)
        response = llm.invoke([message])
        
        # Guard against the API returning a blank response object
        if not response.content:
            return f"Summary generation failed for text: {cleaned_text[:50]}..."
            
        return response.content

    except Exception as e:
        print(f"!!! Error in LLM call: {e}")
        return f"Error occurred during processing: {str(e)}"
    

def create_ai_enhanced_summary_with_deepseek(text: list[str], images: list[str], tables: list[str], image_descriptions: list[str] = None):
    try:
        # Clean text
        cleaned_text = " ".join([t.strip() for t in text if t.strip()])
        
        if not cleaned_text and not images and not tables:
            return "Empty Chunk: No extractable content found."

        # Build comprehensive prompt
        prompt = """Generate a detailed, searchable, informative description covering every part for this document segment.
                    Consider all the following content:"""

        if cleaned_text:
            prompt += f"\n\nTEXT CONTENT:\n{cleaned_text}"

        if tables:
            tables_text = "\n".join([f"- {table}" for table in tables])
            prompt += f"\n\nTABLE DATA:\n{tables_text}"

        if images and image_descriptions:
            # Add actual image descriptions if available
            image_info = []
            for i, desc in enumerate(image_descriptions):
                image_info.append(f"Image {i+1}: {desc}")
            prompt += f"\n\nIMAGE DESCRIPTIONS:\n" + "\n".join(image_info)
        elif images:
            # Just mention images exist
            prompt += f"\n\nIMAGES: This segment contains {len(images)} image(s) relevant to the content."

        prompt += "\n\nPlease provide a comprehensive summary that integrates information from all these sources."

        response = _deepseek_client().chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": "You synthesize information from multiple sources (text, tables, images) into coherent, detailed summaries."},
                {"role": "user", "content": prompt},
            ],
            stream=False,
            temperature=0.7
        )
        
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content
        else:
            return f"Summary generation failed for text: {cleaned_text[:50]}..."
            
    except Exception as e:
        print(f"!!! Error in LLM call: {e}")
        return f"Error occurred during processing: {str(e)}"

    


def _summarize_chunk(chunk, user: str, category: str, section: str):
    """Build one document. Calls are globally bounded to protect the LLM quota."""
    content_data = seperate_content_data(chunk)
    last_error = None
    for attempt in range(SUMMARY_RETRIES):
        try:
            with LLM_SEMAPHORE:
                summary = create_ai_enhanced_summary_with_deepseek(
                    content_data["text"], content_data["images"], content_data["tables"]
                )
            if str(summary).startswith(("Error occurred during processing:", "Summary generation failed")):
                raise RuntimeError(str(summary))
            doc_id = str(uuid4())
            return (
                Document(
                    page_content=str(summary),
                    metadata={"username": user, "doc_id": doc_id, "category": category, "section": section},
                ),
                {
                    "doc_id": doc_id,
                    "username": user,
                    "raw_text": content_data["text"],
                    "text_as_html": content_data["tables"],
                    "image_base64": content_data["images"],
                },
            )
        except Exception as exc:
            last_error = exc
            if attempt < SUMMARY_RETRIES - 1 and _is_retryable_enrichment_error(exc):
                sleep(2 ** attempt)
            else:
                break
    raise RuntimeError(f"Unable to enrich a document chunk after {SUMMARY_RETRIES} attempts: {last_error}")


def create_langchain_docs(
    chunks,
    user: str,
    category: str,
    section: str,
    progress_callback: Callable[[int, int], None] | None = None,
):
    """Enrich independent chunks in parallel while preserving their source order."""
    if not chunks:
        return [], []

    completed = 0
    results = [None] * len(chunks)
    workers = min(SUMMARY_WORKERS, len(chunks))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="chunk-summary") as executor:
        futures = {
            executor.submit(_summarize_chunk, chunk, user, category, section): index
            for index, chunk in enumerate(chunks)
        }
        for future in as_completed(futures):
            index = futures[future]
            results[index] = future.result()
            completed += 1
            if progress_callback:
                progress_callback(completed, len(chunks))

    langchain_docs = [result[0] for result in results]
    original_contents = [result[1] for result in results]
    return langchain_docs, original_contents

def create_vector_store(langchain_docs, persist_directory, progress_callback: Callable[[int, int], None] | None = None):
  embedding_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", api_key=GOOGLE_API_KEY, task_type="RETRIEVAL_DOCUMENT")
  vector_store = Chroma(
    collection_name=persist_directory,
    embedding_function=embedding_model,
    chroma_cloud_api_key=os.getenv("CHROMA_API_KEY"),
    tenant=os.getenv("CHROMA_TENANT"),
    database=os.getenv("CHROMA_DATABASE"),
)
  doc_ids = [langchain_doc.metadata["doc_id"] for langchain_doc in langchain_docs]
  for start in range(0, len(langchain_docs), VECTOR_BATCH_SIZE):
    documents = langchain_docs[start : start + VECTOR_BATCH_SIZE]
    ids = doc_ids[start : start + VECTOR_BATCH_SIZE]
    vector_store.add_documents(documents=documents, ids=ids)
    if progress_callback:
      progress_callback(min(start + len(documents), len(langchain_docs)), len(langchain_docs))
  return vector_store, doc_ids



def create_my_rag(file, persist_directory, filename, category, section, progress_callback=None):
    elements = partition_pdf(file=file, strategy="hi_res", infer_table_structure=True, extract_image_block_types=["image"], extract_image_block_to_payload=True)
    chunks = chunk_by_title(elements, max_characters=2500, overlap=250, new_after_n_chars=2000, include_orig_elements=True)
    langchain_docs, original_contents = create_langchain_docs(
        chunks,
        user=persist_directory,
        category=category,
        section=section,
        progress_callback=progress_callback,
    )
    return langchain_docs, original_contents
    

set_info_router = APIRouter()

# Allowed file types
ALLOWED_EXTENSIONS = {'.pdf'}
ALLOWED_MIME_TYPES = {
    'application/pdf',
}

def validate_file(file: UploadFile) -> bool:
    """Validate PDF file type and size"""
    # Check file extension
    filename = file.filename.lower()
    
    if not filename.endswith('.pdf'):
        return False
    
    # Check MIME type
    try:
        # Read first 2048 bytes for MIME detection
        content = file.file.read(2048)
        file.file.seek(0)  # Reset file pointer
        
        mime_type = magic.from_buffer(content, mime=True)
        if mime_type != 'application/pdf':
            return False
    except:
        # If MIME detection fails, rely on extension
        pass
    
    # Check file size (max 100MB)
    file.file.seek(0, 2)  # Seek to end
    file_size = file.file.tell()
    file.file.seek(0)  # Reset to beginning
    
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    if file_size > MAX_FILE_SIZE:
        return False
    
    return True

def _vector_lock_for(username: str) -> Lock:
    with _vector_locks_guard:
        return _vector_locks.setdefault(username, Lock())


def _metadata_rows(contents: list[dict], category: str, section: str, filename: str) -> list[MetaData]:
    rows = []
    for content in contents:
        for text in content.get("raw_text", []):
            rows.append(MetaData(doc_id=content["doc_id"], username=content["username"], element_id=str(uuid4()), element=text, category=category, section=section, source_filename=filename, content_type="text"))
        for table in content.get("text_as_html", []):
            rows.append(MetaData(doc_id=content["doc_id"], username=content["username"], element_id=str(uuid4()), element=table, category=category, section=section, source_filename=filename, content_type="html"))
        for image in content.get("image_base64", []):
            rows.append(MetaData(doc_id=content["doc_id"], username=content["username"], element_id=str(uuid4()), element=image, category=category, section=section, source_filename=filename, content_type="image"))
    return rows


def _set_job_file_state(job_file_id: str, **changes) -> None:
    db = SessionLocal()
    try:
        record = db.get(UploadJobFile, job_file_id)
        if record:
            for key, value in changes.items():
                setattr(record, key, value)
            db.commit()
    finally:
        db.close()


def process_single_file(file_path: str, job_file_id: str, username: str, category: str, section: str, filename: str):
    """Process one file with its own DB session; safe to call from a worker thread."""
    db = SessionLocal()
    vector_store = None
    doc_ids = []
    try:
        _set_job_file_state(job_file_id, status="processing", stage="extracting", progress=10)
        with open(file_path, "rb") as file_content:
            elements = partition_pdf(file=file_content, strategy="hi_res", infer_table_structure=True, extract_image_block_types=["image"], extract_image_block_to_payload=True)

        _set_job_file_state(job_file_id, stage="chunking", progress=25)
        chunks = chunk_by_title(elements, max_characters=2500, overlap=250, new_after_n_chars=2000, include_orig_elements=True)
        if not chunks:
            raise RuntimeError("No extractable content was found in this PDF.")

        def summary_progress(completed: int, total: int) -> None:
            # Persist roughly twenty progress updates per file, not one database transaction per chunk.
            update_every = max(1, total // 20)
            if completed not in (1, total) and completed % update_every:
                return
            _set_job_file_state(
                job_file_id,
                stage="enriching",
                progress=30 + int((completed / total) * 50),
                chunks_total=total,
                chunks_completed=completed,
            )

        langchain_docs, original_contents = create_langchain_docs(
            chunks, username, category, section, progress_callback=summary_progress
        )
        _set_job_file_state(job_file_id, stage="indexing", progress=82)

        # Chroma writes for a user collection are serialized. Extraction and LLM work remain parallel.
        with _vector_lock_for(username):
            def index_progress(completed: int, total: int) -> None:
                _set_job_file_state(job_file_id, stage="indexing", progress=82 + int((completed / total) * 13))

            vector_store, doc_ids = create_vector_store(langchain_docs, username, index_progress)
            db.add_all(_metadata_rows(original_contents, category, section, filename))
            db.commit()

        _set_job_file_state(job_file_id, status="processed", stage="complete", progress=100)
    except Exception as exc:
        db.rollback()
        if vector_store and doc_ids:
            try:
                vector_store.delete(ids=doc_ids)
            except Exception:
                # The original error is more useful; report it while avoiding a second failure.
                pass
        _set_job_file_state(job_file_id, status="failed", stage="failed", error=str(exc), progress=100)
    finally:
        db.close()
        try:
            os.unlink(file_path)
        except FileNotFoundError:
            pass

# REMOVE or COMMENT OUT the process_zip_file function since we're PDF-only
# def process_zip_file(zip_content: BytesIO, username: str, category: str, section: str, db: Session):
#     """Process a zip file containing multiple documents"""
#     try:
#         with zipfile.ZipFile(zip_content) as zip_ref:
#             results = []
            
#             for zip_info in zip_ref.infolist():
#                 if not zip_info.is_dir():
#                     try:
#                         extracted_file = zip_ref.read(zip_info.filename)
#                         extracted_file_io = BytesIO(extracted_file)
                        
#                         # Check if file in zip is valid
#                         filename_lower = zip_info.filename.lower()
#                         if any(filename_lower.endswith(ext) for ext in ALLOWED_EXTENSIONS if ext != '.zip'):
#                             original_contents = create_my_rag(
#                                 extracted_file_io,
#                                 persist_directory=username,
#                                 filename=zip_info.filename,
#                                 category=category,
#                                 section=section
#                             )
                            
#                             for content in original_contents:
#                                 store_content_in_db(content, db, category, section, zip_info.filename)
                            
#                             results.append({
#                                 "filename": zip_info.filename,
#                                 "status": "processed"
#                             })
#                         else:
#                             results.append({
#                                 "filename": zip_info.filename,
#                                 "status": "skipped",
#                                 "error": "File type not allowed"
#                             })
#                     except Exception as e:
#                         results.append({
#                             "filename": zip_info.filename,
#                             "status": "failed",
#                             "error": str(e)
#                         })
            
#             return True, results
#     except zipfile.BadZipFile:
#         return False, [{"error": "Invalid zip file"}]
#     except Exception as e:
#         return False, [{"error": str(e)}]


def _job_payload(job: UploadJob, db: Session, include_user_details: bool = False) -> dict:
    files = db.query(UploadJobFile).filter(UploadJobFile.job_id == job.id).order_by(UploadJobFile.created_at).all()
    results = [
        {
            "id": item.id,
            "filename": item.filename,
            "status": item.status,
            "stage": item.stage,
            "progress": item.progress,
            "chunks_total": item.chunks_total,
            "chunks_completed": item.chunks_completed,
            "error": item.error,
        }
        for item in files
    ]
    payload = {
        "job_id": job.id,
        "status": job.status,
        "total_files": job.total_files,
        "successful": sum(item["status"] == "processed" for item in results),
        "failed": sum(item["status"] == "failed" for item in results),
        "results": results,
    }
    if include_user_details:
        user = db.get(UserData, job.username)
        db_results = db.query(MetaData).with_entities(MetaData.category, MetaData.section).filter(MetaData.username == job.username).distinct().all()
        metadata = {}
        for category, section in db_results:
            metadata.setdefault(category, []).append(section)
        payload["user_details"] = {
            "username": user.username,
            "email": user.email,
            "firstname": user.firstname,
            "lastname": user.lastname,
            "disabled": user.disabled,
            "meta_data": metadata,
        }
    return payload


def process_upload_job(job_id: str, username: str, work_items: list[dict]) -> None:
    """Run a persisted upload job. All worker state is written to PostgreSQL."""
    db = SessionLocal()
    try:
        job = db.get(UploadJob, job_id)
        if not job:
            return
        job.status = "processing"
        db.commit()
    finally:
        db.close()

    try:
        with ThreadPoolExecutor(max_workers=min(FILE_WORKERS, len(work_items)), thread_name_prefix="pdf-ingest") as executor:
            futures = [
                executor.submit(
                    process_single_file,
                    item["path"],
                    item["job_file_id"],
                    username,
                    item["category"],
                    item["section"],
                    item["filename"],
                )
                for item in work_items
            ]
            for future in as_completed(futures):
                # Individual workers record their own error so one bad PDF never aborts the job.
                future.result()
    except Exception as exc:
        db = SessionLocal()
        try:
            job = db.get(UploadJob, job_id)
            if job:
                job.status = "failed"
                db.commit()
        finally:
            db.close()
        return

    db = SessionLocal()
    try:
        job = db.get(UploadJob, job_id)
        if job:
            completed = db.query(UploadJobFile).filter(
                UploadJobFile.job_id == job_id,
                UploadJobFile.status.in_(("processed", "failed")),
            ).count()
            job.completed_files = completed
            job.status = "completed"
            db.commit()
    finally:
        db.close()


async def _save_upload_to_tempfile(file: UploadFile) -> str:
    suffix = Path(file.filename or "upload.pdf").suffix or ".pdf"
    with NamedTemporaryFile(delete=False, suffix=suffix) as destination:
        while chunk := await file.read(1024 * 1024):
            destination.write(chunk)
        return destination.name


@set_info_router.post("/set_info")
async def set_info(
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_active_user)],
    files: List[UploadFile] = File(...),
    categories: List[str] = Form(...),
    sections: List[str] = Form(...),
    async_mode: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Create a persisted upload job. Set ``async_mode=true`` for live progress polling."""
    if len(files) != len(categories) or len(files) != len(sections):
        raise HTTPException(status_code=400, detail="Number of files, categories, and sections must match")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    invalid = [
        file.filename
        for file, category, section in zip(files, categories, sections)
        if not category.strip() or not section.strip() or not validate_file(file)
    ]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Each upload must be a PDF with a category and section: {', '.join(invalid)}")

    job_id = str(uuid4())
    job = UploadJob(id=job_id, username=current_user.username, status="queued", total_files=len(files))
    db.add(job)
    work_items = []
    try:
        for file, category, section in zip(files, categories, sections):
            job_file = UploadJobFile(
                id=str(uuid4()), job_id=job_id, filename=file.filename, category=category.strip(), section=section.strip()
            )
            db.add(job_file)
            path = await _save_upload_to_tempfile(file)
            work_items.append({"path": path, "job_file_id": job_file.id, "filename": file.filename, "category": category.strip(), "section": section.strip()})
    except Exception:
        db.rollback()
        for item in work_items:
            try:
                os.unlink(item["path"])
            except FileNotFoundError:
                pass
        raise HTTPException(status_code=500, detail="Unable to save uploads for processing")
    db.commit()

    if async_mode:
        background_tasks.add_task(process_upload_job, job_id, current_user.username, work_items)
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=_job_payload(job, db))

    process_upload_job(job_id, current_user.username, work_items)
    db.expire_all()
    result = _job_payload(db.get(UploadJob, job_id), db, include_user_details=True)
    return {
        "message": f"Processed {result['successful']} out of {result['total_files']} PDF files",
        **result,
    }


@set_info_router.get("/uploads/{job_id}")
async def get_upload_progress(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    job = db.get(UploadJob, job_id)
    if not job or job.username != current_user.username:
        raise HTTPException(status_code=404, detail="Upload job not found")
    return _job_payload(job, db, include_user_details=job.status in ("completed", "failed"))
