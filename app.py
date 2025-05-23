from flask import Flask, render_template, jsonify, request, send_file, Response
from typing import Union, Tuple, List, Dict, Any, Optional
import sqlite3
import json
import io
import csv
from datetime import datetime, timezone
import os
import threading
from functools import wraps, lru_cache
import logging
import sys
import time
from contextlib import contextmanager
import atexit
from concurrent.futures import ThreadPoolExecutor

# Configure logging with better formatting and rotation
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.FileHandler('logs/app.log', encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['JSON_SORT_KEYS'] = False
app.config['JSONIFY_PRETTYPRINT_REGULAR'] = False

# Configuration constants
DATABASE_PATH = 'database/my_data.db'
MAX_WORKERS = min(32, (os.cpu_count() or 1) + 4)
CACHE_SIZE = 1000
CONNECTION_TIMEOUT = 30.0
MAX_DATA_POINTS = 50000  # Limit for performance

# Thread pool for heavy operations
executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)

class DatabaseManager:
    """Thread-safe database connection manager with connection pooling"""
    
    def __init__(self, db_path: str, max_connections: int = 10):
        self.db_path = db_path
        self.max_connections = max_connections
        self._local = threading.local()
        self._connection_count = 0
        self._lock = threading.Lock()
        self._validate_database()
        
    def _validate_database(self) -> None:
        """Validate database exists and is accessible"""
        if not os.path.exists(self.db_path):
            raise FileNotFoundError(f"Database file not found: {self.db_path}")
            
        # Test connection
        try:
            with sqlite3.connect(self.db_path, timeout=5.0) as conn:
                conn.execute("SELECT 1")
        except Exception as e:
            raise ConnectionError(f"Cannot connect to database: {e}")
    
    @contextmanager
    def get_connection(self):
        """Get a thread-local database connection with proper cleanup"""
        if not hasattr(self._local, 'connection') or self._local.connection is None:
            try:
                with self._lock:
                    if self._connection_count >= self.max_connections:
                        raise ConnectionError("Maximum database connections reached")
                    self._connection_count += 1
                
                conn = sqlite3.connect(
                    self.db_path,
                    timeout=CONNECTION_TIMEOUT,
                    check_same_thread=False
                )
                conn.row_factory = sqlite3.Row
                # Optimize SQLite settings for performance
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute("PRAGMA synchronous=NORMAL")
                conn.execute("PRAGMA cache_size=10000")
                conn.execute("PRAGMA temp_store=MEMORY")
                conn.execute("PRAGMA mmap_size=268435456")  # 256MB
                
                self._local.connection = conn
                
            except Exception as e:
                logger.error(f"Database connection error: {e}")
                raise
        
        try:
            yield self._local.connection
        except Exception as e:
            logger.error(f"Database operation error: {e}")
            self._close_connection()
            raise
    
    def _close_connection(self) -> None:
        """Close thread-local connection"""
        if hasattr(self._local, 'connection') and self._local.connection:
            try:
                self._local.connection.close()
                with self._lock:
                    self._connection_count = max(0, self._connection_count - 1)
            except:
                pass
            finally:
                self._local.connection = None
    
    def close_all(self) -> None:
        """Close all connections - called on app shutdown"""
        self._close_connection()

# Initialize database manager
db_manager = DatabaseManager(DATABASE_PATH)

@atexit.register
def cleanup():
    """Cleanup resources on app shutdown"""
    db_manager.close_all()
    executor.shutdown(wait=True)

