# Dev server: giống http.server nhưng gửi Cache-Control: no-store
# để sửa code luôn có hiệu lực ngay khi reload.
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class DevServer(ThreadingHTTPServer):
    # Script/config bursts can exceed the default five pending connections.
    request_queue_size = 64
    daemon_threads = True

if __name__ == '__main__':
    DevServer(('127.0.0.1', 8455), NoCacheHandler).serve_forever()
