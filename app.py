"""
File Integrity Checker — Flask Web Application
Minor Project | Python + Flask + hashlib
Algorithms: MD5, SHA-256, SHA-512, SHA3-256
Vercel-compatible serverless build
"""

from flask import Flask, render_template, request, jsonify, send_file
import hashlib
import io
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB (Vercel limit)

ALGORITHMS = ['MD5', 'SHA-256', 'SHA-512', 'SHA3-256']

session_history = []


def compute_hash(file_bytes: bytes, algorithm: str) -> str:
    algo_map = {
        'MD5':      hashlib.md5,
        'SHA-256':  hashlib.sha256,
        'SHA-512':  hashlib.sha512,
        'SHA3-256': hashlib.sha3_256,
    }
    h = algo_map[algorithm]()
    h.update(file_bytes)
    return h.hexdigest()


def format_size(n: int) -> str:
    for unit in ['B', 'KB', 'MB', 'GB']:
        if n < 1024:
            return f"{n:.1f} {unit}" if unit != 'B' else f"{n} B"
        n /= 1024
    return f"{n:.1f} TB"


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/generate', methods=['POST'])
def generate():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    algos = request.form.getlist('algorithms')
    if not algos:
        algos = ['SHA-256']
    file_bytes = f.read()
    filename = secure_filename(f.filename)
    size = len(file_bytes)
    results = {}
    for algo in algos:
        if algo in ALGORITHMS:
            results[algo] = compute_hash(file_bytes, algo)
    entry = {
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'filename': filename,
        'size': format_size(size),
        'hashes': results
    }
    session_history.append(entry)
    return jsonify({
        'filename': filename,
        'size': format_size(size),
        'size_bytes': size,
        'hashes': results,
        'timestamp': entry['timestamp']
    })


@app.route('/api/verify', methods=['POST'])
def verify():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    f = request.files['file']
    algo = request.form.get('algorithm', 'SHA-256')
    expected = request.form.get('expected_hash', '').strip().lower()
    file_bytes = f.read()
    filename = secure_filename(f.filename)
    computed = compute_hash(file_bytes, algo)
    matched = computed == expected
    return jsonify({
        'filename': filename,
        'algorithm': algo,
        'computed': computed,
        'expected': expected,
        'matched': matched
    })


@app.route('/api/compare', methods=['POST'])
def compare():
    if 'file_a' not in request.files or 'file_b' not in request.files:
        return jsonify({'error': 'Two files required'}), 400
    fa = request.files['file_a'].read()
    fb = request.files['file_b'].read()
    name_a = secure_filename(request.files['file_a'].filename)
    name_b = secure_filename(request.files['file_b'].filename)
    results = []
    all_match = True
    for algo in ALGORITHMS:
        ha = compute_hash(fa, algo)
        hb = compute_hash(fb, algo)
        match = ha == hb
        if not match:
            all_match = False
        results.append({'algorithm': algo, 'hash_a': ha, 'hash_b': hb, 'match': match})
    return jsonify({
        'file_a': name_a,
        'file_b': name_b,
        'size_a': format_size(len(fa)),
        'size_b': format_size(len(fb)),
        'results': results,
        'all_match': all_match
    })


@app.route('/api/history')
def history():
    return jsonify(session_history)


@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    session_history.clear()
    return jsonify({'status': 'cleared'})


@app.route('/api/report', methods=['POST'])
def download_report():
    data = request.json
    lines = [
        "=" * 60,
        "  FILE INTEGRITY REPORT",
        "=" * 60,
        f"  File      : {data.get('filename', 'N/A')}",
        f"  Size      : {data.get('size', 'N/A')}",
        f"  Generated : {data.get('timestamp', 'N/A')}",
        "=" * 60,
        ""
    ]
    for algo, h in data.get('hashes', {}).items():
        lines.append(f"  {algo:<12}: {h}")
    lines += ["", "=" * 60]
    content = "\n".join(lines)
    buf = io.BytesIO(content.encode())
    buf.seek(0)
    safe_name = data.get('filename', 'file').replace(' ', '_')
    return send_file(buf, as_attachment=True,
                     download_name=f"integrity_report_{safe_name}.txt",
                     mimetype='text/plain')


if __name__ == '__main__':
    print("\n  ================================")
    print("    File Integrity Checker")
    print("    http://127.0.0.1:5000")
    print("  ================================\n")
    app.run(debug=True, port=5000)
