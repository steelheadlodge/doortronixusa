#!/usr/bin/env python3
"""Windows-friendly PDF to JPEG/PNG converter."""

from __future__ import annotations

import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import pypdfium2 as pdfium
from PIL import Image


class PdfToImageApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("PDF to Image")
        self.minsize(520, 420)
        self.geometry("560x460")
        self.resizable(True, False)

        self.pdf_path = tk.StringVar()
        self.output_dir = tk.StringVar()
        self.format_var = tk.StringVar(value="PNG")
        self.dpi_var = tk.IntVar(value=150)
        self.jpeg_quality = tk.IntVar(value=90)
        self.page_mode = tk.StringVar(value="all")
        self.page_from = tk.StringVar(value="1")
        self.page_to = tk.StringVar(value="1")
        self.status = tk.StringVar(value="Choose a PDF to convert.")
        self._busy = False

        self._build_ui()

    def _build_ui(self) -> None:
        pad = {"padx": 12, "pady": 6}
        root = ttk.Frame(self, padding=16)
        root.pack(fill=tk.BOTH, expand=True)

        ttk.Label(root, text="Convert PDF pages to JPEG or PNG", font=("Segoe UI", 14, "bold")).pack(
            anchor=tk.W, pady=(0, 12)
        )

        files = ttk.LabelFrame(root, text="Files", padding=10)
        files.pack(fill=tk.X, **pad)

        row1 = ttk.Frame(files)
        row1.pack(fill=tk.X, pady=2)
        ttk.Entry(row1, textvariable=self.pdf_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row1, text="Browse PDF…", command=self._pick_pdf).pack(side=tk.LEFT, padx=(8, 0))

        row2 = ttk.Frame(files)
        row2.pack(fill=tk.X, pady=2)
        ttk.Entry(row2, textvariable=self.output_dir).pack(side=tk.LEFT, fill=tk.X, expand=True)
        ttk.Button(row2, text="Output folder…", command=self._pick_output).pack(side=tk.LEFT, padx=(8, 0))

        opts = ttk.LabelFrame(root, text="Options", padding=10)
        opts.pack(fill=tk.X, **pad)

        fmt_row = ttk.Frame(opts)
        fmt_row.pack(fill=tk.X, pady=2)
        ttk.Label(fmt_row, text="Format:").pack(side=tk.LEFT)
        ttk.Radiobutton(fmt_row, text="PNG", variable=self.format_var, value="PNG").pack(side=tk.LEFT, padx=(8, 0))
        ttk.Radiobutton(fmt_row, text="JPEG", variable=self.format_var, value="JPEG").pack(side=tk.LEFT, padx=(8, 0))

        dpi_row = ttk.Frame(opts)
        dpi_row.pack(fill=tk.X, pady=2)
        ttk.Label(dpi_row, text="Quality (DPI):").pack(side=tk.LEFT)
        ttk.Spinbox(dpi_row, from_=72, to=600, increment=25, textvariable=self.dpi_var, width=8).pack(
            side=tk.LEFT, padx=(8, 0)
        )
        ttk.Label(dpi_row, text="JPEG quality:").pack(side=tk.LEFT, padx=(16, 0))
        ttk.Spinbox(dpi_row, from_=50, to=100, textvariable=self.jpeg_quality, width=8).pack(
            side=tk.LEFT, padx=(8, 0)
        )

        page_row = ttk.Frame(opts)
        page_row.pack(fill=tk.X, pady=2)
        ttk.Radiobutton(page_row, text="All pages", variable=self.page_mode, value="all").pack(side=tk.LEFT)
        ttk.Radiobutton(page_row, text="Page range", variable=self.page_mode, value="range").pack(
            side=tk.LEFT, padx=(12, 0)
        )
        ttk.Label(page_row, text="From").pack(side=tk.LEFT, padx=(12, 0))
        ttk.Entry(page_row, textvariable=self.page_from, width=6).pack(side=tk.LEFT, padx=(4, 0))
        ttk.Label(page_row, text="To").pack(side=tk.LEFT, padx=(8, 0))
        ttk.Entry(page_row, textvariable=self.page_to, width=6).pack(side=tk.LEFT, padx=(4, 0))

        self.progress = ttk.Progressbar(root, mode="determinate")
        self.progress.pack(fill=tk.X, padx=12, pady=(12, 4))

        ttk.Label(root, textvariable=self.status).pack(anchor=tk.W, padx=12)

        self.convert_btn = ttk.Button(root, text="Convert", command=self._start_convert)
        self.convert_btn.pack(pady=16)

    def _pick_pdf(self) -> None:
        path = filedialog.askopenfilename(
            title="Select PDF",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")],
        )
        if path:
            self.pdf_path.set(path)
            if not self.output_dir.get():
                self.output_dir.set(str(Path(path).parent))

    def _pick_output(self) -> None:
        path = filedialog.askdirectory(title="Select output folder")
        if path:
            self.output_dir.set(path)

    def _start_convert(self) -> None:
        if self._busy:
            return
        pdf = Path(self.pdf_path.get().strip())
        out = Path(self.output_dir.get().strip())
        if not pdf.is_file():
            messagebox.showerror("Missing PDF", "Please choose a valid PDF file.")
            return
        if not out.is_dir():
            messagebox.showerror("Missing folder", "Please choose a valid output folder.")
            return

        self._busy = True
        self.convert_btn.state(["disabled"])
        self.status.set("Converting…")
        thread = threading.Thread(target=self._convert, args=(pdf, out), daemon=True)
        thread.start()

    def _convert(self, pdf_path: Path, out_dir: Path) -> None:
        error: str | None = None
        saved = 0
        try:
            doc = pdfium.PdfDocument(str(pdf_path))
            total = len(doc)
            start, end = 1, total
            if self.page_mode.get() == "range":
                start = int(self.page_from.get())
                end = int(self.page_to.get())
                if start < 1 or end < start or end > total:
                    raise ValueError(f"Page range must be between 1 and {total}.")

            pages = list(range(start - 1, end))
            self.after(0, lambda: self._set_progress(0, len(pages)))

            fmt = self.format_var.get()
            dpi = max(72, int(self.dpi_var.get()))
            scale = dpi / 72
            quality = int(self.jpeg_quality.get())
            stem = pdf_path.stem

            for i, page_index in enumerate(pages, start=1):
                page = doc[page_index]
                bitmap = page.render(scale=scale)
                pil_image: Image.Image = bitmap.to_pil()
                page_num = page_index + 1
                suffix = "jpg" if fmt == "JPEG" else "png"
                dest = out_dir / f"{stem}-page-{page_num:03d}.{suffix}"
                save_kwargs: dict = {}
                if fmt == "JPEG":
                    if pil_image.mode in ("RGBA", "LA", "P"):
                        pil_image = pil_image.convert("RGB")
                    save_kwargs["quality"] = quality
                    save_kwargs["optimize"] = True
                pil_image.save(dest, format=fmt, **save_kwargs)
                saved += 1
                self.after(0, lambda n=i, t=len(pages): self._set_progress(n, t))

            doc.close()
        except Exception as exc:  # noqa: BLE001 — show any conversion error in the UI
            error = str(exc)

        def finish() -> None:
            self._busy = False
            self.convert_btn.state(["!disabled"])
            if error:
                self.status.set("Conversion failed.")
                messagebox.showerror("Conversion failed", error)
            else:
                self.status.set(f"Saved {saved} image(s) to {out_dir}")
                messagebox.showinfo("Done", f"Saved {saved} image(s).")

        self.after(0, finish)

    def _set_progress(self, current: int, total: int) -> None:
        self.progress["maximum"] = max(total, 1)
        self.progress["value"] = current
        self.status.set(f"Converting page {current} of {total}…")


def main() -> None:
    app = PdfToImageApp()
    app.mainloop()


if __name__ == "__main__":
    main()