def handle_db_errors(f):
    """Enhanced error handling decorator with retry logic"""
    @wraps(f)
    def decorated_function(*args, **kwargs) -> Union[Response, Tuple[Response, int]]:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = f(*args, **kwargs)
                return result
            except sqlite3.OperationalError as e:
                if "database is locked" in str(e).lower() and attempt < max_retries - 1:
                    time.sleep(0.1 * (attempt + 1))  # Exponential backoff
                    continue
                logger.error(f"Database error in {f.__name__} (attempt {attempt + 1}): {e}")
                return jsonify({'error': f'Database error: {str(e)}'}), 500
            except FileNotFoundError as e:
                logger.error(f"File not found in {f.__name__}: {e}")
                return jsonify({'error': f'Database file not found: {str(e)}'}), 500
            except Exception as e:
                logger.error(f"Error in {f.__name__} (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(0.1 * (attempt + 1))
                    continue
                return jsonify({'error': f'Server error: {str(e)}'}), 500
        
        return jsonify({'error': 'Maximum retries exceeded'}), 500
    return decorated_function

@lru_cache(maxsize=CACHE_SIZE)
def detect_trading_tables() -> Tuple[Dict[str, Any], ...]:
    """Detect all tables that contain trading data with caching"""
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            all_tables = [row[0] for row in cursor.fetchall()]
            
            trading_tables = []
            required_columns = ['bar_end_datetime', 'open_price', 'high_price', 'low_price', 'close_price']
            
            for table_name in all_tables:
                try:
                    # Check table structure
                    cursor = conn.execute(f"PRAGMA table_info([{table_name}])")
                    columns = [col[1].lower() for col in cursor.fetchall()]
                    
                    if not all(col in columns for col in required_columns):
                        continue
                    
                    # Get metadata efficiently
                    cursor = conn.execute(f"""
                        SELECT 
                            COUNT(*) as count,
                            MIN(bar_end_datetime) as min_date,
                            MAX(bar_end_datetime) as max_date
                        FROM [{table_name}]
                    """)
                    result = cursor.fetchone()
                    
                    if not result or result['count'] == 0:
                        continue
                    
                    # Extract instrument name
                    instrument = table_name.replace('_bars', '').replace('_data', '').replace('bars_', '').upper()
                    
                    # Format date range
                    date_display = ""
                    if result['min_date'] and result['max_date']:
                        try:
                            start_dt = datetime.fromisoformat(result['min_date'].replace('Z', '+00:00'))
                            end_dt = datetime.fromisoformat(result['max_date'].replace('Z', '+00:00'))
                            date_display = f"({start_dt.strftime('%Y-%m-%d')} to {end_dt.strftime('%Y-%m-%d')})"
                        except Exception:
                            date_display = f"({result['min_date']} to {result['max_date']})"
                    
                    trading_tables.append({
                        'table_name': table_name,
                        'instrument': instrument,
                        'record_count': result['count'],
                        'date_range': {'start': result['min_date'], 'end': result['max_date']},
                        'display_name': f"{instrument} {date_display}" if date_display else f"{instrument} ({result['count']:,} bars)"
                    })
                    
                except sqlite3.Error as e:
                    logger.warning(f"Error checking table {table_name}: {e}")
                    continue
            
            # Sort by instrument name
            trading_tables.sort(key=lambda x: x['instrument'])
            logger.info(f"Detected {len(trading_tables)} trading tables")
            return tuple(trading_tables)  # Return tuple for caching
            
    except Exception as e:
        logger.error(f"Error detecting trading tables: {e}")
        return tuple()

def aggregate_timeframe_data(table_name: str, timeframe: str, start_date: Optional[str] = None, 
                           end_date: Optional[str] = None, limit: int = MAX_DATA_POINTS) -> List[Dict[str, Any]]:
    """Optimized data aggregation with limits and better performance"""
    
    intervals = {
        '1min': 1, '5min': 5, '15min': 15, '30min': 30,
        '60min': 60, '120min': 120, '240min': 240, '1day': 1440
    }
    
    if timeframe not in intervals:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    
    interval_minutes = intervals[timeframe]
    
    # Build optimized query with proper indexing hints
    date_conditions = []
    params = []
    
    if start_date:
        date_conditions.append("bar_end_datetime >= ?")
        params.append(f"{start_date} 00:00:00")
    
    if end_date:
        date_conditions.append("bar_end_datetime <= ?")
        params.append(f"{end_date} 23:59:59")
    
    where_clause = " AND ".join(date_conditions) if date_conditions else "1=1"
    
    if interval_minutes == 1440:  # Daily aggregation
        query = f"""
            WITH ordered_data AS (
                SELECT 
                    DATE(bar_end_datetime) as period,
                    bar_end_datetime,
                    open_price, high_price, low_price, close_price, volume,
                    ROW_NUMBER() OVER (PARTITION BY DATE(bar_end_datetime) ORDER BY bar_end_datetime ASC) as rn_first,
                    ROW_NUMBER() OVER (PARTITION BY DATE(bar_end_datetime) ORDER BY bar_end_datetime DESC) as rn_last
                FROM [{table_name}]
                WHERE {where_clause}
            )
            SELECT 
                period,
                AVG(CASE WHEN rn_first = 1 THEN open_price END) as open_price,
                MAX(high_price) as high_price,
                MIN(low_price) as low_price,
                AVG(CASE WHEN rn_last = 1 THEN close_price END) as close_price,
                SUM(CAST(volume as INTEGER)) as volume,
                COUNT(*) as bar_count
            FROM ordered_data
            GROUP BY period
            ORDER BY period ASC
            LIMIT ?
        """
        params.append(limit)
    else:
        # Minute-based aggregation with optimized grouping
        query = f"""
            WITH time_groups AS (
                SELECT 
                    datetime(
                        strftime('%Y-%m-%d %H:', bar_end_datetime) || 
                        printf('%02d', (CAST(strftime('%M', bar_end_datetime) as INTEGER) / {interval_minutes}) * {interval_minutes}) || 
                        ':00'
                    ) as period,
                    bar_end_datetime,
                    open_price, high_price, low_price, close_price, volume,
                    ROW_NUMBER() OVER (PARTITION BY datetime(
                        strftime('%Y-%m-%d %H:', bar_end_datetime) || 
                        printf('%02d', (CAST(strftime('%M', bar_end_datetime) as INTEGER) / {interval_minutes}) * {interval_minutes}) || 
                        ':00'
                    ) ORDER BY bar_end_datetime ASC) as rn_first,
                    ROW_NUMBER() OVER (PARTITION BY datetime(
                        strftime('%Y-%m-%d %H:', bar_end_datetime) || 
                        printf('%02d', (CAST(strftime('%M', bar_end_datetime) as INTEGER) / {interval_minutes}) * {interval_minutes}) || 
                        ':00'
                    ) ORDER BY bar_end_datetime DESC) as rn_last
                FROM [{table_name}]
                WHERE {where_clause}
            )
            SELECT 
                period,
                AVG(CASE WHEN rn_first = 1 THEN open_price END) as open_price,
                MAX(high_price) as high_price,
                MIN(low_price) as low_price,
                AVG(CASE WHEN rn_last = 1 THEN close_price END) as close_price,
                SUM(CAST(volume as INTEGER)) as volume,
                COUNT(*) as bar_count
            FROM time_groups
            GROUP BY period
            ORDER BY period ASC
            LIMIT ?
        """
        params.append(limit)
    
    with db_manager.get_connection() as conn:
        cursor = conn.execute(query, params)
        rows = cursor.fetchall()
    
    data = []
    for row in rows:
        data.append({
            'datetime': row['period'],
            'open': float(row['open_price']) if row['open_price'] else 0,
            'high': float(row['high_price']) if row['high_price'] else 0,
            'low': float(row['low_price']) if row['low_price'] else 0,
            'close': float(row['close_price']) if row['close_price'] else 0,
            'volume': int(row['volume']) if row['volume'] else 0,
            'bar_count': row['bar_count']
        })
    
    return data

def create_drawings_table():
    """Create the saved_drawings table with proper indexing"""
    with db_manager.get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS saved_drawings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                layout INTEGER DEFAULT 1,
                instruments TEXT,
                timeframe TEXT DEFAULT '1min',
                start_date TEXT,
                end_date TEXT,
                drawings_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Create indexes for better performance
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_drawings_created_at 
            ON saved_drawings(created_at DESC)
        """)
        
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_drawings_name 
            ON saved_drawings(name)
        """)
        
        conn.commit()
    logger.info("Created saved_drawings table with indexes")

