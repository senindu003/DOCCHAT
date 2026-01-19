import os
import json
import requests
from typing import Annotated, List
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends
from dotenv import load_dotenv
import httpx
import asyncio

# LangChain and Database imports
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from routers.models import User, Query, Focus
from routers.auth import get_current_active_user
from user_db.database import get_db

# Google GenAI SDK (Modern 2026 version)
from google import genai
from google.genai import types

load_dotenv()

get_info_router = APIRouter()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# --- TOOL DEFINITION ---
def web_search(query: str) -> List[str]:
    """
    Performs a live web search using Tavily to find current information, 
    news, or additional details relevant in the provided document context and provide only a list of URLs.
    
    Args:
        query (str): The web search query in order to get additional information.
        
    Returns (List[str]):
        A list of URLs.
    """
    try:
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": 5,
            "search_depth": "basic"
        }
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = data.get('results', [])
        if results == []:
            return "No results found for this query."
            
        urls = [result['url'] for result in results]
        return json.dumps(urls)
    except Exception as e:
        print(f"Search Error: {e}")
        return "Error occurred during search."
    
    
async def web_search_async(query: str) -> List[str]:
    """
    Performs a live web search using Tavily to find current information, 
    news, or additional details relevant in the provided document context and provide only a list of URLs.
    
    Args:
        query (str): The web search query in order to get additional information.
        
    Returns (List[str]):
        A list of URLs.
    """
    
    async with httpx.AsyncClient() as client:
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": TAVILY_API_KEY,
            "query": query,
            "max_results": 5,
            "search_depth": "basic"
        }
        try:
            response = await client.post(url, json=payload, timeout=10)
            response.raise_for_status()
            data = response.json()
        
            results = data.get('results', [])
            if results == []:
                return "No results found for this query."
                
            urls = [result['url'] for result in results]
            return json.dumps(urls)
        
        except httpx.HTTPStatusError as err:
            return f'HTTP error occurred: {err}'

# --- RAG LOGIC ---
def filter_docs(query:str, persist_directory:str, category:str, sections:List[str]):
    embedding_model = GoogleGenerativeAIEmbeddings(
        model="models/gemini-embedding-001", 
        api_key=GOOGLE_API_KEY, 
        task_type="RETRIEVAL_DOCUMENT"
    )

    vector_store = Chroma(
        collection_name=persist_directory,
        embedding_function=embedding_model,
        chroma_cloud_api_key=os.getenv("CHROMA_API_KEY"),
        tenant=os.getenv("CHROMA_TENANT"),
        database=os.getenv("CHROMA_DATABASE")
    )
    
    if category == "":
        retriever = vector_store.as_retriever(
            search_type="mmr", 
            search_kwargs={"k": 10, "fetch_k": 20, "lambda_mult": 0.3}
        )
        docs = retriever.invoke(query)
    else:
        filter_query = {"$and": [{"category": category}, {"section": {"$in": sections}}]}
        docs = vector_store.similarity_search(query, k=10, filter=filter_query)
    return docs

# --- LLM CORE ---
async def LLM_enhanced_response(docs, query, history, db: Session):
    """
    Automatic Function Calling version. 
    Gemini decides if it needs to use web_search on its own.
    """
    
    # Initialize the new GenAI Client
    client = genai.Client(api_key=GOOGLE_API_KEY)
    
    # Build context from documents
    context_parts = []
    for doc in docs:
        section = doc.metadata.get('section')
        context_parts.append(f"\n{section}:\n{doc.page_content}")
    context = "\n".join(context_parts)
    
    # Keep your exact prompt template
    prompt_text = f"""Based on the following chat history and context provided, ANSWER THIS QUESTION: {query}

CHAT HISTORY:

{history}

--------------------------------END OF CHAT HISTORY----------------------------

CONTEXT:

{context}

--------------------------------END OF CONTEXT---------------------------------

ANSWER:"""

    # Config for Automatic Function Calling
    config = types.GenerateContentConfig(
        tools=[web_search_async],
        automatic_function_calling=types.AutomaticFunctionCallingConfig(maximum_remote_calls=5),
        temperature=0.2,
        system_instruction='''You are a helpful RAG assistant to students. Please provide a clear, comprehensive answer. If you ONLY need additional information, examples OR recent updates OR if user ask for web links, web resources, further information explicitly, you must use the web search tool.
                              WHEN using the web search tool, IF the web search tool fail to accept your request, you MUST ignore it and say that in the response EXPLICITLY and try to answer the question as best as you can according to the CHAT HISTORY and CONTEXT.
                              If the question is not related to the CHAT HISTORY or CONTEXT, say: "I don't know the answer. Please change the Focused section or category."'''

    )
    
    try:
        response = await client.aio.models.generate_content(model="gemini-2.5-flash-lite", config=config, contents=prompt_text)
        return response.text
    
    except Exception as e:
        print(f"LLM Error: {e}")
        return "I encountered an error processing your request."

@get_info_router.post("/get_info")
async def get_info(
    current_user: Annotated[User, Depends(get_current_active_user)], 
    query: Query, 
    meta_data: Focus, 
    db: Session = Depends(get_db)
):
    docs = filter_docs(
        f"Question: {query.query} Chat history: {query.history}", 
        persist_directory=current_user.username, 
        category=meta_data.category, 
        sections=meta_data.sections
    )
    
    response = await LLM_enhanced_response(docs, query.query, query.history, db)
    return {"answer": response}