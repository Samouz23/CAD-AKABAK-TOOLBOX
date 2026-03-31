"""Test: raw_constants with // comments preserved in .akp file."""
import sys, os, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from akabak_tool_v2 import AkpFile, apply_config, parse_config

tool_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
template = os.path.join(tool_dir, 'templates', 'TEMPLATE_FINAL.akp')
duct_blob = os.path.join(tool_dir, 'blobs', 'duct_formula_ref.akb')
encl_blob = os.path.join(tool_dir, 'blobs', 'encl_formula_ref.akb')

# Step 1: batch-insert 1 duct
tmp1 = os.path.join(tempfile.gettempdir(), 'test_raw1.akp')
os.system(f'python "{os.path.join(tool_dir, "akabak_tool_v2.py")}" batch-insert "{template}" "{tmp1}" --blob "{duct_blob}" --count 1 --start-x 64 --start-y 10')

# Step 2: batch-insert 1 encl
tmp2 = os.path.join(tempfile.gettempdir(), 'test_raw2.akp')
os.system(f'python "{os.path.join(tool_dir, "akabak_tool_v2.py")}" batch-insert "{tmp1}" "{tmp2}" --blob "{encl_blob}" --count 1 --start-x 64 --start-y 16')

# Step 3: apply config with [raw_constants]
ini_content = """[raw_constants]
// HP UTILISE : [TestDriver]
SDf=550
SDr=550
Mms=76
fs=48
Qms=6.5
Re=5
BL=23
Le=1.1

// Global Dimensions (Height)
H = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS

// Largeurs des Ducts (D)
D1 = 140

// Longueurs des Ducts (DL)
DL1 = 205

// Enclosure Definition
Vb=50*@N
Lb=300

[Duct.0]
WD  = @D1
HD  = @H
Len = @DL1
eta = @WOOD
Vf = 0
Visc = 1

[Encl.0]
Vb   = @Vb
Lb   = @Lb
etab = @WOOD

[names]
Duct.0 = Du1
Encl.0 = Enc1
"""

ini_path = os.path.join(tempfile.gettempdir(), 'test_raw_config.ini')
with open(ini_path, 'w', encoding='utf-8') as f:
    f.write(ini_content)

tmp3 = os.path.join(tempfile.gettempdir(), 'test_raw3.akp')
shutil.copy2(tmp2, tmp3)

akp = AkpFile.from_file(tmp3)
config = parse_config(ini_path)
print("\n=== Applying config (raw_constants) ===")
changes = apply_config(akp, config)
akp.save(tmp3)
print(f"\nTotal changes: {changes}")

# Verify
print("\n=== Verifying result ===")
akp2 = AkpFile.from_file(tmp3)
comps = akp2.get_components()
for c in comps:
    print(f"  {c['type']:15s} ({c['short_name']:10s})", end='')
    if 'formula_text' in c:
        ftxt = c['formula_text'][:80].replace('\r\n', ' | ')
        print(f"  formula: {ftxt}", end='')
    print()

cb = akp2.get_constants_block()
if cb:
    print(f"\n=== Constants block (first 500 chars) ===")
    print(cb[2][:500])

# Check: Does the constants block contain // comments?
if cb and '//' in cb[2]:
    print("\n[PASS] // comments preserved in constants block!")
else:
    print("\n[FAIL] // comments NOT found in constants block")

# Check: Does duct formula contain Visc = 1?
for c in comps:
    if c['type'] == 'Duct' and 'formula_text' in c:
        if 'Visc = 1' in c['formula_text']:
            print("[PASS] Duct has Visc = 1")
        else:
            print(f"[FAIL] Duct formula missing Visc = 1: {c['formula_text']}")
        if 'Vf = 0' in c['formula_text']:
            print("[PASS] Duct has Vf = 0")
        else:
            print(f"[FAIL] Duct formula missing Vf = 0: {c['formula_text']}")

# Cleanup
for f in [tmp1, tmp2, tmp3, ini_path]:
    try: os.remove(f)
    except: pass
