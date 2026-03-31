"""Check wire zone metadata validity."""
import struct, sys, os

def read_u32(d, off): return struct.unpack_from('<I', d, off)[0]
def read_u64(d, off): return struct.unpack_from('<Q', d, off)[0]

filepath = sys.argv[1]
with open(filepath, 'rb') as f:
    data = f.read()

print(f"File: {filepath} ({len(data)} bytes)")

# Find wire zone: search for Wire LPS string after all components
# Wire zone header starts with [68 65 ptr_last_tail u32_count 65 ptr_first]
wire_lps = []
pos = data.find(b'Wire', 0x1000)
while pos > 0:
    if pos >= 4 and read_u32(data, pos - 4) == 4:  # LPS len = 4
        wire_lps.append(pos)
    pos = data.find(b'Wire', pos + 1)

print(f"Found {len(wire_lps)} Wire LPS strings")
if wire_lps:
    # Wire zone header is 32 bytes before the first wire template
    first_wire = wire_lps[0]
    header_start = first_wire - 8  # template starts at LPS, header is -8 for [68 65]
    
    # Actually the header structure is:
    # Each wire pair = 520 bytes. Header is BEFORE pairs.
    # Header: 32 bytes = [68][65][u64 ptr_last_tail][u32 count][65][u64 ptr_first]
    # So header_start = first_wire_template - 32
    hw = first_wire - 8 - 32  # first_wire is the LPS 'Wire' string
    
    # Let's search for the wire count field
    # We know at header + 0x10 = wire_count
    # Let's scan backwards from first wire to find [68 65 ... u32_count 65 ...]
    search_start = max(0, first_wire - 100)
    print(f"\nFirst Wire LPS at 0x{first_wire:05X}")
    
    # The wire zone header is: [68][65][u64_ptr][u32_count][65][u64_ptr]
    # Let me try different offsets
    for back in range(80, 20, -4):
        off = first_wire - back
        if off < 0: continue
        tag68 = read_u32(data, off)
        if tag68 == 0x68:
            tag65 = read_u32(data, off + 4)
            if tag65 == 0x65:
                ptr_last = read_u64(data, off + 8)
                count = read_u32(data, off + 16)
                tag65b = read_u32(data, off + 20)
                ptr_first = read_u64(data, off + 24)
                
                # Validate: count should be reasonable, ptrs within file
                if 0 <= count < 100 and 0 < ptr_first < len(data) and 0 < ptr_last < len(data):
                    print(f"\nWire zone header at 0x{off:05X}:")
                    print(f"  wire_count = {count}")
                    print(f"  ptr_last_tail = 0x{ptr_last:06X} (valid={0 < ptr_last < len(data)})")
                    print(f"  ptr_first = 0x{ptr_first:06X} (valid={0 < ptr_first < len(data)})")
                    
                    # Count actual wire pairs
                    wire_pairs = len(wire_lps) // 2  # template + instance = 2 Wire strings per pair
                    print(f"  Wire LPS count / 2 = {wire_pairs} (should match wire_count)")
                    
                    # Verify first pointer
                    expected_first = first_wire + 4 + 4  # past LPS "Wire" + padding? Actually +8 from wire start
                    print(f"  Expected ptr_first ~ 0x{first_wire + 8:06X}")
                    
                    break
    
    print(f"\nAll Wire LPS positions:")
    for i, wpos in enumerate(wire_lps):
        print(f"  [{i}] 0x{wpos:05X}")
