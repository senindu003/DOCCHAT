from datetime import datetime, timedelta, timezone
from typing import Annotated
import os
from dotenv import load_dotenv
from routers.models import Token, TokenData, User, UserInDB, SignupRequest
import jwt
from fastapi import Depends, APIRouter, HTTPException, status, Body
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from user_db.database import get_db
from user_db.models import UserData, MetaData
from sqlalchemy.orm import Session
from sqlalchemy import or_

load_dotenv()

# to get a string like this run:
# openssl rand -hex 32
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60*24


password_hash = PasswordHash.recommended()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

auth_router = APIRouter()

def verify_password(plain_password, hashed_password):
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password):
    return password_hash.hash(password)


def get_user(db, username: str):
    existing_user = db.query(UserData).filter(or_(UserData.email == username, UserData.username == username)).first()
    if existing_user:
        return UserInDB(**existing_user.__dict__)


def authenticate_user(db, username: str, password: str):
    user = get_user(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Annotated[Session, Depends(get_db)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except InvalidTokenError:
        raise credentials_exception
    user = get_user(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user


@auth_router.post("/login")
async def login_for_access_token(
    db: Annotated[Session, Depends(get_db)],
    payload: dict = Body(...),
) -> dict:
    user = authenticate_user(db, payload["username"], payload["password"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    results = db.query(MetaData).with_entities(MetaData.username, MetaData.category, MetaData.section).filter(MetaData.username == user.username).distinct().all()
    user_meta_data = {}
    for result in results:
        if user_meta_data.get(result.category):
            user_meta_data[result.category].append(result.section)
        else:
            user_meta_data[result.category] = [result.section]
    print(user_meta_data)
    return {"message": "Login successful", "access_token": access_token, "user_details": {"username":user.username, "email":user.email, "firstname":user.firstname, "lastname":user.lastname, "disabled":user.disabled, "meta_data":user_meta_data}}


@auth_router.post("/signup")
async def signup_user(
    db: Annotated[Session, Depends(get_db)],
    payload: SignupRequest,
) -> dict:
    user_by_username = db.query(UserData).filter(UserData.username == payload.username).first()
    user_by_email = db.query(UserData).filter(UserData.email == payload.email).first()
    user = user_by_username or user_by_email
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists",
            headers={"WWW-Authenticate": "Bearer"},
        )
    hashed_password = get_password_hash(payload.password)
    new_user = UserData(
        username=payload.username,
        firstname=payload.firstname,
        lastname=payload.lastname,
        email=payload.email,
        disabled=False,
        hashed_password=hashed_password,
    )
    db.add(new_user)
    db.commit()
    return {"message": "Signup successful"}


@auth_router.get("/users/me/", response_model=User)
async def read_users_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
):
    return current_user

