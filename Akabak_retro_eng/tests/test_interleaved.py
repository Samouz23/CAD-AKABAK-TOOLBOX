"""Test: interleaved types (Duct, Waveguide, Duct, Waveguide, Duct) + EnclVented.
Verifies that reversed type indices in the config correctly map to file order."""
import sys, os, tempfile, shutil, subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from akabak_tool_v2 import AkpFile, apply_config, parse_config

tool_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
template = os.path.join(tool_dir, 'templates', 'TEMPLATE_FINAL.akp')
duct_blob = os.path.join(tool_dir, 'blobs', 'duct_formula_ref.akb')
wg_blob = os.path.join(tool_dir, 'blobs', 'waveguide_formula_ref.akb')
encl_vented_blob = os.path.join(tool_dir, 'blobs', 'enclvented_formula_ref.akb')
TOOL = os.path.join(tool_dir, 'akabak_tool_v2.py')

steps = []

def next_step(label):
    p = os.path.join(tempfile.gettempdir(), f'test_intlv_{label}.akp')
    steps.append(p)
    return p

# Insert front wave: Duct@64, Wg@72, Duct@80, Wg@88, Duct@96
current = template
for i, (blob, x, y) in enumerate([
    (duct_blob, 64, 10),
    (wg_blob, 72, 9),
    (duct_blob, 80, 10),
    (wg_blob, 88, 9),
    (duct_blob, 96, 10),
]):
    out = next_step(f'front_{i}')
    subprocess.run(['python', TOOL, 'batch-insert', current, out,
                    '--blob', blob, '-n', '1', '--start-x', str(x), '--start-y', str(y)],
                   check=True, capture_output=True)
    current = out

# Insert back wave: EnclVented@64
out = next_step('back_encl')
subprocess.run(['python', TOOL, 'batch-insert', current, out,
                '--blob', encl_vented_blob, '-n', '1', '--start-x', '64', '--start-y', '16'],
               check=True, capture_output=True)
current = out

# Show file order
print("=== FILE ORDER AFTER INSERTIONS ===")
akp = AkpFile.from_file(current)
comps = akp.get_components()
type_counts = {}
for i, c in enumerate(comps):
    t = c['type']
    if t in ('Duct', 'Waveguide', 'EnclVented'):
        idx = type_counts.get(t, 0)
        type_counts[t] = idx + 1
        print(f"  [{i}] {t}.{idx} ({c['short_name'].strip()})")

# Apply config with REVERSED indices
# allSegs = [duct1, wg1, duct2, wg2, duct3, enclVented]
# 3 ducts → duct1=Duct.2, duct2=Duct.1, duct3=Duct.0
# 2 wgs   → wg1=Wg.1, wg2=Wg.0
# 1 encl  → EnclVented.0
ini_content = """[raw_constants]
// HP UTILISE : [18Sound 18NTLW5000_8 (8ohms)]
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
D1 = 200
D2 = 300
D3 = 500

// Longueurs des Ducts (DL)
DL1 = 200
DL2 = 300
DL3 = 200

// Volumes des Ducts (VF)
VF1 = 20

// Horn Width (S)
S1 = 200
S2 = 300
S3 = 500

// Horn Length (L)
L1 = 105
L2 = 105

// T-Factor (T)

// Enclosure Definition
Vb=80*@N
Lb=250
PortLen=200
dD = 90

[Duct.2]
WD  = @D1
HD  = @H
Len = @DL1
eta = @WOOD
Vf = @VF1
Visc = 1

[Waveguide.1]
HTh = @H
HMo = @H
WTh = @S1
WMo = @S2
Len = @L1
T   = @T1
Vf = 0

[Duct.1]
WD  = @D2
HD  = @H
Len = @DL2
eta = @WOOD
Vf = 0
Visc = 1

[Waveguide.0]
HTh = @H
HMo = @H
WTh = @S2
WMo = @S3
Len = @L2
T   = @T2
Vf = 0

[Duct.0]
WD  = @D3
HD  = @H
Len = @DL3
eta = @WOOD
Vf = 0
Visc = 1

[EnclVented.0]
Vb   = @Vb
Lb   = @Lb
etab = @WOOD
Len  = @PortLen
dD   = @dD
etav = @WOOD

[names]
Duct.2 = Du1
Waveguide.1 = Wg1
Duct.1 = Du2
Waveguide.0 = Wg2
Duct.0 = Du3
EnclVented.0 = Enc1
"""

