# Finals Buddy backend — FastAPI + SQLite
# Works on x86_64 and ARM64 (Oracle Cloud Ampere A1)
FROM python:3.12-slim

# App code lives here...
WORKDIR /srv/finals-buddy
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

# ...but the process runs from /srv/finals-buddy/data, so every relative
# artifact (finals_buddy.db, uploads/, vector_store.json) lands in one
# mountable volume:  docker run -v finals_data:/srv/finals-buddy/data ...
ENV PYTHONPATH=/srv/finals-buddy
WORKDIR /srv/finals-buddy/data

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
