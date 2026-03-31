import struct

with open('templates/TEMPLATE_FINAL.akp', 'rb') as f:
    f.seek(0x18F60)
    ref = f.read(1823)

with open('tests/TEST_N_RAD.akp', 'rb') as f:
    f.seek(0x17E2D)
    ins = f.read(1823)

delta = 0x17E2D - 0x18F60
diffs = []
for i in range(1823):
    if ref[i] != ins[i]:
        diffs.append(i)

print(f"Total different bytes: {len(diffs)}")

# Group into runs
runs = []
if diffs:
    start = diffs[0]
    end = diffs[0]
    for d in diffs[1:]:
        if d == end + 1:
            end = d
        else:
            runs.append((start, end))
            start = d
            end = d
    runs.append((start, end))

print(f"Different regions: {len(runs)}")
all_ok = True
for s, e in runs:
    width = e - s + 1
    if width == 1:
        # Grid byte
        print(f"  @0x{s:04X} (1B): ref=0x{ref[s]:02X} ins=0x{ins[s]:02X} [grid coord]")
    elif width == 2:
        # Likely lower 2 bytes of a pointer
        ref_u32 = struct.unpack_from('<I', ref, s)[0]
        ins_u32 = struct.unpack_from('<I', ins, s)[0]
        expected = ref_u32 + delta
        ok = (ins_u32 == expected)
        if not ok:
            all_ok = False
        status = "OK" if ok else f"WRONG (expected 0x{expected:08X})"
        print(f"  @0x{s:04X} (2B): ref_u32=0x{ref_u32:08X} ins_u32=0x{ins_u32:08X} {status}")
    else:
        ref_hex = ref[s:e+1].hex()
        ins_hex = ins[s:e+1].hex()
        print(f"  @0x{s:04X} ({width}B): ref={ref_hex} ins={ins_hex}")

print(f"\n{'ALL POINTERS CORRECT' if all_ok else 'SOME POINTERS WRONG'}")
