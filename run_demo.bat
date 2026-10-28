@echo off
echo ==========================================================
echo Starting EVverse 2.0 ("Will I Make It?") Standalone Demo
echo ==========================================================
start "EVverse Backend (FastAPI)" cmd /k "cd /d %~dp0 && .venv\Scripts\activate && uvicorn backend.api.main:app --reload --port 8000"
timeout /t 3 /nobreak > nul
start "EVverse Frontend (Next.js)" cmd /k "cd /d %~dp0frontend && npm run dev"
echo Both servers started!
echo Frontend: http://localhost:3000
echo Backend API Docs: http://127.0.0.1:8000/docs
