# AKAbak Wire Binary Format — Complete Analysis

## Overview

Analysis based on TEMPLATE_FINAL55.akp v0-v9 snapshots (10 progressive operations).
Each **wire** = 1 straight-line segment = **520 bytes** = 315B template + 205B instance.

---

## Wire Zone Layout in File

```
[... component zone (last = GND instance) ...]
[Wire Zone Header: 32 bytes]
[Wire Pair #1: 315B template + 205B instance]
[Wire Pair #2: 315B template + 205B instance]
...
[Wire Pair #N: 315B template + 205B instance]
[... footer (Page section, etc.) ...]
```

---

## Wire Zone Header (32 bytes, before first wire template)

```
Offset  Size  Content
------  ----  -------
+0x00   4B    TAG_68 (0x68000000)
+0x04   4B    TAG_NIL (0x65000000)
+0x08   8B    u64 ptr_last_tail → last_instance + 0xC1 (= end_of_wires - 12)
+0x10   4B    u32 wire_count (total number of wire pairs)
+0x14   4B    TAG_NIL (0x65000000)
+0x18   8B    u64 ptr_first → first_template + 8 (past LPS "Wire")
```

Verified: v0=3, v3=6, v5=7, v9=16. Count and pointers all confirmed.

---

## Wire Template Structure (315 bytes = 0x13B)

```
Offset   Size   Content
------   -----  -------
+0x000   8B     LPS "Wire" (u32 len=4 + "Wire")
+0x008   4B     TAG_NIL (0x65)
+0x00C   4B     TAG_68 (0x68)
+0x010   8B     u64 PTR_1 → TPL+0x11F (self-ref to cross-ref section)
+0x018   4B     u32 value (=203 in this project, purpose uncertain)
+0x01C   4B     TAG_NIL (0x65)
+0x020   8B     u64 PTR_2 → TPL+0x0BC (end-of-index NIL)
+0x028   4B     u32 = 18 (index slot count)
+0x02C   144B   Index table: 18 × {u32 idx, u32 0}
+0x0BC   4B     TAG_NIL (0x65) — end of index
+0x0C0   5B     LPS "W" (short name, u32 len=1 + "W")
+0x0C5   90B    Property blob (wire properties + tags/pointers)
+0x11F   4B     TAG_68 (0x68) — cross-ref section start
+0x123   4B     TAG_NIL (0x65)
+0x127   8B     u64 PTR_6 → INST+0x09B
+0x12F   4B     TAG_NIL (0x65)
+0x133   8B     u64 PTR_7 → INST+0x008
```

### Template Tagged Pointers (7 total)

| # | Offset | After Tag | Relative Target | Formula (pair_base = template start) |
|---|--------|-----------|-----------------|--------------------------------------|
| 1 | +0x010 | TAG_68 | TPL+0x11F | pair_base + 0x11F |
| 2 | +0x020 | TAG_65 | TPL+0x0BC | pair_base + 0x0BC |
| 3 | +0x0CD | TAG_67 | TPL+0x0E5 | pair_base + 0x0E5 |
| 4 | +0x0ED | TAG_65 | TPL+0x102 | pair_base + 0x102 |
| 5 | +0x10A | TAG_65 | TPL+0x116 | pair_base + 0x116 |
| 6 | +0x127 | TAG_65 | INST+0x09B | pair_base + 315 + 0x9B = pair_base + 0x1D6 |
| 7 | +0x133 | TAG_65 | INST+0x008 | pair_base + 315 + 0x08 = pair_base + 0x143 |

---

## Wire Instance Structure (205 bytes = 0xCD)

