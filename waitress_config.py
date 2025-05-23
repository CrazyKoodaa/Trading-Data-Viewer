# Waitress configuration for Windows
import multiprocessing

# Server configuration
host = '127.0.0.1'
port = 5000
threads = multiprocessing.cpu_count() * 2
connection_limit = 1000
cleanup_interval = 30
channel_timeout = 120
log_socket_errors = True

# Performance settings
send_bytes = 18000
asyncore_use_poll = True

# Security settings
expose_tracebacks = False
ident = 'Trading Viewer'