ini_path = os.path.join(tempfile.gettempdir(), 'test_intlv_config.ini')
with open(ini_path, 'w', encoding='utf-8') as f:
    f.write(ini_content)
steps.append(ini_path)

out_final = next_step('configured')
shutil.copy2(current, out_final)
akp = AkpFile.from_file(out_final)
config = parse_config(ini_path)
print("\n=== APPLYING CONFIG ===")
changes = apply_config(akp, config)
akp.save(out_final)
print(f"Total changes: {changes}")

# Verify
print("\n=== RESULT ===")
akp2 = AkpFile.from_file(out_final)
comps2 = akp2.get_components()
for i, c in enumerate(comps2):
    if c['type'] in ('Duct', 'Waveguide', 'EnclVented'):
        formula = c.get('formula_text', '').replace('\r\n', ' | ')[:80]
        print(f"  [{i}] {c['type']:15s} ({c['short_name'].strip():10s}) {formula}")

# Checks
print("\n=== CHECKS ===")
duct_info = [(c['short_name'].strip(), c.get('formula_text', ''))
             for c in comps2 if c['type'] == 'Duct']
wg_info = [(c['short_name'].strip(), c.get('formula_text', ''))
           for c in comps2 if c['type'] == 'Waveguide']
encl_info = [(c['short_name'].strip(), c.get('formula_text', ''))
             for c in comps2 if c['type'] == 'EnclVented']

ok = True

# Duct file order: Duct.0=farthest(Du3), Duct.1=middle(Du2), Duct.2=closest(Du1)
expected_ducts = ['Du3', 'Du2', 'Du1']
actual_ducts = [n for n, _ in duct_info]
if actual_ducts == expected_ducts:
    print(f"[PASS] Duct names: {actual_ducts}")
else:
    print(f"[FAIL] Duct names: expected {expected_ducts}, got {actual_ducts}")
    ok = False

# Duct.0 (Du3) should have @D3 formula
if duct_info and '@D3' in duct_info[0][1]:
    print("[PASS] Duct.0 (Du3) has @D3")
else:
    print(f"[FAIL] Duct.0 formula: {duct_info[0][1][:60] if duct_info else 'MISSING'}")
    ok = False

# Duct.2 (Du1) should have @D1 and @VF1
if len(duct_info) >= 3 and '@D1' in duct_info[2][1] and '@VF1' in duct_info[2][1]:
    print("[PASS] Duct.2 (Du1) has @D1 and @VF1")
else:
    print(f"[FAIL] Duct.2 formula: {duct_info[2][1][:60] if len(duct_info)>=3 else 'MISSING'}")
    ok = False

# Waveguide file order: Wg.0=farthest(Wg2), Wg.1=closest(Wg1)
expected_wgs = ['Wg2', 'Wg1']
actual_wgs = [n for n, _ in wg_info]
if actual_wgs == expected_wgs:
    print(f"[PASS] Waveguide names: {actual_wgs}")
else:
    print(f"[FAIL] Waveguide names: expected {expected_wgs}, got {actual_wgs}")
    ok = False

# Wg.0 (Wg2) should have @S2/@S3
if wg_info and '@S2' in wg_info[0][1] and '@S3' in wg_info[0][1]:
    print("[PASS] Wg.0 (Wg2) has @S2/@S3")
else:
    print(f"[FAIL] Wg.0 formula: {wg_info[0][1][:60] if wg_info else 'MISSING'}")
    ok = False

# EnclVented
expected_encl = ['Enc1']
actual_encl = [n for n, _ in encl_info]
if actual_encl == expected_encl:
    print(f"[PASS] EnclVented names: {actual_encl}")
else:
    print(f"[FAIL] EnclVented names: expected {expected_encl}, got {actual_encl}")
    ok = False

# Check constants block was replaced
cb = akp2.get_constants_block()
if cb and 'D1 = 200' in cb[2] and 'D2 = 300' in cb[2]:
    print("[PASS] Constants replaced correctly")
else:
    print("[FAIL] Constants not replaced")
    ok = False

if ok:
    print("\n>>> ALL CHECKS PASSED <<<")
else:
    print("\n>>> SOME CHECKS FAILED <<<")

# Cleanup
for f in steps:
    try: os.remove(f)
    except: pass
