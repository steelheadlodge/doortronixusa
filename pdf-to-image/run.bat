@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
python pdf_to_image.py
