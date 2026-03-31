"""Quick test: batch-insert 1 duct + 1 encl, then apply config with names."""
import sys, os, tempfile, shutil
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
# Reuse the tool
parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(parent, 'Akabak_retro_eng'))

from akabak_tool_v2 import AkpFile, apply_config, parse_config
import configparser

# Paths
tool_dir = os.path.dirname(os.path.abspath(__file__))
tool_dir = os.path.dirname(tool_dir)  # up to Akabak_retro_eng
template = os.path.join(tool_dir, 'templates', 'TEMPLATE_FINAL.akp')
duct_blob = os.path.join(tool_dir, 'blobs', 'duct_formula_ref.akb')
encl_blob = os.path.join(tool_dir, 'blobs', 'encl_formula_ref.akb')

# Step 1: batch-insert 1 duct
tmp1 = os.path.join(tempfile.gettempdir(), 'test_step1.akp')
os.system(f'python "{os.path.join(tool_dir, "akabak_tool_v2.py")}" batch-insert "{template}" "{tmp1}" --blob "{duct_blob}" --count 1 --start-x 64 --start-y 10')

# Step 2: batch-insert 1 encl
tmp2 = os.path.join(tempfile.gettempdir(), 'test_step2.akp')
os.system(f'python "{os.path.join(tool_dir, "akabak_tool_v2.py")}" batch-insert "{tmp1}" "{tmp2}" --blob "{encl_blob}" --count 1 --start-x 64 --start-y 16')

# Step 3: apply config
ini_content = """[constants]
SDf = 550
SDr = 550
Mms = 76
fs = 48
Qms = 6.5
Re = 5
BL = 23
Le = 1.1
H = @HEIGHT*@n - (2*@n)*@WOOD_THICKNESS
S1 = 140
D1 = 205
Vb2 = 50
Lb2 = 300

[Duct.0]
WD = @S1
HD = @H
Len = @D1
eta = @WOOD
VF = 0

[Encl.0]
Vb = @Vb2
LenCab = @Lb2
etab = @WOOD

[names]
Duct.0 = Du1
Encl.0 = Enc1
"""

ini_path = os.path.join(tempfile.gettempdir(), 'test_config.ini')
with open(ini_path, 'w', encoding='utf-8') as f:
    f.write(ini_content)

tmp3 = os.path.join(tempfile.gettempdir(), 'test_step3.akp')
shutil.copy2(tmp2, tmp3)

akp = AkpFile.from_file(tmp3)
config = parse_config(ini_path)
print("\n=== Applying config ===")
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
        ftxt = c['formula_text'][:60].replace('\r\n', ' | ')
        print(f"  formula: {ftxt}...", end='')
    print()

cb = akp2.get_constants_block()
if cb:
    print(f"\n=== Constants (first 300 chars) ===")
    print(cb[2][:300])

# Cleanup
for f in [tmp1, tmp2, tmp3, ini_path]:
    try: os.remove(f)
    except: pass
