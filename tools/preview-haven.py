"""Loopback-only review of the actual exported map in Babylon, with local codecs."""
import http.server,pathlib,urllib.parse
ROOT=pathlib.Path(__file__).resolve().parents[1]
WEB=ROOT/'val-strike-html'
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(WEB),**kwargs)
    def log_message(self,*args):pass
    def do_GET(self):
        route=urllib.parse.urlsplit(self.path).path
        if route=='/':
            data=(ROOT/'tools/haven-preview.html').read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',len(data));self.end_headers();self.wfile.write(data);return
        if not route.startswith(('/assets/maps/optimized/haven-art/','/assets/vendor/','/game/draco/','/game/map-presentation.js')):
            self.send_error(404);return
        super().do_GET()
print('Haven map review: http://127.0.0.1:8461/',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',8461),Handler).serve_forever()