```
Offset   Size   Content
------   -----  -------
+0x000   8B     LPS "Wire" (u32 len=4 + "Wire")
+0x008   4B     TAG_NIL (0x65) — PTR_7 target
+0x00C   4B     TAG_NIL (0x65)
+0x010   8B     u64 iptr_1 → INST+0x093
+0x018   4B     TAG_NIL (0x65)
+0x01C   8B     u64 iptr_2 → INST+0x08E
+0x024   ...    data/properties
+0x041   4B     TAG_66 (0x66)
+0x045   8B     u64 iptr_3 → INST+0x07E
+0x04D   ...    data (zeros, properties)
+0x09B   4B     TAG_NIL (0x65) — PTR_6 target (from template cross-ref)
+0x09F   ...    data
+0x0A3   8B     u64 iptr_4 → INST+0x0BD (tail start)
+0x0AB   4B     i32 X1 (start X coordinate)
+0x0AF   4B     i32 Y1 (start Y coordinate)
+0x0B3   4B     i32 X2 (end X coordinate)
+0x0B7   4B     i32 Y2 (end Y coordinate)
+0x0BB   1B     u8 flag1 (T-junction flag for P1)
+0x0BC   1B     u8 flag2 (T-junction flag for P2)
+0x0BD   4B     TAG_NIL (0x65) — tail start
+0x0C1   4B     TAG_NIL (0x65) — ptr_last_tail target (from header)
+0x0C5   8B     chain: u64 for non-last / [NIL 4B + u32 4B] for last
```

### Instance Tagged Pointers (5 total)

All relative offsets from pair_base (template start) are **identical across all wires**:

| # | Offset | After Tag | Relative to pair_base | Formula |
|---|--------|-----------|----------------------|---------|
| 1 | +0x010 | TAG_65 | 0x1CE → INST+0x93 | pair_base + 0x1CE |
| 2 | +0x01C | TAG_65 | 0x1C9 → INST+0x8E | pair_base + 0x1C9 |
| 3 | +0x045 | TAG_66 | 0x1B9 → INST+0x7E | pair_base + 0x1B9 |
| 4 | +0x0A3 | TAG_65 | 0x1F8 → INST+0xBD | pair_base + 0x1F8 |
| 5 | +0x0C5 | TAG_65 | 0x210 → next_wire | next_pair_base + 0x008 |

Pointer #5 is the **chain pointer** linking to the next wire pair in sequence.

---

## Chain / Linked List Structure

Each wire instance's tail (+0xBD to +0xCC = 16 bytes) forms a linked list:

**Non-last wire tail (16 bytes):**
```
+0xBD: TAG_NIL (0x65, 4B)
+0xC1: TAG_NIL (0x65, 4B)
+0xC5: u64 chain_ptr → next_template + 8 (= next_pair_base + 8)
```

**Last wire tail (16 bytes):**
```
+0xBD: TAG_NIL (0x65, 4B)
+0xC1: TAG_NIL (0x65, 4B)
+0xC5: TAG_NIL (0x65, 4B)
+0xC9: u32 = end_of_wire_zone + 4
```

Wire zone header's ptr_last_tail → last instance +0xC1.

---

## Coordinate System

- Coordinates at instance +0xAB (X1), +0xAF (Y1), +0xB3 (X2), +0xB7 (Y2) as **signed i32**
- Grid-based integer coordinates (not pixels)
- Y = -1 used for top routing paths above component row
- Each wire is a single straight segment (HORIZONTAL or VERTICAL)
- Bent/L-shaped connections = 2 wire segments
- Parallel/T-junction connections = 3 wire segments (modify existing + add 3)

---

## Junction Flags

At instance +0xBB (flag1) and +0xBC (flag2):
- **0** = normal endpoint (no junction, or L-bend)
- **1** = T-junction endpoint (3+ wires meet at this point)

Only T-junctions (where a wire branches off mid-segment) get flag=1.
L-bends (2 wires meeting at 90°) keep flag=0.

---

## Parallel Wiring Mechanics

When user wires in parallel (T-junction):

1. **Modify existing wire**: shorten X2 to junction point, set flag2=1 (only 2 bytes change: +0xB3 and +0xBC)
2. **Add 3 new wires**:
   - Vertical segment from old path to new Y routing level
   - Horizontal segment along routing level
   - Vertical/horizontal segment down to target component

---