# Routes with enhanced error handling and performance optimizations

@app.route('/')
def index() -> str:
    return render_template('index.html')

@app.route('/api/instruments')
@handle_db_errors
def get_instruments() -> Response:
    """Get all available trading instruments with caching"""
    logger.info("Instruments API endpoint called")
    instruments = list(detect_trading_tables())  # Convert tuple back to list
    return jsonify(instruments)

@app.route('/api/data/<table_name>')
@handle_db_errors
def get_data(table_name: str) -> Union[Response, Tuple[Response, int]]:
    """Get data from a specific table with enhanced validation and limits"""
    logger.info(f"Data API endpoint called for table: {table_name}")
    
    # Validate table name to prevent SQL injection
    if not table_name.replace('_', '').replace('-', '').isalnum():
        return jsonify({'error': 'Invalid table name format'}), 400
    
    with db_manager.get_connection() as conn:
        # Security check - ensure table exists
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", 
            (table_name,)
        )
        if not cursor.fetchone():
            return jsonify({'error': f'Table {table_name} not found'}), 404
    
    timeframe = request.args.get('timeframe', '1min')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    limit = min(int(request.args.get('limit', MAX_DATA_POINTS)), MAX_DATA_POINTS)
    
    logger.info(f"Query parameters: table={table_name}, timeframe={timeframe}, "
                f"start_date={start_date}, end_date={end_date}, limit={limit}")
    
    try:
        if timeframe == 'raw':
            # Handle raw data with pagination
            date_conditions = []
            params = []
            
            if start_date:
                date_conditions.append("bar_end_datetime >= ?")
                params.append(f"{start_date} 00:00:00")
            
            if end_date:
                date_conditions.append("bar_end_datetime <= ?")
                params.append(f"{end_date} 23:59:59")
            
            where_clause = " AND ".join(date_conditions) if date_conditions else "1=1"
            
            query = f"""
                SELECT bar_end_datetime, open_price, high_price, low_price, close_price, volume
                FROM [{table_name}] 
                WHERE {where_clause}
                ORDER BY bar_end_datetime ASC
                LIMIT ?
            """
            params.append(limit)
            
            with db_manager.get_connection() as conn:
                cursor = conn.execute(query, params)
                rows = cursor.fetchall()
            
            data = []
            for row in rows:
                data.append({
                    'datetime': row['bar_end_datetime'],
                    'open': float(row['open_price']) if row['open_price'] else 0,
                    'high': float(row['high_price']) if row['high_price'] else 0,
                    'low': float(row['low_price']) if row['low_price'] else 0,
                    'close': float(row['close_price']) if row['close_price'] else 0,
                    'volume': int(row['volume']) if row['volume'] else 0
                })
        else:
            data = aggregate_timeframe_data(table_name, timeframe, start_date, end_date, limit)
        
        logger.info(f"Returning {len(data)} data points for {timeframe} timeframe")
        response = jsonify(data)
        response.headers['Cache-Control'] = 'public, max-age=300'  # Cache for 5 minutes
        return response
        
    except Exception as e:
        logger.error(f"Error getting table data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/drawings', methods=['GET'])
@handle_db_errors
def get_saved_drawings() -> Response:
    """Get all saved drawing sets with pagination"""
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 50)), 100)
    offset = (page - 1) * per_page
    
    with db_manager.get_connection() as conn:
        # Get total count
        count_cursor = conn.execute("SELECT COUNT(*) as total FROM saved_drawings")
        total = count_cursor.fetchone()['total']
        
        # Get paginated results
        cursor = conn.execute("""
            SELECT id, name, created_at, layout, instruments, timeframe
            FROM saved_drawings 
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (per_page, offset))
        
        drawings = []
        for row in cursor.fetchall():
            drawings.append({
                'id': row['id'],
                'name': row['name'],
                'created_at': row['created_at'],
                'layout': row['layout'],
                'instruments': row['instruments'],
                'timeframe': row['timeframe']
            })
    
    return jsonify({
        'drawings': drawings,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'pages': (total + per_page - 1) // per_page
        }
    })

@app.route('/api/drawings', methods=['POST'])
@handle_db_errors
def save_drawings() -> Union[Response, Tuple[Response, int]]:
    """Save a new drawing set with validation"""
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400
    
    # Validate input
    name = str(data['name']).strip()
    if not name or len(name) > 255:
        return jsonify({'error': 'Invalid name length (1-255 characters)'}), 400
    
    layout = int(data.get('layout', 1))
    if layout not in [1, 2]:
        layout = 1
    
    instruments = data.get('instruments', [])
    if not isinstance(instruments, list):
        instruments = []
    
    timeframe = data.get('timeframe', '1min')
    if timeframe not in ['raw', '1min', '5min', '15min', '30min', '60min', '120min', '240min', '1day']:
        timeframe = '1min'
    
    try:
        drawings_data = json.dumps(data.get('drawings', []))
    except (TypeError, ValueError):
        return jsonify({'error': 'Invalid drawings data format'}), 400
    
    with db_manager.get_connection() as conn:
        cursor = conn.execute("""
            INSERT INTO saved_drawings 
            (name, layout, instruments, timeframe, start_date, end_date, drawings_data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            name, layout, ','.join(instruments), timeframe,
            data.get('start_date'), data.get('end_date'), drawings_data
        ))
        conn.commit()
        drawing_id = cursor.lastrowid
    
    return jsonify({'id': drawing_id, 'message': 'Drawings saved successfully'})

