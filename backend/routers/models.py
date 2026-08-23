from pydantic import BaseModel, ConfigDict, Field, field_validator
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


class SignupRequest(BaseModel):
    """Validated payload for creating a DocChat account.

    Usernames are also used as Chroma collection names, so they must use the
    portable character set accepted by both PostgreSQL and Chroma.
    """

    model_config = ConfigDict(extra="forbid")

    username: str = Field(
        ...,
        min_length=3,
        max_length=50,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]*[A-Za-z0-9]$",
        description="3-50 characters; use letters, numbers, dots, hyphens, or underscores.",
    )
    firstname: str = Field(..., min_length=1, max_length=255)
    lastname: str = Field(..., min_length=1, max_length=255)
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_must_not_have_repeated_dots(cls, value: str) -> str:
        if ".." in value:
            raise ValueError("Username cannot contain consecutive dots.")
        return value

    @field_validator("password")
    @classmethod
    def password_must_not_contain_control_characters(cls, value: str) -> str:
        if any(not char.isprintable() for char in value):
            raise ValueError("Password cannot contain control or non-printable characters.")
        return value


class Query(BaseModel):
    query: str = Field(...)
    history: str = ""


class Focus(BaseModel):
    category: str = ""
    sections: List[str] = []
