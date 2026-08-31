@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
python -m PyInstaller --noconfirm --windowed --onefile --name "PDF to Image" pdf_to_image.py
echo.
echo Built EXE is in the dist folder.
pause
