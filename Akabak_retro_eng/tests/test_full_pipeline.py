"""Full pipeline test: template -> 3 ducts + 1 radiator + wires -> apply -> rename"""
import subprocess, sys, os, shutil

TOOL = "akabak_tool_v2.py"
TPL  = "templates/TEMPLATE_FINAL.akp"
OUT  = "tests/TEST_PIPELINE_FULL.akp"
BLOBS = "blobs/"

steps = [
    # Step 1: Copy template
    ("copy", None),
    # Step 2: batch-insert 3 ducts at the front
    ("batch-insert", [OUT, OUT, "--blob", BLOBS+"duct_formula_ref.akb", "-n", "3",
                      "--start-x", "16", "--start-y", "9"]),
    # Step 3: insert radiator
    ("insert", [OUT, OUT, "--blob", BLOBS+"radiator_ref.akb", "--pos", "22,9"]),
    # Step 4: batch-insert 3 ducts at the back
    ("batch-insert", [OUT, OUT, "--blob", BLOBS+"duct_formula_ref.akb", "-n", "3",
                      "--start-x", "16", "--start-y", "21"]),
    # Step 5: List to verify
    ("list", [OUT]),
]

def run_step(name, args):
    if name == "copy":
        shutil.copy2(TPL, OUT)
        print(f"=== COPY {TPL} -> {OUT} ===")
        return True
    cmd = [sys.executable, TOOL, name] + args
    print(f"\n=== {name.upper()} ===")
    print(f"  cmd: {' '.join(cmd)}")
    r = subprocess.run(cmd, capture_output=True, text=True)
    print(r.stdout)
    if r.stderr:
        print("STDERR:", r.stderr)
    if r.returncode != 0:
        print(f"FAILED (exit {r.returncode})")
        return False
    return True

for name, args in steps:
    if not run_step(name, args):
        print("Pipeline ABORTED")
        sys.exit(1)

# Verify file size is reasonable
sz = os.path.getsize(OUT)
print(f"\nFinal file: {OUT} ({sz} bytes)")
if sz > 145000:
    print("OK - file size looks reasonable")
else:
    print("WARNING - file seems too small")
