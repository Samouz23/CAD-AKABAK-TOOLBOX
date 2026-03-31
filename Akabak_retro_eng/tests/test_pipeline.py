"""Simulate the exact IPC handler pipeline to test .akp generation."""
import subprocess, sys, os, tempfile, shutil

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
TOOL_DIR = os.path.join(TOOL_DIR, '..')  # up from tests/
TOOL = os.path.join(TOOL_DIR, 'akabak_tool_v2.py')
TEMPLATE = os.path.join(TOOL_DIR, 'templates', 'TEMPLATE_FINAL.akp')
BLOBS = os.path.join(TOOL_DIR, 'blobs')

def run_tool(args, label=""):
    cmd = [sys.executable, TOOL] + args
    print(f"\n{'='*60}")
    print(f"STEP: {label}")
    print(f"CMD: {' '.join(args[:4])}...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.stdout.strip():
        print(f"STDOUT: {r.stdout.strip()[:300]}")
    if r.stderr.strip():
        print(f"STDERR: {r.stderr.strip()[:300]}")
    if r.returncode != 0:
        print(f"ERROR: return code {r.returncode}")
        sys.exit(1)
    return r

def main():
    tmpdir = tempfile.mkdtemp(prefix='lem_test_')
    print(f"Temp dir: {tmpdir}")
    
    step = [0]
    def next_file(label):
        step[0] += 1
        return os.path.join(tmpdir, f"s{step[0]}_{label}.akp")
    
    current = TEMPLATE
    
    # Step 1: batch-insert 3 ducts (front wave)
    out = next_file("front_ducts")
    run_tool([
        'batch-insert', current, out,
        '--blob', os.path.join(BLOBS, 'duct_formula_ref.akb'),
        '--count', '3',
        '--start-x', '16',
        '--start-y', '9',
    ], "batch-insert 3 front ducts")
    current = out
    
    # Step 2: insert front radiator
    out = next_file("front_rad")
    run_tool([
        'insert', current, out,
        '--blob', os.path.join(BLOBS, 'radiator_ref.akb'),
        '--pos', '40,9',
    ], "insert front radiator")
    current = out
    
    # Step 3: batch-insert 2 ducts (back wave)
    out = next_file("back_ducts")
    run_tool([
        'batch-insert', current, out,
        '--blob', os.path.join(BLOBS, 'duct_formula_ref.akb'),
        '--count', '2',
        '--start-x', '16',
        '--start-y', '21',
    ], "batch-insert 2 back ducts")
    current = out
    
    # Step 4: wire (3 front + 2 back = 5 wires)
    out = next_file("wired")
    run_tool([
        'wire', current, out,
        '--blob', os.path.join(BLOBS, 'wire_ref.akb'),
        '--count', '5',
    ], "wire 5 connections")
    current = out
    
    # Step 5: apply INI config
    ini_content = """[constants]
SDf = 550
SDr = 550
Mms = 76
fs = 48
Qms = 6.5
Re = 5
BL = 23
Le = 1.1

[Duct.0]
WD = @D1
HD = @H
Len = @DL1

[Duct.1]
WD = @D2
HD = @H
Len = @DL2

[Duct.2]
WD = @D3
HD = @H
Len = @DL3

[Duct.3]
WD = @D4
HD = @H
Len = @DL4

[Duct.4]
WD = @D5
HD = @H
Len = @DL5
"""
    ini_path = os.path.join(tmpdir, 'config.ini')
    with open(ini_path, 'w') as f:
        f.write(ini_content)
    
    out = next_file("configured")
    run_tool([
        'apply', current, out,
        '--config', ini_path,
    ], "apply INI config")
    current = out
    
    # Step 6: rename
    final = os.path.join(tmpdir, 'FINAL_LEM.akp')
    run_tool([
        'rename', current, final,
        '--name', 'TestLEM_Pipeline',
    ], "rename project")
    
    # Verify
    print(f"\n{'='*60}")
    print("VERIFICATION")
    run_tool(['list', final], "list final file")
    
    # Copy to easy location
    desktop_copy = os.path.join(os.path.expanduser('~'), 'Desktop', 'TEST_LEM_PIPELINE.akp')
    shutil.copy2(final, desktop_copy)
    print(f"\nFinal file copied to: {desktop_copy}")
    print(f"Size: {os.path.getsize(desktop_copy)} bytes")
    print("\n>>> Please open TEST_LEM_PIPELINE.akp in Akabak to verify <<<")

if __name__ == '__main__':
    main()
