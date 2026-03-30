#!/usr/bin/env python3
"""Local dev server with no-cache headers."""
import http.server, socketserver

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        pass  # suppress access logs

with socketserver.TCPServer(('', 8080), NoCacheHandler) as httpd:
    print('Serving at http://localhost:8080 (no-cache)')
    httpd.serve_forever()
