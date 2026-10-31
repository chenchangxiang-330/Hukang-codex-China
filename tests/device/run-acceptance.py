"""Run independent UI / offline suites on isolated copies of the same APK."""
import json
import os
import subprocess
from pathlib import Path

results = {}
scripts = {'ui': ['nutrition-ui-v2-device.py'], 'offline': ['simple-device.py'],
           'all': ['nutrition-ui-v2-device.py', 'simple-device.py']}
for script in scripts[os.environ.get('HUKANG_DEVICE_SUITE', 'all')]:
    results[script] = subprocess.run(['python3', str(Path(__file__).with_name(script))]).returncode
    print(json.dumps(results), flush=True)
Path('artifacts/device/suite-results.json').write_text(json.dumps(results, indent=2))
raise SystemExit(0 if all(code == 0 for code in results.values()) else 1)
