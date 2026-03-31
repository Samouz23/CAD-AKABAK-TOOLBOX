"""Scan the Radiator blob for real tagged pointers (tag u32 + u64 value)."""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from akabak_tool_v2 import read_u32, read_u64, is_tag, TAG_NIL, TAG_REF66, TAG_REF67, TAG_BLOCK, TAG_REF69

POINTER_TAGS = {TAG_REF66, TAG_REF67, TAG_REF69}

akb_path = os.path.join(os.environ['TEMP'], 'radiator_raw.akb')
akb = open(akb_path, 'rb').read()
blob = bytearray(akb[8:])
src_off = struct.unpack('<I', akb[4:8])[0]
blob_end = src_off + len(blob)
print(f'Blob: {len(blob)}B, src_off=0x{src_off:06X}, blob_end=0x{blob_end:06X}')

# Scan for tagged pointers: tag_u32 followed by u64 that looks like absolute file offset
print('\nTagged pointers found:')
template_ptrs = []
instance_ptrs = []
t_size = 322  # expected template_size

for i in range(len(blob) - 11):
    if is_tag(blob, i) and blob[i] in POINTER_TAGS:
        val = read_u64(blob, i + 4)
        # Check if it's a plausible absolute file offset
        if 0x1000 <= val <= 0x200000:
            in_range = src_off <= val <= blob_end + 0x1000
            region = 'template' if (i + 4) < t_size else 'instance'
            if region == 'template':
                template_ptrs.append(i + 4)
            else:
                instance_ptrs.append(i + 4 - t_size)
            print(f'  @blob[0x{i:04X}]: tag=0x{blob[i]:02X} ptr=0x{val:012X}'
                  f' (file 0x{src_off+i:06X}) [{region}] {"IN-RANGE" if in_range else "OUT-OF-RANGE"}')

# Also scan for [65 65 u32 0000] and [68 65 u32 0000] block patterns
print('\nBlock self-ref patterns:')
tag65 = b'\x65\x00\x00\x00'
tag68 = b'\x68\x00\x00\x00'
zeros4 = b'\x00\x00\x00\x00'
for i in range(len(blob) - 16):
    if blob[i+4:i+8] == tag65 and blob[i+12:i+16] == zeros4:
        if blob[i:i+4] == tag65 or blob[i:i+4] == tag68:
            val = read_u32(blob, i + 8)
            if 0x1000 <= val <= 0x200000:
                print(f'  @blob[0x{i:04X}]: [{blob[i]:02X} 65 u32=0x{val:06X} 0000] (file 0x{src_off+i:06X})')

print(f'\nSummary:')
print(f'  Template ptr offsets: {["0x%04X" % p for p in template_ptrs]}')
print(f'  Instance ptr offsets: {["0x%04X" % p for p in instance_ptrs]}')
