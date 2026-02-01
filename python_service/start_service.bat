@echo off
echo ========================================
echo Starting Python Image Classification Service
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.11 or later
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/upgrade requirements
echo Installing dependencies...
python -m pip install -q --upgrade pip

REM Install PyTorch CPU-only first (to avoid DLL issues on Windows)
echo Installing PyTorch (CPU-only)...
pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cpu

REM Install other dependencies
echo Installing other dependencies...
pip install -q transformers pillow flask flask-cors requests

if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

REM Set environment variables
set HF_MODEL=google/vit-base-patch16-224
set PYTHON_SERVICE_PORT=5000

REM Start the service
echo.
echo Starting service...
echo.
python image_classifier.py

pause

