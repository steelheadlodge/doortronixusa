#!/usr/bin/env python3
"""Paint that actually lets you change the font.

Opens and saves the same files MS Paint uses: BMP, PNG, JPEG, GIF, TIFF.
Text stays live — font, size, bold, italic, and color update in place
instead of snapping back when you click the toolbar.
"""

from __future__ import annotations

import os
import sys
import tkinter as tk
from tkinter import colorchooser, filedialog, font as tkfont, messagebox, ttk
from typing import Optional

from PIL import Image, ImageDraw, ImageFont, ImageTk

OPEN_TYPES = [
    ("Paint and image files", "*.bmp;*.dib;*.png;*.jpg;*.jpeg;*.gif;*.tif;*.tiff"),
    ("Bitmap (Paint)", "*.bmp;*.dib"),
    ("PNG", "*.png"),
    ("JPEG", "*.jpg;*.jpeg"),
    ("GIF", "*.gif"),
    ("TIFF", "*.tif;*.tiff"),
    ("All files", "*.*"),
]
SAVE_TYPES = [
    ("PNG", "*.png"),
    ("Bitmap (Paint 24-bit)", "*.bmp"),
    ("JPEG", "*.jpg"),
    ("GIF", "*.gif"),
    ("TIFF", "*.tif"),
]

WIN_FONTS = {
    "Arial": "arial.ttf",
    "Arial Black": "ariblk.ttf",
    "Calibri": "calibri.ttf",
    "Cambria": "cambria.ttc",
    "Comic Sans MS": "comic.ttf",
    "Consolas": "consola.ttf",
    "Courier New": "cour.ttf",
    "Georgia": "georgia.ttf",
    "Impact": "impact.ttf",
    "Segoe UI": "segoeui.ttf",
    "Tahoma": "tahoma.ttf",
    "Times New Roman": "times.ttf",
    "Trebuchet MS": "trebuc.ttf",
    "Verdana": "verdana.ttf",
}
BOLD_MAP = {
    "arial.ttf": "arialbd.ttf",
    "calibri.ttf": "calibrib.ttf",
    "comic.ttf": "comicbd.ttf",
    "consola.ttf": "consolab.ttf",
    "cour.ttf": "courbd.ttf",
    "georgia.ttf": "georgiab.ttf",
    "segoeui.ttf": "segoeuib.ttf",
    "tahoma.ttf": "tahomabd.ttf",
    "times.ttf": "timesbd.ttf",
    "trebuc.ttf": "trebucbd.ttf",
    "verdana.ttf": "verdanab.ttf",
}
ITALIC_MAP = {
    "arial.ttf": "ariali.ttf",
    "calibri.ttf": "calibrii.ttf",
    "comic.ttf": "comici.ttf",
    "consola.ttf": "consolai.ttf",
    "cour.ttf": "couri.ttf",
    "georgia.ttf": "georgiai.ttf",
    "segoeui.ttf": "segoeuii.ttf",
    "times.ttf": "timesi.ttf",
    "trebuc.ttf": "trebucit.ttf",
    "verdana.ttf": "verdanai.ttf",
}
BOLDITALIC_MAP = {
    "arial.ttf": "arialbi.ttf",
    "calibri.ttf": "calibriz.ttf",
    "comic.ttf": "comicz.ttf",
    "consola.ttf": "consolaz.ttf",
    "cour.ttf": "courbi.ttf",
    "georgia.ttf": "georgiaz.ttf",
    "segoeui.ttf": "segoeuiz.ttf",
    "times.ttf": "timesbi.ttf",
    "trebuc.ttf": "trebucbi.ttf",
    "verdana.ttf": "verdanaz.ttf",
}

TOOLS = [
    ("pencil", "Pencil"),
    ("brush", "Brush"),
    ("eraser", "Eraser"),
    ("fill", "Fill"),
    ("line", "Line"),
    ("rect", "Rectangle"),
    ("oval", "Ellipse"),
    ("text", "Text"),
    ("picker", "Eyedropper"),
]


def windows_font_dir() -> str:
    windir = os.environ.get("WINDIR", r"C:\Windows")
    return os.path.join(windir, "Fonts")