@app.route('/api/drawings/<int:drawing_id>')
@handle_db_errors
def get_drawing(drawing_id: int) -> Union[Response, Tuple[Response, int]]:
    """Get a specific drawing set"""
    if drawing_id <= 0:
        return jsonify({'error': 'Invalid drawing ID'}), 400
    
    with db_manager.get_connection() as conn:
        cursor = conn.execute("""
            SELECT * FROM saved_drawings WHERE id = ? LIMIT 1
        """, (drawing_id,))
        row = cursor.fetchone()
    
    if not row:
        return jsonify({'error': 'Drawing not found'}), 404
    
    try:
        drawings_data = json.loads(row['drawings_data']) if row['drawings_data'] else []
    except (json.JSONDecodeError, TypeError):
        drawings_data = []
    
    drawing_data = {
        'id': row['id'],
        'name': row['name'],
        'layout': row['layout'],
        'instruments': row['instruments'].split(',') if row['instruments'] else [],
        'timeframe': row['timeframe'],
        'start_date': row['start_date'],
        'end_date': row['end_date'],
        'drawings': drawings_data,
        'created_at': row['created_at']
    }
    
    return jsonify(drawing_data)

@app.route('/api/drawings/<int:drawing_id>', methods=['DELETE'])
@handle_db_errors
def delete_drawing(drawing_id: int) -> Union[Response, Tuple[Response, int]]:
    """Delete a drawing set"""
    if drawing_id <= 0:
        return jsonify({'error': 'Invalid drawing ID'}), 400
    
    with db_manager.get_connection() as conn:
        cursor = conn.execute("DELETE FROM saved_drawings WHERE id = ?", (drawing_id,))
        conn.commit()
    
    if cursor.rowcount == 0:
        return jsonify({'error': 'Drawing not found'}), 404
    
    return jsonify({'message': 'Drawing deleted successfully'})

