import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_chroma import Chroma
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from routers.auth import get_current_active_user
from routers.models import User
from user_db.database import get_db
from user_db.models import MetaData, UploadJob, UploadJobFile, UserData


documents_router = APIRouter()


class RemoveDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(..., min_length=1, max_length=500)
    category: str = Field(..., min_length=1, max_length=255)
    section: str = Field(..., min_length=1, max_length=255)


def _user_details(username: str, db: Session) -> dict:
    user = db.get(UserData, username)
    db_results = (
        db.query(MetaData.category, MetaData.section)
        .filter(MetaData.username == username)
        .distinct()
        .all()
    )
    metadata = {}
    for category, section in db_results:
        metadata.setdefault(category, []).append(section)

    return {
        "username": user.username,
        "email": user.email,
        "firstname": user.firstname,
        "lastname": user.lastname,
        "disabled": user.disabled,
        "meta_data": metadata,
    }


def _user_vector_store(username: str) -> Chroma:
    return Chroma(
        collection_name=username,
        chroma_cloud_api_key=os.getenv("CHROMA_API_KEY"),
        tenant=os.getenv("CHROMA_TENANT"),
        database=os.getenv("CHROMA_DATABASE"),
    )


@documents_router.get("/documents")
async def list_documents(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    rows = (
        db.query(
            MetaData.source_filename,
            MetaData.category,
            MetaData.section,
            func.count(distinct(MetaData.doc_id)).label("chunk_count"),
            func.count(MetaData.element_id).label("metadata_count"),
            func.min(MetaData.created_at).label("uploaded_at"),
        )
        .filter(MetaData.username == current_user.username)
        .group_by(MetaData.source_filename, MetaData.category, MetaData.section)
        .order_by(func.min(MetaData.created_at).desc())
        .all()
    )

    return {
        "documents": [
            {
                "filename": row.source_filename,
                "category": row.category,
                "section": row.section,
                "chunk_count": int(row.chunk_count or 0),
                "metadata_count": int(row.metadata_count or 0),
                "uploaded_at": row.uploaded_at.isoformat() if row.uploaded_at else None,
            }
            for row in rows
        ],
        "user_details": _user_details(current_user.username, db),
    }


@documents_router.delete("/documents")
async def remove_document(
    payload: RemoveDocumentRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Session = Depends(get_db),
):
    matching_rows = (
        db.query(MetaData)
        .filter(
            MetaData.username == current_user.username,
            MetaData.source_filename == payload.filename,
            MetaData.category == payload.category,
            MetaData.section == payload.section,
        )
        .all()
    )
    if not matching_rows:
        raise HTTPException(status_code=404, detail="Document was not found for this user.")

    doc_ids = sorted({row.doc_id for row in matching_rows})
    metadata_count = len(matching_rows)

    try:
        _user_vector_store(current_user.username).delete(ids=doc_ids)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not remove document vectors from Chroma: {exc}",
        ) from exc

    try:
        deleted_metadata = (
            db.query(MetaData)
            .filter(
                MetaData.username == current_user.username,
                MetaData.source_filename == payload.filename,
                MetaData.category == payload.category,
                MetaData.section == payload.section,
                MetaData.doc_id.in_(doc_ids),
            )
            .delete(synchronize_session=False)
        )

        job_ids = db.query(UploadJob.id).filter(UploadJob.username == current_user.username)
        db.query(UploadJobFile).filter(
            UploadJobFile.job_id.in_(job_ids),
            UploadJobFile.filename == payload.filename,
            UploadJobFile.category == payload.category,
            UploadJobFile.section == payload.section,
        ).delete(synchronize_session=False)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Document removed successfully.",
        "filename": payload.filename,
        "category": payload.category,
        "section": payload.section,
        "deleted_chunks": len(doc_ids),
        "deleted_metadata_rows": deleted_metadata or metadata_count,
        "user_details": _user_details(current_user.username, db),
    }
