"""Função Python da Vercel: prévia e download de links públicos do TikTok e do Instagram.

Na Vercel não existe o binário do yt-dlp, então esta função usa a biblioteca Python (yt-dlp é puro Python).
Ações (POST /api/yt?action=...; corpo JSON com "url"):
- preview: título, autor, miniatura, duração, sem baixar o vídeo.
- import: baixa o MP4 e envia para o storage da Higgsfield; devolve a URL pública.
Em desenvolvimento local o hubd usa o binário (lib/download.ts), não esta função.
"""

import json
import os
import shutil
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

import yt_dlp
from yt_dlp.utils import DownloadError

HOSTS = ("tiktok.com", "instagram.com", "instagr.am")
MAX_BYTES = 200 * 1024 * 1024
HF_BASE = "https://api.higgsfield.ai"


class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status = status
        self.msg = msg


def allowed(raw):
    url = str(raw or "").strip()
    try:
        parsed = urlparse(url)
    except ValueError:
        raise ApiError(400, "Link inválido.")
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not any(host == d or host.endswith("." + d) for d in HOSTS):
        raise ApiError(400, "Use um link do TikTok ou do Instagram.")
    return url


def clean_error(exc):
    text = str(exc)
    return text.replace("ERROR: ", "").strip()[:300]


def preview(url):
    try:
        with yt_dlp.YoutubeDL({"noplaylist": True, "quiet": True, "no_warnings": True}) as ydl:
            info = ydl.extract_info(url, download=False)
    except DownloadError as exc:
        raise ApiError(422, f"Não foi possível ler este link: {clean_error(exc)}")
    return {
        "title": str(info.get("title") or "Vídeo sem título")[:200],
        "uploader": info.get("uploader") or info.get("channel"),
        "thumbnail": info.get("thumbnail"),
        "seconds": float(info.get("duration") or 0),
        "width": int(info.get("width") or 0),
        "height": int(info.get("height") or 0),
    }


def hf_store(data, content_type):
    """Mesmo fluxo de lib/hf.ts (storeBytes): URL pré-assinada, PUT do arquivo, URL pública."""
    key = os.environ.get("HF_CREDENTIALS")
    if not key:
        raise ApiError(500, "HF_CREDENTIALS não configurado no servidor.")
    req = urllib.request.Request(
        f"{HF_BASE}/files/generate-upload-url",
        data=json.dumps({"content_type": content_type}).encode(),
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        up = json.loads(res.read())
    put = urllib.request.Request(up["upload_url"], data=data, headers=up["upload_headers"], method="PUT")
    with urllib.request.urlopen(put, timeout=180):
        pass
    return up["public_url"]


def import_video(url):
    tmp = tempfile.mkdtemp(prefix="hubd-dl-")
    try:
        opts = {
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "format": "best[ext=mp4]/best",
            "max_filesize": MAX_BYTES,
            "outtmpl": os.path.join(tmp, "video.%(ext)s"),
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except DownloadError as exc:
            raise ApiError(422, f"Não foi possível baixar este link: {clean_error(exc)}")
        files = [f for f in os.listdir(tmp) if f.startswith("video.")]
        if not files:
            raise ApiError(422, "O download não gerou arquivo de vídeo.")
        if not files[0].lower().endswith(".mp4"):
            raise ApiError(422, "Este vídeo não está em MP4 e não pode ser usado.")
        with open(os.path.join(tmp, files[0]), "rb") as f:
            data = f.read()
        if len(data) > MAX_BYTES:
            raise ApiError(413, "Vídeo grande demais (máximo 200 MB).")
        return {
            "url": hf_store(data, "video/mp4"),
            "seconds": float(info.get("duration") or 0),
            "width": int(info.get("width") or 0),
            "height": int(info.get("height") or 0),
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        action = parse_qs(urlparse(self.path).query).get("action", [""])[0]
        try:
            length = int(self.headers.get("content-length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            url = allowed(body.get("url"))
            if action == "preview":
                out = preview(url)
            elif action == "import":
                out = import_video(url)
            else:
                raise ApiError(404, "Ação desconhecida.")
            status = 200
        except ApiError as exc:
            out, status = {"error": exc.msg}, exc.status
        except Exception as exc:  # erro inesperado: não vaza detalhes internos além da mensagem
            out, status = {"error": f"Erro no servidor de download: {type(exc).__name__}"}, 500

        payload = json.dumps(out).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
