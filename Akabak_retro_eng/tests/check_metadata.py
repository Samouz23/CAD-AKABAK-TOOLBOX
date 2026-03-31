"""Quick script to verify critical metadata fields in an .akp file."""
import struct, sys, os

def read_u32(d, off): return struct.unpack_from('<I', d, off)[0]
def read_u64(d, off): return struct.unpack_from('<Q', d, off)[0]

filepath = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ['TEMP'], 'test_single.akp')

with open(filepath, 'rb') as f:
    data = f.read()

comp_types = [b'DynDriver', b'Duct', b'Waveguide', b'Filter',
              b'Transform', b'Source', b'Resistor', b'Radiator',
              b'Encl', b'EnclVented', b'MassAcou', b'GND']

# Find all components (templates only — first occurrence at LPS-verified position)
all_comps = []
for t in comp_types:
    pos = data.find(t, 0x1000)
    while pos > 0:
        if pos >= 4 and read_u32(data, pos - 4) == len(t):
            all_comps.append((pos, t.decode()))
        pos = data.find(t, pos + 1)

all_comps.sort()
print(f"File: {filepath} ({len(data)} bytes)")
print(f"Found {len(all_comps)} component strings (templates + instances)")

# The first component is the one at the lowest offset
if not all_comps:
    print("ERROR: No components found!")
    sys.exit(1)

first_comp = all_comps[0][0]
first_name = all_comps[0][1]
print(f"\nFirst component: {first_name} at 0x{first_comp:05X}")

count = read_u32(data, first_comp - 20)
block_end = read_u32(data, first_comp - 28)
after_name = read_u64(data, first_comp - 12)
name_len = read_u32(data, first_comp - 4)
expected_after = first_comp + name_len

print(f"  count     = {count}")
print(f"  block_end = 0x{block_end:06X}")
print(f"  after_name = 0x{after_name:06X} (expect 0x{expected_after:06X}) {'OK' if after_name == expected_after else 'MISMATCH!'}")
print(f"  name_len  = {name_len}")

# Verify block_end points to valid pattern
be_bytes = data[block_end:block_end+24]
print(f"  block_end region: {be_bytes.hex()}")
is_65_65 = be_bytes[:4] == b'\x65\x00\x00\x00' and be_bytes[4:8] == b'\x65\x00\x00\x00'
print(f"  block_end starts with [65 65]: {is_65_65}")

# Check all [65 65 u32 0000] patterns for validity
tag65 = b'\x65\x00\x00\x00'
zeros4 = b'\x00\x00\x00\x00'
tag68 = b'\x68\x00\x00\x00'

bad_count = 0
for i in range(len(data) - 16):
    if data[i+12:i+16] == zeros4:
        is_6565 = data[i:i+4] == tag65 and data[i+4:i+8] == tag65
        is_6865 = data[i:i+4] == tag68 and data[i+4:i+8] == tag65
        if is_6565 or is_6865:
            val = read_u32(data, i+8)
            if val > 0 and val > len(data):
                bad_count += 1
                typ = '65_65' if is_6565 else '68_65'
                print(f"  BAD raw u32 at 0x{i:05X} [{typ}]: val=0x{val:06X} > filesize=0x{len(data):06X}")

if bad_count == 0:
    print(f"\n  All raw u32 patterns valid (values within file bounds)")
else:
    print(f"\n  FOUND {bad_count} BAD raw u32 patterns!")
