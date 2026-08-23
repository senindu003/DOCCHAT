FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libmagic1 \
    libgl1 \
    libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
# Railway has no GPU. Prefer PyTorch's CPU wheels so unstructured[pdf] does
# not pull NVIDIA CUDA packages into the production image.
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu -r /app/requirements.txt

COPY backend/ /app/

CMD ["sh", "-lc", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
