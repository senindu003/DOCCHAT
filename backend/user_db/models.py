from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Index, DateTime, func, Text
from sqlalchemy.orm import relationship
from user_db.database import Base
from sqlalchemy.dialects.mysql import LONGTEXT


class UserData(Base):
  __tablename__ = "users"

  username = Column(String(255), primary_key=True, index=True)
  firstname = Column(String(255), index=True, nullable=False)
  lastname = Column(String(255), index=True, nullable=False)
  email = Column(String(255), unique=True, index=True, nullable=False)
  hashed_password = Column(String(255), nullable=False)
  disabled = Column(Boolean, nullable=False, default=False)

  meta = relationship("MetaData", back_populates="user")
  


class MetaData(Base):
    __tablename__ = "metadata"
    
    # Primary key and basic fields
    doc_id = Column(String(255), primary_key=True, index=True)  # From create_my_rag output
    username = Column(String(255), ForeignKey("users.username"), primary_key=True, index=True)  # User who uploaded
    element_id = Column(String(255), primary_key=True, index=True)  # UUID for each element
    element = Column(Text)  # The actual content (text, HTML, or base64 image)
    
    # New metadata fields (from your upload form)
    category = Column(String(255), nullable=False, index=True)  # e.g., "CS3063"
    section = Column(String(255), nullable=False, index=True)   # e.g., "Lecture 3"
    source_filename = Column(String(500), nullable=False)      # Original PDF filename
    content_type = Column(String(50), nullable=False)          # "text", "html", or "image"
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    user = relationship("UserData", back_populates="meta")
    
    