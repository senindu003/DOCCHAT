import json
import os
from io import BytesIO
from typing import List, Annotated
from fastapi import HTTPException, status, APIRouter, File, UploadFile, Depends, Form
from fastapi.responses import StreamingResponse
from routers.models import User
from routers.auth import get_current_active_user
from uuid import uuid4
import zipfile
from openai import OpenAI
from user_db.database import get_db
from user_db.models import MetaData
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
        client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")

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

        response = client.chat.completions.create(
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

    


def create_langchain_docs(chunks, user: str, category: str, section: str):
    langchain_docs = []
    original_contents = []
    for i, chunk in enumerate(chunks):
        doc_id = str(uuid4())
        content_data = seperate_content_data(chunk)
        summary = create_ai_enhanced_summary_with_deepseek(content_data["text"], content_data["images"], content_data["tables"])
        print("*"*50)
        print(f"summary of chunk {i}")
        print("*"*50)
        print(summary)
        original_contents.append({"doc_id": doc_id, "username": user, "raw_text": content_data["text"],  "text_as_html": content_data["tables"], "image_base64": content_data["images"]})
        langchain_docs.append(Document(page_content=str(summary), metadata={"username": user, "doc_id": doc_id, "category": category, "section": section}))
    return langchain_docs, original_contents

def create_vector_store(langchain_docs, persist_directory):
  embedding_model = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001", api_key=GOOGLE_API_KEY, task_type="RETRIEVAL_DOCUMENT")
  vector_store = Chroma(
    collection_name=persist_directory,
    embedding_function=embedding_model,
    chroma_cloud_api_key=os.getenv("CHROMA_API_KEY"),
    tenant=os.getenv("CHROMA_TENANT"),
    database=os.getenv("CHROMA_DATABASE"),
)
  doc_ids = [langchain_doc.metadata["doc_id"] for langchain_doc in langchain_docs]
  vector_store.add_documents(documents=langchain_docs, ids=doc_ids)



def create_my_rag(file, persist_directory, filename, category, section):
    elements = partition_pdf(file=file, strategy="hi_res", infer_table_structure=True, extract_image_block_types=["image"], extract_image_block_to_payload=True)
    chunks = chunk_by_title(elements, max_characters=2500, overlap=250, new_after_n_chars=2000, include_orig_elements=True)
    langchain_docs, original_contents = create_langchain_docs(chunks, user=persist_directory, category=category, section=section)
    create_vector_store(langchain_docs=langchain_docs, persist_directory=persist_directory)
    return original_contents
    

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

def process_single_file(file_content: BytesIO, filename: str, username: str, category: str, section: str, db: Session):
    """Process a single PDF file"""
    try:
        original_contents = create_my_rag(
            file_content, 
            persist_directory=username,
            filename=filename,
            category=category,
            section=section
            # Note: Remove filename, category, section params if create_my_rag doesn't accept them
        )
        
        for content in original_contents:
            store_content_in_db(content, db, category, section, filename)
        
        return True, None
    except Exception as e:
        return False, str(e)

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

def store_content_in_db(content: dict, db: Session, category: str, section: str, filename: str):
    """Store extracted content in database with metadata"""
    if content.get("raw_text"):
        for text in content["raw_text"]:
            metaDataObj = MetaData(
                doc_id=content["doc_id"],
                username=content["username"],
                element_id=str(uuid4()),
                element=text,
                category=category,
                section=section,
                source_filename=filename,
                content_type="text"
            )
            db.add(metaDataObj)
        db.commit()
    
    if content.get("text_as_html"):
        for table in content["text_as_html"]:
            metaDataObj = MetaData(
                doc_id=content["doc_id"],
                username=content["username"],
                element_id=str(uuid4()),
                element=table,
                category=category,
                section=section,
                source_filename=filename,
                content_type="html"
            )
            db.add(metaDataObj)
        db.commit()
    
    if content.get("image_base64"):
        for image in content["image_base64"]:
            metaDataObj = MetaData(
                doc_id=content["doc_id"],
                username=content["username"],
                element_id=str(uuid4()),
                element=image,
                category=category,
                section=section,
                source_filename=filename,
                content_type="image"
            )
            db.add(metaDataObj)
        db.commit()

@set_info_router.post("/set_info")
async def set_info(
    current_user: Annotated[User, Depends(get_current_active_user)],
    files: List[UploadFile] = File(...),
    categories: List[str] = Form(...),
    sections: List[str] = Form(...),
    db: Session = Depends(get_db)
): 
    """
    Upload and process multiple PDF files with metadata for RAG system
    """
    
    # Validate input lengths
    if len(files) != len(categories) != len(sections):
        raise HTTPException(
            status_code=400, 
            detail="Number of files, categories, and sections must match"
        )
    
    if len(files) == 0:
        raise HTTPException(
            status_code=400,
            detail="No files provided"
        )
    
    results = []
    processed_count = 0
    
    for file, category, section in zip(files, categories, sections):
        try:
            # Validate required fields
            if not category.strip() or not section.strip():
                results.append({
                    "filename": file.filename,
                    "status": "failed",
                    "error": "Category and section are required"
                })
                continue
            
            # Validate file type (PDF only)
            if not validate_file(file):
                results.append({
                    "filename": file.filename,
                    "status": "failed",
                    "error": "Only PDF files are allowed"
                })
                continue
            
            # Read file content
            contents = await file.read()
            file_like = BytesIO(contents)
            
            # Process PDF file (no zip check - PDFs only)
            success, error = process_single_file(
                file_like,
                file.filename,
                current_user.username,
                category.strip(),
                section.strip(),
                db
            )
            
            if success:
                processed_count += 1
                results.append({
                    "filename": file.filename,
                    "status": "processed",
                    "message": "PDF processed successfully"
                })
            else:
                results.append({
                    "filename": file.filename,
                    "status": "failed",
                    "error": error or "Failed to process PDF file"
                })
            
        except Exception as e:
            results.append({
                "filename": file.filename,
                "status": "failed",
                "error": f"Internal server error: {str(e)}"
            })
    
    # Calculate statistics
    successful_files = [r for r in results if r["status"] == "processed"]
    failed_files = [r for r in results if r["status"] == "failed"]

    db_results = db.query(MetaData).with_entities(MetaData.username, MetaData.category, MetaData.section).filter(MetaData.username == current_user.username).distinct().all()
    user_meta_data = {}
    for result in db_results:
        if user_meta_data.get(result.category):
            user_meta_data[result.category].append(result.section)
        else:
            user_meta_data[result.category] = [result.section]
    print({
        "message": f"Processed {processed_count} out of {len(files)} PDF files",
        "total_files": len(files),
        "successful": len(successful_files),
        "failed": len(failed_files),
        "results": results,
        "user_details": {"username":current_user.username, "email":current_user.email, "firstname":current_user.firstname, "lastname":current_user.lastname, "disabled":current_user.disabled, "meta_data":user_meta_data},
    })
    return {
        "message": f"Processed {processed_count} out of {len(files)} PDF files",
        "total_files": len(files),
        "successful": len(successful_files),
        "failed": len(failed_files),
        "results": results,
        "user_details": {"username":current_user.username, "email":current_user.email, "firstname":current_user.firstname, "lastname":current_user.lastname, "disabled":current_user.disabled, "meta_data":user_meta_data},
    }