"""Compare template radiator blob vs inserted blob to find every missed pointer."""
import struct

def r32(d,p): return struct.unpack_from('<I',d,p)[0]
def r64(d,p): return struct.unpack_from('<Q',d,p)[0]

# Extract the radiator blob as it sits in the template
tmpl = open('templates/TEMPLATE_FINAL.akp','rb').read()
src = 0x18F60
orig = tmpl[src:src+1823]

# Extract the radiator as it sits in TEST_L_RAD after insertion at 0x17E2D
test = open('tests/TEST_L_RAD.akp','rb').read()
dst = 0x17E2D
inserted = test[dst:dst+1823]

delta = dst - src  # -4403

print(f"src=0x{src:06X} dst=0x{dst:06X} delta={delta}")

# Find ALL bytes that differ
diffs = [(i, orig[i], inserted[i]) for i in range(len(orig)) if orig[i] != inserted[i]]
print(f"\nTotal bytes that differ: {len(diffs)}")

# Group diffs by 4-byte alignment
print("\n=== u32 diffs (4-byte aligned) ===")
seen_offsets = set()
for i in range(0, len(orig)-3, 4):
    ov = r32(orig, i)
    nv = r32(inserted, i)
    if ov != nv:
        shifted_delta = nv - ov
        is_delta = (shifted_delta == delta)
        seen_offsets.add(i)
        print(f"  @0x{i:04X}: 0x{ov:08X} -> 0x{nv:08X} (diff={shifted_delta:+d}) {'DELTA' if is_delta else 'OTHER'}")

# Check raw bytes that changed but aren't 4-byte aligned diffs
print("\n=== Byte-level diffs NOT on u32 boundaries ===")
for bpos, ob, nb in diffs:
    aligned = (bpos // 4) * 4
    if aligned not in seen_offsets:
        print(f"  @0x{bpos:04X}: 0x{ob:02X} -> 0x{nb:02X}")

# Now do a thorough search: every u64 in orig that's an absolute offset
# and check if it was correctly adjusted
print("\n=== u64 absolute offset analysis ===")
lo = src
hi = src + 2000
missed = 0
ok_count = 0
for i in range(0, len(orig)-7):
    ov = r64(orig, i)
    if lo <= ov <= hi:
        nv = r64(inserted, i)
        expected = ov + delta
        if nv == expected:
            ok_count += 1
        elif nv == ov:
            print(f"  MISSED @0x{i:04X}: 0x{ov:012X} (not adjusted)")
            # Show surrounding bytes for context
            ctx_start = max(0, i-8)
            print(f"    Context: {orig[ctx_start:i+12].hex()}")
            missed += 1
        else:
            print(f"  WEIRD  @0x{i:04X}: 0x{ov:012X} -> 0x{nv:012X} (expected 0x{expected:012X})")
            missed += 1

print(f"\nu64 ptrs: {ok_count} OK, {missed} MISSED")

# Also check position patch
print("\n=== Position patch check ===")
# Position is typically at blob + 0x10 area
for name, off in [("pos_x?", 0x08), ("pos_y?", 0x0C)]:
    ov = r32(orig, off)
    nv = r32(inserted, off)
    print(f"  {name} @0x{off:04X}: {ov} -> {nv}")