@app.route('/download/<table_name>')
@handle_db_errors
def download_data(table_name: str) -> Union[Response, Tuple[Response, int]]:
    """Download data with format validation and limits"""
    # Validate table name
    if not table_name.replace('_', '').replace('-', '').isalnum():
        return jsonify({'error': 'Invalid table name format'}), 400
    
    format_type = request.args.get('format', 'csv').lower()
    if format_type not in ['csv', 'json']:
        return jsonify({'error': 'Unsupported format. Use csv or json'}), 400
    
    timeframe = request.args.get('timeframe', '1min')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    limit = min(int(request.args.get('limit', MAX_DATA_POINTS)), MAX_DATA_POINTS)
    
    logger.info(f"Download requested: table={table_name}, format={format_type}, "
                f"timeframe={timeframe}, limit={limit}")
    
    # Verify table exists
    with db_manager.get_connection() as conn:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", 
            (table_name,)
        )
        if not cursor.fetchone():
            return jsonify({'error': f'Table {table_name} not found'}), 404
    
    try:
        if timeframe == 'raw':
            date_conditions = []
            params = []
            
            if start_date:
                date_conditions.append("bar_end_datetime >= ?")
                params.append(f"{start_date} 00:00:00")
            
            if end_date:
                date_conditions.append("bar_end_datetime <= ?")
                params.append(f"{end_date} 23:59:59")
            
            where_clause = " AND ".join(date_conditions) if date_conditions else "1=1"
            
            query = f"SELECT * FROM [{table_name}] WHERE {where_clause} ORDER BY bar_end_datetime ASC LIMIT ?"
            params.append(limit)
            
            with db_manager.get_connection() as conn:
                cursor = conn.execute(query, params)
                data = [dict(row) for row in cursor.fetchall()]
        else:
            aggregated_data = aggregate_timeframe_data(table_name, timeframe, start_date, end_date, limit)
            data = []
            for row in aggregated_data:
                data.append({
                    'bar_end_datetime': row['datetime'],
                    'open_price': row['open'],
                    'high_price': row['high'],  
                    'low_price': row['low'],
                    'close_price': row['close'],
                    'volume': row['volume'],
                    'timeframe': timeframe,
                    'bar_count': row.get('bar_count', 1)
                })
    
    except Exception as e:
        logger.error(f"Error preparing download data: {e}")
        return jsonify({'error': str(e)}), 500
    
    # Generate filename
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename_base = f'{table_name}_{timeframe}_{timestamp}'
    if start_date and end_date:
        filename_base = f'{table_name}_{timeframe}_{start_date}_to_{end_date}_{timestamp}'
    
    if format_type == 'csv':
        output = io.StringIO()
        if data:
            fieldnames = data[0].keys()
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(data)
        
        response = Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename="{filename_base}.csv"',
                'Content-Type': 'text/csv; charset=utf-8'
            }
        )
        return response
    
    elif format_type == 'json':
        output = json.dumps(data, indent=2, default=str)
        
        response = Response(
            output,
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename="{filename_base}.json"',
                'Content-Type': 'application/json; charset=utf-8'
            }
        )
        return response

