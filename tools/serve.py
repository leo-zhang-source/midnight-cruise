#!/usr/bin/env python3
"""Static dev server for Midnight Cruise (modules + AudioWorklet need http://).
Usage: python3 tools/serve.py [port]   → http://localhost:8086/
"""
import http.server, socketserver, sys, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8086
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.wav': 'audio/wav'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a): pass
import socket
class DualStack(socketserver.ThreadingTCPServer):
    # Listen on IPv6 and IPv4 so both http://localhost and http://127.0.0.1 work in every browser.
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True
    def server_bind(self):
        try: self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception: pass
        super().server_bind()
with DualStack(('::', PORT), H) as s:
    print(f'Midnight Cruise → http://localhost:{PORT}/'); s.serve_forever()
