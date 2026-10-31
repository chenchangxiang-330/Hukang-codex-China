"""Keep independent UI and offline core results even if one suite fails."""
import json
import subprocess
from pathlib import Path

results = {}
for script in ['nutrition-ui-v2-device.py', 'simple-device.py']:
    results[script] = subprocess.run(['python3', str(Path(__file__).with_name(script))]).returncode
    print(json.dumps(results), flush=True)
Path('artifacts/device/suite-results.json').write_text(json.dumps(results, indent=2))
raise SystemExit(0 if all(code == 0 for code in results.values()) else 1)
