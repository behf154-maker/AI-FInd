@echo off
echo ========================================
echo Fixing PyTorch Installation
echo ========================================
echo.

REM Activate virtual environment
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) else (
    echo ERROR: Virtual environment not found
    echo Please run start_service.bat first
    pause
    exit /b 1
)

echo Uninstalling existing PyTorch...
pip uninstall -y torch torchvision

echo.
echo Installing PyTorch CPU-only (Windows compatible)...
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

if errorlevel 1 (
    echo.
    echo ERROR: Failed to install PyTorch
    echo.
    echo Alternative: Try installing Visual C++ Redistributable:
    echo https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

echo.
echo Testing PyTorch installation...
python -c "import torch; print('PyTorch version:', torch.__version__); print('CPU available:', torch.device('cpu'))"

if errorlevel 1 (
    echo.
    echo ERROR: PyTorch test failed
    pause
    exit /b 1
)

echo.
echo ✅ PyTorch installed successfully!
echo.
pause

