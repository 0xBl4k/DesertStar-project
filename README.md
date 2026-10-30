# DesertStar-project
this project is about lunar idk something

Linux
```
python3 -m venv venv && source venv/bin/activate
```
- Build command: pip install -r api/requirements.txt
- Start command: uvicorn api.main:app --host 0.0.0.0 --port $PORT
- Then check https://localhost:8000/health and /api/sites.