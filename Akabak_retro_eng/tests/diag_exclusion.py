import struct

with open('blobs/radiator_ref.akb', 'rb') as f:
    raw = f.read()
blob = raw[8:]
src = 0x18F60

POINTER_TAGS = {0x66, 0x67, 0x68, 0x69}

# Build in_ptr_u64 exclusion set (same logic as akabak_tool)
excluded = set()
for i in range(len(blob) - 11):
    if (blob[i] in POINTER_TAGS and blob[i+1]==0 and blob[i+2]==0 and blob[i+3]==0):
        for j in range(i+4, min(i+12, len(blob))):
            excluded.add(j)

# Find TAG_65s that are blocked
tag65 = b'\x65\x00\x00\x00'
blocked = []
for i in range(len(blob) - 12):
    if blob[i:i+4] == tag65 and i in excluded:
        val32 = struct.unpack_from('<I', blob, i+4)[0]
        zeros = blob[i+8:i+12] == b'\x00\x00\x00\x00'
        blocked.append((i, val32, zeros))

print(f"TAG_65 positions blocked by in_ptr_u64: {len(blocked)}")
for off, val, zz in blocked:
    is_ptr = 0x18000 <= val <= 0x1A000
    pfx = blob[off-4:off].hex()
    print(f"  0x{off:04X}: u32=0x{val:08X} is_ptr={is_ptr} zeros_after={zz} prefix={pfx}")
    if is_ptr and zz:
        print(f"    *** THIS POINTER IS MISSED! ***")
