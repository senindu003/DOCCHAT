from pydantic import BaseModel, Field
from typing import List, Optional


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class User(BaseModel):
    username: str = Field(...)
    email: str = Field(...)
    firstname: str = Field(...)
    lastname: str = Field(...)
    disabled: bool = False


class UserInDB(User):
    hashed_password: str = Field(...)


class Query(BaseModel):
    query: str = Field(...)
    history: str = ""


class Focus(BaseModel):
    category: str = ""
    sections: List[str] = []