## Wire Count per Operation Type

| Operation | Wires Added | Total Bytes |
|-----------|------------|-------------|
| Straight wire | 1 × 520 | 520 |
| Bent wire (L-shape) | 2 × 520 | 1040 |
| Parallel wire (T-junction) | 3 × 520 | 1560 |

---

## Pointer Rebasing Algorithm

For N wire pairs starting at `wire_zone_start` (= header + 32):

```python
WIRE_PAIR_SIZE = 520  # 315 + 205

for i in range(N):
    pair_base = wire_zone_start + i * WIRE_PAIR_SIZE
    tpl_start = pair_base
    inst_start = pair_base + 315
    
    # Template pointers (7 total, all u64)
    write_u64(tpl_start + 0x010, pair_base + 0x11F)
    write_u64(tpl_start + 0x020, pair_base + 0x0BC)
    write_u64(tpl_start + 0x0CD, pair_base + 0x0E5)
    write_u64(tpl_start + 0x0ED, pair_base + 0x102)
    write_u64(tpl_start + 0x10A, pair_base + 0x116)
    write_u64(tpl_start + 0x127, pair_base + 0x1D6)  # inst+0x9B
    write_u64(tpl_start + 0x133, pair_base + 0x143)  # inst+0x08
    
    # Instance pointers (4 self-refs + 1 chain)
    write_u64(inst_start + 0x010, pair_base + 0x1CE)  # inst+0x93
    write_u64(inst_start + 0x01C, pair_base + 0x1C9)  # inst+0x8E
    write_u64(inst_start + 0x045, pair_base + 0x1B9)  # inst+0x7E
    write_u64(inst_start + 0x0A3, pair_base + 0x1F8)  # inst+0xBD
    
    # Chain pointer
    if i < N - 1:
        next_pair_base = wire_zone_start + (i + 1) * WIRE_PAIR_SIZE
        write_u64(inst_start + 0x0C5, next_pair_base + 0x008)
    else:
        # Last wire: [NIL][u32 = end + 4]
        write_u32(inst_start + 0x0C5, 0x65)  # NIL
        end_of_wires = wire_zone_start + N * WIRE_PAIR_SIZE
        write_u32(inst_start + 0x0C9, end_of_wires + 4)

# Wire zone header
header_base = wire_zone_start - 32
write_u32(header_base + 0x00, 0x68)           # TAG_68
write_u32(header_base + 0x04, 0x65)           # NIL
last_pair_base = wire_zone_start + (N-1) * WIRE_PAIR_SIZE
write_u64(header_base + 0x08, last_pair_base + 315 + 0xC1)  # ptr_last_tail
write_u32(header_base + 0x10, N)              # wire_count
write_u32(header_base + 0x14, 0x65)           # NIL
write_u64(header_base + 0x18, wire_zone_start + 0x008)       # ptr_first
```

---

## Variable Data per Wire Instance

Only these fields change between wires (all other bytes are identical template data):

| Offset | Size | Field |
|--------|------|-------|
| INST+0x0AB | 4B | i32 X1 (start X) |
| INST+0x0AF | 4B | i32 Y1 (start Y) |
| INST+0x0B3 | 4B | i32 X2 (end X) |
| INST+0x0B7 | 4B | i32 Y2 (end Y) |
| INST+0x0BB | 1B | u8 flag1 (T-junction at P1) |
| INST+0x0BC | 1B | u8 flag2 (T-junction at P2) |
| INST+0x0C5 | 8B | chain pointer (computed during rebasing) |
| All u64 ptrs | 8B each | Rebased per wire position |

---

## Version History of Findings

- Session 11: Initial wire exploration (basic prop_count, size estimates)
- Session 16: Complete wire structure reverse engineering using 10 progressive snapshots
  - Confirmed wire = 520B = 315T + 205I
  - Mapped all 12 pointer offsets in template + instance
  - Discovered wire zone header with count field
  - Mapped chain linked list structure
  - Documented junction flags and parallel wiring mechanics
