"""Bounded setup for the disposable rooted Actions emulator, not user phones."""
import subprocess
import time


def ensure_root(adb):
    attempts = []
    for attempt in range(3):
        # adbd restarting as root can close its own connection and return 1.
        # Only the subsequent uid check establishes success.
        root = subprocess.run(adb + ['root'], capture_output=True, timeout=30)
        time.sleep(1)
        subprocess.run(adb + ['wait-for-device'], check=True, capture_output=True, timeout=60)
        uid = subprocess.run(adb + ['shell', 'id', '-u'], capture_output=True, timeout=30)
        attempts.append({'attempt': attempt + 1, 'rootExitCode': root.returncode,
                         'rootOutput': (root.stdout + root.stderr).decode(errors='replace').strip(),
                         'uid': uid.stdout.decode(errors='replace').strip()})
        if uid.returncode == 0 and uid.stdout.strip() == b'0':
            return attempts
    raise RuntimeError('Disposable emulator did not obtain root: ' + repr(attempts))