def installed_families() -> list[str]:
    names = set(tkfont.families())
    preferred = [n for n in WIN_FONTS if n in names]
    rest = sorted(n for n in names if n not in WIN_FONTS and not n.startswith("@"))
    return preferred + rest


def _registry_font_file(family: str, bold: bool, italic: bool) -> Optional[str]:
    """Use the Windows font registry so any font already on the PC can stamp."""
    if sys.platform != "win32":
        return None
    try:
        import winreg
    except ImportError:
        return None
    style = family
    if bold and italic:
        style = f"{family} Bold Italic"
    elif bold:
        style = f"{family} Bold"
    elif italic:
        style = f"{family} Italic"
    keys = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
        (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
    ]
    wanted = [
        f"{style} (TrueType)",
        f"{style} (OpenType)",
        f"{family} (TrueType)",
        f"{family} (OpenType)",
        style,
        family,
    ]
    folder = windows_font_dir()
    for hive, path in keys:
        try:
            key = winreg.OpenKey(hive, path)
        except OSError:
            continue
        try:
            i = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, i)
                except OSError:
                    break
                i += 1
                if name not in wanted:
                    continue
                loc = value if os.path.isabs(value) else os.path.join(folder, value)
                if os.path.isfile(loc):
                    return loc
        finally:
            winreg.CloseKey(key)
    return None


def truetype_path(family: str, bold: bool, italic: bool) -> Optional[str]:
    found = _registry_font_file(family, bold, italic)
    if found:
        return found
    base = WIN_FONTS.get(family)
    if not base:
        return None
    folder = windows_font_dir()
    name = base
    if bold and italic:
        name = BOLDITALIC_MAP.get(base, BOLD_MAP.get(base, base))
    elif bold:
        name = BOLD_MAP.get(base, base)
    elif italic:
        name = ITALIC_MAP.get(base, base)
    path = os.path.join(folder, name)
    if os.path.isfile(path):
        return path
    fallback = os.path.join(folder, base)
    return fallback if os.path.isfile(fallback) else None


def load_pil_font(family: str, size: int, bold: bool, italic: bool) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = truetype_path(family, bold, italic)
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def tk_font(family: str, size: int, bold: bool, italic: bool) -> tkfont.Font:
    return tkfont.Font(
        family=family,
        size=max(6, size),
        weight="bold" if bold else "normal",
        slant="italic" if italic else "roman",
    )


class PaintApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Paint")
        self.geometry("1100x720")
        self.minsize(800, 520)

        self.tool = tk.StringVar(value="pencil")
        self.fg = "#000000"
        self.bg = "#ffffff"
        self.brush_size = tk.IntVar(value=3)
        self.font_family = tk.StringVar(value="Arial")
        self.font_size = tk.IntVar(value=24)
        self.font_bold = tk.BooleanVar(value=False)
        self.font_italic = tk.BooleanVar(value=False)

        self.image = Image.new("RGB", (800, 600), "white")
        self.photo: Optional[ImageTk.PhotoImage] = None
        self.path: Optional[str] = None
        self.dirty = False
        self.undo_stack: list[Image.Image] = []
        self.redo_stack: list[Image.Image] = []

        self._draw_start: Optional[tuple[int, int]] = None
        self._preview_id = None
        self._last: Optional[tuple[int, int]] = None
        self.text_box: Optional[tk.Text] = None
        self.text_win: Optional[int] = None
        self.text_xy: tuple[int, int] = (0, 0)

        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.bind_all("<Control-z>", lambda e: self.undo())
        self.bind_all("<Control-y>", lambda e: self.redo())
        self.bind_all("<Control-s>", lambda e: self.save())
        self.bind_all("<Control-o>", lambda e: self.open_file())
        self.bind_all("<Control-n>", lambda e: self.new_image())
        self._refresh()

    def _build(self) -> None:
        menubar = tk.Menu(self)
        filem = tk.Menu(menubar, tearoff=0)
        filem.add_command(label="New", accelerator="Ctrl+N", command=self.new_image)
        filem.add_command(label="Open…", accelerator="Ctrl+O", command=self.open_file)
        filem.add_command(label="Save", accelerator="Ctrl+S", command=self.save)
        filem.add_command(label="Save As…", command=self.save_as)
        filem.add_separator()
        filem.add_command(label="Exit", command=self._on_close)
        menubar.add_cascade(label="File", menu=filem)
        editm = tk.Menu(menubar, tearoff=0)
        editm.add_command(label="Undo", accelerator="Ctrl+Z", command=self.undo)
        editm.add_command(label="Redo", accelerator="Ctrl+Y", command=self.redo)
        editm.add_separator()
        editm.add_command(label="Clear canvas", command=self.clear_canvas)
        menubar.add_cascade(label="Edit", menu=editm)
        self.config(menu=menubar)

        toolbar = ttk.Frame(self, padding=(8, 6))
        toolbar.pack(fill=tk.X)

        for key, label in TOOLS:
            ttk.Radiobutton(
                toolbar, text=label, value=key, variable=self.tool, command=self._tool_changed
            ).pack(side=tk.LEFT, padx=2)

        ttk.Separator(toolbar, orient=tk.VERTICAL).pack(side=tk.LEFT, fill=tk.Y, padx=8)
        ttk.Label(toolbar, text="Size").pack(side=tk.LEFT)
        ttk.Spinbox(toolbar, from_=1, to=80, width=4, textvariable=self.brush_size).pack(side=tk.LEFT, padx=4)

        self.fg_btn = tk.Button(toolbar, width=3, bg=self.fg, command=self._pick_fg)
        self.fg_btn.pack(side=tk.LEFT, padx=(12, 2))
        self.bg_btn = tk.Button(toolbar, width=3, bg=self.bg, command=self._pick_bg)
        self.bg_btn.pack(side=tk.LEFT, padx=2)
        ttk.Label(toolbar, text="Color / Background").pack(side=tk.LEFT, padx=(4, 0))

        fontbar = ttk.Frame(self, padding=(8, 0, 8, 8))
        fontbar.pack(fill=tk.X)
        ttk.Label(fontbar, text="Font").pack(side=tk.LEFT)
        families = installed_families()
        if families and self.font_family.get() not in families:
            self.font_family.set(families[0])
        self.font_combo = ttk.Combobox(
            fontbar, textvariable=self.font_family, values=families, width=22, state="readonly"
        )
        self.font_combo.pack(side=tk.LEFT, padx=4)
        ttk.Label(fontbar, text="Size").pack(side=tk.LEFT, padx=(8, 0))
        self.size_spin = ttk.Spinbox(fontbar, from_=8, to=200, width=5, textvariable=self.font_size)
        self.size_spin.pack(side=tk.LEFT, padx=4)
        self.bold_chk = ttk.Checkbutton(fontbar, text="Bold", variable=self.font_bold)
        self.bold_chk.pack(side=tk.LEFT, padx=4)
        self.italic_chk = ttk.Checkbutton(fontbar, text="Italic", variable=self.font_italic)
        self.italic_chk.pack(side=tk.LEFT, padx=4)
        ttk.Label(fontbar, text="Change these while typing — text stays selected.").pack(
            side=tk.LEFT, padx=12
        )

        for var in (self.font_family, self.font_size, self.font_bold, self.font_italic):
            var.trace_add("write", lambda *_: self._apply_live_font())
        self.font_combo.bind("<<ComboboxSelected>>", lambda e: self._keep_text_focus())
        self.size_spin.bind("<Return>", lambda e: self._keep_text_focus())
        self.size_spin.bind("<FocusOut>", lambda e: self._apply_live_font())

        wrap = ttk.Frame(self)
        wrap.pack(fill=tk.BOTH, expand=True)
        self.canvas = tk.Canvas(wrap, bg="#c0c0c0", highlightthickness=0, cursor="crosshair")
        xscroll = ttk.Scrollbar(wrap, orient=tk.HORIZONTAL, command=self.canvas.xview)
        yscroll = ttk.Scrollbar(wrap, orient=tk.VERTICAL, command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=xscroll.set, yscrollcommand=yscroll.set)
        self.canvas.grid(row=0, column=0, sticky="nsew")
        yscroll.grid(row=0, column=1, sticky="ns")
        xscroll.grid(row=1, column=0, sticky="ew")
        wrap.grid_rowconfigure(0, weight=1)
        wrap.grid_columnconfigure(0, weight=1)

        self.canvas.bind("<ButtonPress-1>", self._down)
        self.canvas.bind("<B1-Motion>", self._drag)
        self.canvas.bind("<ButtonRelease-1>", self._up)
        self.bind_all("<Escape>", lambda e: self._commit_text())

        self.status = tk.StringVar(value="Ready. Text tool: click, type, change font, then click away or press Esc.")
        ttk.Label(self, textvariable=self.status, padding=(8, 4)).pack(fill=tk.X)

    def _tool_changed(self) -> None:
        if self.tool.get() != "text":
            self._commit_text()

    def _pick_fg(self) -> None:
        color = colorchooser.askcolor(color=self.fg, title="Color")[1]
        if color:
            self.fg = color
            self.fg_btn.config(bg=color)
            if self.text_box:
                self.text_box.configure(fg=color)
                self._keep_text_focus()

    def _pick_bg(self) -> None:
        color = colorchooser.askcolor(color=self.bg, title="Background")[1]
        if color:
            self.bg = color
            self.bg_btn.config(bg=color)

    def _canvas_xy(self, event) -> tuple[int, int]:
        return int(self.canvas.canvasx(event.x)), int(self.canvas.canvasy(event.y))

    def _clamp(self, x: int, y: int) -> tuple[int, int]:
        w, h = self.image.size
        return max(0, min(w - 1, x)), max(0, min(h - 1, y))

    def _snapshot(self) -> None:
        self.undo_stack.append(self.image.copy())
        if len(self.undo_stack) > 40:
            self.undo_stack.pop(0)
        self.redo_stack.clear()

    def _refresh(self) -> None:
        self.photo = ImageTk.PhotoImage(self.image)
        self.canvas.delete("raster")
        self.canvas.create_image(0, 0, image=self.photo, anchor="nw", tags="raster")
        self.canvas.tag_lower("raster")
        w, h = self.image.size
        self.canvas.config(scrollregion=(0, 0, w, h))
        name = os.path.basename(self.path) if self.path else "Untitled"
        mark = "*" if self.dirty else ""
        self.title(f"{name}{mark} — Paint")

    def _mark_dirty(self) -> None:
        self.dirty = True
        self._refresh()

    def _draw_line(self, x0: int, y0: int, x1: int, y1: int, color: str, width: int) -> None:
        draw = ImageDraw.Draw(self.image)
        draw.line((x0, y0, x1, y1), fill=color, width=max(1, width))
        if width > 1:
            r = max(1, width // 2)
            draw.ellipse((x1 - r, y1 - r, x1 + r, y1 + r), fill=color)

    def _shape(self, x0: int, y0: int, x1: int, y1: int, kind: str, preview: bool) -> None:
        if preview:
            self.canvas.delete("preview")
            opts = {"outline": self.fg, "width": max(1, self.brush_size.get()), "tags": "preview"}
            if kind == "line":
                self.canvas.create_line(x0, y0, x1, y1, **opts)
            elif kind == "rect":
                self.canvas.create_rectangle(x0, y0, x1, y1, **opts)
            else:
                self.canvas.create_oval(x0, y0, x1, y1, **opts)
            return
        draw = ImageDraw.Draw(self.image)
        w = max(1, self.brush_size.get())
        box = (x0, y0, x1, y1)
        if kind == "line":
            draw.line(box, fill=self.fg, width=w)
        elif kind == "rect":
            draw.rectangle(box, outline=self.fg, width=w)
        else:
            draw.ellipse(box, outline=self.fg, width=w)

    def _flood(self, x: int, y: int) -> None:
        target = self.image.getpixel((x, y))
        fill = Image.new("RGB", (1, 1), self.fg).getpixel((0, 0))
        if target == fill:
            return
        ImageDraw.floodfill(self.image, (x, y), fill, thresh=0)

    def _down(self, event) -> None:
        x, y = self._canvas_xy(event)
        tool = self.tool.get()
        if tool == "text":
            self._begin_text(x, y)
            return
        if self.text_box:
            self._commit_text()
        x, y = self._clamp(x, y)
        self._draw_start = (x, y)
        self._last = (x, y)
        if tool == "picker":
            rgb = self.image.getpixel((x, y))
            self.fg = "#%02x%02x%02x" % rgb[:3]
            self.fg_btn.config(bg=self.fg)
            return
        if tool == "fill":
            self._snapshot()
            self._flood(x, y)
            self._mark_dirty()
            return
        if tool in ("pencil", "brush", "eraser"):
            self._snapshot()
            color = self.bg if tool == "eraser" else self.fg
            width = 12 if tool == "eraser" else (8 if tool == "brush" else max(1, self.brush_size.get()))
            self._draw_line(x, y, x, y, color, width)
            self._mark_dirty()

    def _drag(self, event) -> None:
        if not self._draw_start:
            return
        x, y = self._clamp(*self._canvas_xy(event))
        tool = self.tool.get()
        if tool in ("pencil", "brush", "eraser") and self._last:
            color = self.bg if tool == "eraser" else self.fg
            width = 12 if tool == "eraser" else (8 if tool == "brush" else max(1, self.brush_size.get()))
            self._draw_line(*self._last, x, y, color, width)
            self._last = (x, y)
            self._refresh()
        elif tool in ("line", "rect", "oval"):
            self._shape(*self._draw_start, x, y, tool, preview=True)

    def _up(self, event) -> None:
        if not self._draw_start:
            return
        x, y = self._clamp(*self._canvas_xy(event))
        tool = self.tool.get()
        if tool in ("line", "rect", "oval"):
            self.canvas.delete("preview")
            self._snapshot()
            self._shape(*self._draw_start, x, y, tool, preview=False)
            self._mark_dirty()
        self._draw_start = None
        self._last = None

    def _current_tk_font(self) -> tkfont.Font:
        try:
            size = int(self.font_size.get())
        except (tk.TclError, ValueError):
            size = 24
        return tk_font(self.font_family.get(), size, self.font_bold.get(), self.font_italic.get())

    def _begin_text(self, x: int, y: int) -> None:
        if self.text_box:
            # Clicking the canvas while editing commits, unless you hit the box itself.
            self._commit_text()
        self.tool.set("text")
        self.text_xy = (x, y)
        box = tk.Text(
            self.canvas,
            width=28,
            height=3,
            wrap="word",
            bd=1,
            relief="solid",
            highlightthickness=1,
            highlightbackground="#0b6bcb",
            fg=self.fg,
            bg="white",
            insertbackground=self.fg,
            font=self._current_tk_font(),
            undo=True,
        )
        self.text_box = box
        self.text_win = self.canvas.create_window(x, y, window=box, anchor="nw")
        box.focus_set()
        box.bind("<Control-Return>", lambda e: self._commit_text() or "break")
        self.status.set("Type here. Change Font / Size / Bold / Italic / Color — it will not snap back. Esc or click away to stamp it.")

    def _keep_text_focus(self) -> None:
        self._apply_live_font()
        if self.text_box:
            self.after(1, self.text_box.focus_set)

    def _apply_live_font(self) -> None:
        if not self.text_box:
            return
        try:
            self.text_box.configure(font=self._current_tk_font(), fg=self.fg, insertbackground=self.fg)
        except tk.TclError:
            pass

    def _commit_text(self) -> None:
        box = self.text_box
        if not box:
            return
        text = box.get("1.0", "end-1c")
        x, y = self.text_xy
        box.destroy()
        self.text_box = None
        self.text_win = None
        if not text.strip():
            return
        self._snapshot()
        try:
            size = int(self.font_size.get())
        except (tk.TclError, ValueError):
            size = 24
        pil_font = load_pil_font(self.font_family.get(), size, self.font_bold.get(), self.font_italic.get())
        draw = ImageDraw.Draw(self.image)
        draw.multiline_text((x, y), text, font=pil_font, fill=self.fg, spacing=4)
        self._mark_dirty()
        self.status.set("Text stamped onto the picture.")

    def new_image(self) -> None:
        if not self._ok_discard():
            return
        win = tk.Toplevel(self)
        win.title("New")
        win.resizable(False, False)
        ttk.Label(win, text="Width").grid(row=0, column=0, padx=8, pady=8)
        wvar = tk.StringVar(value="800")
        ttk.Entry(win, textvariable=wvar, width=8).grid(row=0, column=1, padx=8)
        ttk.Label(win, text="Height").grid(row=1, column=0, padx=8, pady=8)
        hvar = tk.StringVar(value="600")
        ttk.Entry(win, textvariable=hvar, width=8).grid(row=1, column=1, padx=8)

        def go() -> None:
            try:
                w, h = int(wvar.get()), int(hvar.get())
                if w < 1 or h < 1:
                    raise ValueError
            except ValueError:
                messagebox.showerror("New", "Enter a valid width and height.")
                return
            self._commit_text()
            self.image = Image.new("RGB", (w, h), self.bg)
            self.path = None
            self.dirty = False
            self.undo_stack.clear()
            self.redo_stack.clear()
            self._refresh()
            win.destroy()

        ttk.Button(win, text="Create", command=go).grid(row=2, column=0, columnspan=2, pady=10)
        win.transient(self)
        win.grab_set()

    def open_file(self, path: Optional[str] = None) -> None:
        if not self._ok_discard():
            return
        if not path:
            path = filedialog.askopenfilename(filetypes=OPEN_TYPES)
        if not path:
            return
        try:
            img = Image.open(path)
            img.load()
            if img.mode == "P":
                img = img.convert("RGBA" if "transparency" in img.info else "RGB")
            if img.mode == "RGBA":
                ground = Image.new("RGB", img.size, "white")
                ground.paste(img, mask=img.split()[-1])
                img = ground
            elif img.mode != "RGB":
                img = img.convert("RGB")
        except Exception as exc:
            messagebox.showerror("Open", f"Could not open that file.\n\n{exc}")
            return
        self._commit_text()
        self.image = img
        self.path = path
        self.dirty = False
        self.undo_stack.clear()
        self.redo_stack.clear()
        self._refresh()
        self.status.set(f"Opened {path}")

    def save(self) -> None:
        if not self.path:
            self.save_as()
            return
        self._write(self.path)

    def save_as(self) -> None:
        path = filedialog.asksaveasfilename(
            defaultextension=".png",
            filetypes=SAVE_TYPES,
            initialfile=os.path.basename(self.path) if self.path else "untitled.png",
        )
        if path:
            self._write(path)

    def _write(self, path: str) -> None:
        self._commit_text()
        ext = os.path.splitext(path)[1].lower()
        img = self.image
        try:
            if ext in (".jpg", ".jpeg"):
                img.save(path, format="JPEG", quality=95)
            elif ext == ".bmp":
                img.save(path, format="BMP")
            elif ext == ".gif":
                img.convert("P", palette=Image.Palette.ADAPTIVE).save(path, format="GIF")
            elif ext in (".tif", ".tiff"):
                img.save(path, format="TIFF")
            else:
                if not ext:
                    path += ".png"
                img.save(path, format="PNG")
        except Exception as exc:
            messagebox.showerror("Save", f"Could not save.\n\n{exc}")
            return
        self.path = path
        self.dirty = False
        self._refresh()
        self.status.set(f"Saved {path}")

    def undo(self) -> None:
        if not self.undo_stack:
            return
        self._commit_text()
        self.redo_stack.append(self.image.copy())
        self.image = self.undo_stack.pop()
        self._mark_dirty()

    def redo(self) -> None:
        if not self.redo_stack:
            return
        self._commit_text()
        self.undo_stack.append(self.image.copy())
        self.image = self.redo_stack.pop()
        self._mark_dirty()

    def clear_canvas(self) -> None:
        self._snapshot()
        self.image = Image.new("RGB", self.image.size, self.bg)
        self._mark_dirty()

    def _ok_discard(self) -> bool:
        if not self.dirty:
            return True
        ans = messagebox.askyesnocancel("Paint", "Save changes?")
        if ans is None:
            return False
        if ans:
            self.save()
            return not self.dirty
        return True

    def _on_close(self) -> None:
        if self._ok_discard():
            self.destroy()


def main() -> None:
    app = PaintApp()
    if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
        app.open_file(sys.argv[1])
    app.mainloop()


if __name__ == "__main__":
    main()
