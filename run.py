import subprocess
import os
import signal
import sys
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
vite_process = None

def cleanup(signum, frame):
    if vite_process and vite_process.poll() is None:
        print("\nShutting down Vite dev server...")
        vite_process.terminate()
    sys.exit(0)

signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)

npm_executable = shutil.which("npm") or shutil.which("npm.cmd") or shutil.which("npm.exe")
if not npm_executable:
    raise FileNotFoundError(
        "npm was not found on PATH. Install Node.js or add npm to PATH, then retry."
    )

frontend_dir = os.path.join(BASE_DIR, "frontend")
if not os.path.isdir(os.path.join(frontend_dir, "node_modules")):
    print("Installing frontend dependencies...")
    subprocess.run([npm_executable, "install"], cwd=frontend_dir, check=True)
else:
    print("Frontend dependencies already installed.")

print("Checking database connection...")
import sys
sys.path.insert(0, os.path.join(BASE_DIR, "backend"))
from app import create_app
from models import db

_temp_app = create_app()
with _temp_app.app_context():
    if "sqlite" in db.engine.url.drivername:
        print("Seeding database...")
        subprocess.run(["python", "createDatabase.py"], cwd=os.path.join(BASE_DIR, "backend"), check=True)
    else:
        print("Connected to cloud database — skipping seed (data already in Supabase).")

print("Starting Vite dev server (hot reload)...")
vite_process = subprocess.Popen(
    [npm_executable, "run", "dev"],
    cwd=frontend_dir,
)

print("Starting Flask backend (hot reload)...")
try:
    subprocess.run(["python", "app.py"], cwd=os.path.join(BASE_DIR, "backend"))
finally:
    cleanup(None, None)