@app.route('/health')
def health_check() -> Response:
    """Enhanced health check with database connectivity and performance metrics"""
    start_time = time.time()
    
    health_data = {
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'version': '2.0.0',
        'database_connected': False,
        'response_time_ms': 0,
        'active_connections': 0
    }
    
    try:
        with db_manager.get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
            table_count = cursor.fetchone()['count']
            health_data['database_connected'] = True
            health_data['table_count'] = table_count
            
    except Exception as e:
        health_data['status'] = 'unhealthy'
        health_data['database_error'] = str(e)
    
    health_data['response_time_ms'] = round((time.time() - start_time) * 1000, 2)
    
    status_code = 200 if health_data['status'] == 'healthy' else 503
    return jsonify(health_data), status_code

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'Request payload too large'}), 413

@app.before_request
def before_request():
    """Request preprocessing and rate limiting could be added here"""
    pass

@app.after_request
def after_request(response):
    """Add security headers and CORS if needed"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response

# Initialize on startup
def initialize_app() -> None:
    """Initialize the application with enhanced error handling"""
    logger.info("[START] Multi-Instrument Trading Data Viewer v2.0 starting up...")
    
    try:
        # Create logs directory
        os.makedirs('logs', exist_ok=True)
        
        # Create drawings table
        create_drawings_table()
        
        # Detect instruments and validate database
        instruments = detect_trading_tables()
        if instruments:
            logger.info(f"[SUCCESS] Found {len(instruments)} trading instruments:")
            for inst in instruments:
                logger.info(f"  - {inst['display_name']}")
        else:
            logger.warning("[WARNING] No trading instruments found!")
        
        logger.info("[SUCCESS] Application initialized successfully!")
        
    except Exception as e:
        logger.error(f"[ERROR] Initialization failed: {e}")
        raise

# Call initialization when module is loaded
if __name__ == '__main__':
    initialize_app()
    app.run(debug=False, threaded=True, host='127.0.0.1', port=5000)
else:
    initialize_app()