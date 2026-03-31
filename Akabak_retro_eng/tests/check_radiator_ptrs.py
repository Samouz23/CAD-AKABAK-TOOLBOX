"""Check Radiator POINTER_MAP entries against the raw extraction."""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from akabak_tool_v2 import POINTER_MAPS, read_u64

# Load the correct raw extraction
akb_path = os.path.join(os.environ['TEMP'], 'radiator_raw.akb')
akb = open(akb_path, 'rb').read()
blob = bytearray(akb[8:])
src_off = struct.unpack('<I', akb[4:8])[0]
print(f'Blob: {len(blob)}B, src_off=0x{src_off:06X}')

pm = POINTER_MAPS['Radiator']
t_size = pm['template_size']  # 322
i_size = pm['instance_size']  # 1502
print(f'template_size={t_size}, instance_size={i_size}')
print(f'Expected total: {t_size + i_size}')
print(f'Actual blob size: {len(blob)}')

target = 0x17E2D
delta = target - src_off
print(f'Delta for rebase: {delta}')

# Read all u64 pointer values from template_ptrs
print(f'\nTemplate pointers ({len(pm["template_ptrs"])}):')
bad = 0
for pos in pm['template_ptrs']:
    if pos + 8 <= len(blob):
        val = read_u64(blob, pos)
        valid = src_off <= val < src_off + len(blob) + 0x10000
        new_val = val + delta
        flag = "OK" if valid else "SUSPECT"
        if new_val < 0:
            flag = "NEGATIVE!"
            bad += 1
        print(f'  @0x{pos:04X}: 0x{val:012X} -> 0x{new_val & 0xFFFFFFFFFFFFFFFF:012X} {flag}')

# Read all u64 pointer values from instance_ptrs
print(f'\nInstance pointers ({len(pm["instance_ptrs"])}):')
for pos in pm['instance_ptrs']:
    abs_pos = t_size + pos
    if abs_pos + 8 <= len(blob):
        val = read_u64(blob, abs_pos)
        valid = src_off <= val < src_off + len(blob) + 0x10000
        new_val = val + delta
        flag = "OK" if valid else "SUSPECT"
        if new_val < 0:
            flag = "NEGATIVE!"
            bad += 1
        print(f'  @0x{abs_pos:04X} (inst 0x{pos:04X}): 0x{val:012X} -> 0x{new_val & 0xFFFFFFFFFFFFFFFF:012X} {flag}')

print(f'\nTotal problematic entries: {bad}')
