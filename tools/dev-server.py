"""Local development server; no browser/GPU startup and no stale config/GLB cache."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(Path(__file__).resolve().parents[1] / 'val-strike-html'), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

class Server(ThreadingHTTPServer):
    request_queue_size = 64
    daemon_threads = True

if __name__ == '__main__':
    print('Val-Strike http://127.0.0.1:8455/ (manual WebGL initialization)', flush=True)
    Server(('127.0.0.1', 8455), Handler).serve_forever()
