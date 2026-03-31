# AKAbak .AKP Binary Format — Comprehensive Analysis
## Based on TT23.akp snapshot series (v0-v11)

---

## 1. GLOBAL FILE LAYOUT

```
OFFSET          SECTION                         NOTES
─────────────── ─────────────────────────────── ─────────────────────────────
0x0000-0x001C   File header                     "RDTeam File 000 1.000" 
0x0019          Root block tag                   TAG_68 + u64 = filesize-4
0x001D          Metadata start                   Version, timestamps, path
~0x0062         Timestamp                        "2026-03-23 14:10:33"
~0x0079         Project name                     LPS "TT23"
~0x0091         Unit system                      "s=ms, m=mm, kg=g, ..."
~0x0100         File path (hex-encoded)
~0x1100         Divider "$$$1234$$$"
~0x146E         Air properties                   density, speed of sound, pressure
~0x159D         License ID                       "ID8769939263"
~0x16A1         "General" section
~0x1C54         "BEM" section
~0x21EF         "Observation" section            MEASURE, POLAR, etc.
~0x277E         "Repository" section             Component type definitions
~0x2DA4-~0x33BA "Sys" section                    System properties
0x33BB-0x33DA   Component List Header            32 bytes (fixed structure)
0x33DB          First component                  Always this offset for TT23
...             Component zone                   All type template+instance pairs
...             Outer block end marker           [NIL NIL self_ref NIL TAG_68...]
...             Wire zone                        Wire template+instance pairs
...             Page/print/RVF section
last 38 bytes   File footer (constant)
```

---

## 2. TAG SYSTEM

| Tag   | Hex         | Size  | Meaning                |
|-------|-------------|-------|------------------------|
| NIL   | `65 00 00 00` | 4B  | Null/end marker        |
| TAG_66 | `66 00 00 00` | 12B (4+8) | Pointer type 1 |
| TAG_67 | `67 00 00 00` | 12B (4+8) | Pointer type 2 (list) |
| TAG_68 | `68 00 00 00` | 12B (4+8) | Block start pointer    |
| TAG_69 | `69 00 00 00` | 12B (4+8) | Pointer type 4 |

Pointer tags: 4B tag + 8B u64 (LE) offset into file.

---

## 3. COMPONENT LIST HEADER (32 bytes before first_comp)

```
OFFSET   FIELD               EXAMPLE (v7, 4 types)
──────── ─────────────────── ─────────────────────
fc-32    u32: 0x68           Block type marker
fc-28    u32: 0x65           NIL
fc-24    u64: outer_end      0x5F48 → end of comp zone
fc-16    u32: num_types      4 (DynDriver, Duct, Radiator, Waveguide)
fc-12    u32: 0x65           NIL
fc-8     u64: after_name     0x33E8 → byte after first comp's type name
fc-0     → first component   0x33DB (always)
```

**num_types** = number of DISTINCT component types, NOT total component count.

---

## 4. TEMPLATE STRUCTURE

Each component type has exactly 2 instances in the file:
1. **Template** (in Repository section) — type definition
2. **Instance** (in Sys section) — per-instance properties

### Template Layout:
```
[u32: name_len] [ASCII: type_name]     e.g., 09 "DynDriver"
[u32: 0x65]     NIL
[u32: 0x68]     TAG_68 block start
[u64: ptr]      → points to corresponding instance
[u32: N]        property count (DynDriver=16, Duct=10, WG=11, Rad=13, Wire=12)
[u32: 0x65]     NIL
[u64: ptr]      → points to NIL after index table
[u32: 0x12]     18 (constant — index slot count)
[18 × 8B]       index table: {u32:idx, u32:0} for idx=0..17
[u32: 0x65]     NIL (end of index table)
[u32: name_len] [ASCII: short_name]    e.g., "Dyn1", "Duct1"
[u32: 0]        
[TAG_67: ptr]   → sub-block (formula, parameters, etc.)
... property definitions & data ...
```

### Instance Layout:
```
[u32: name_len] [ASCII: type_name]     Same type name as template
[u32: 0x65]     NIL
[u32: 0x65]     NIL  ←  KEY DIFFERENCE: NIL instead of TAG_68
[u64: ptr]
[u32: 0x65]     NIL
[u64: ptr]
[zeros]
[u32: 2]
[u32: idx]      Property index (varies by type)
[LPS: "Active"]
[LPS: "no,yes"]
[LPS: "Enable or disable component for calculation"]
... more properties (Caption, Formula, etc.) ...
```

### Detection Rule:
- After `type_name`: byte at offset `+4+name_len+4`
  - `0x68` → Template
  - `0x65` → Instance

---

## 5. COMPONENT SIZES

| Type       | name_len | prop_count | Template+Instance | Instance idx |
|------------|----------|------------|-------------------|--------------|
| DynDriver  | 9        | 16         | ~3923B total      | 0x22 (34)    |
| Waveguide  | 9        | 11         | ~2337B total      | 0x12 (18)    |
| Radiator   | 8        | 13         | ~1502B total      | 0x1B (27)    |
| Duct       | 4        | 10         | ~2081B total      | 0x09 (9)     |
| Wire       | 4        | 12         | ~520B total       | —            |

---

## 6. WIRE STRUCTURE

Wires use the **exact same** template/instance pattern as components.
- Type name: "Wire" (4 bytes)
- Property count: 12
- Each wire connection = **520 bytes** (pair: template + instance)
  - Template Wire: ~315 bytes
  - Instance Wire: ~205 bytes
- Wire zone located AFTER the outer block end marker

### Wire Template (same format as component template):
```
[LPS: "Wire"]
[NIL] [TAG_68: ptr] [u32: 12] [NIL] [u64: ptr] [u32: 18]
[18 index pairs] [NIL]
... connection data (port IDs, geometry) ...
```

### Wire Instance:
```
[LPS: "Wire"]  
[NIL] [NIL]  ← instance marker
[u64: ptr] [NIL] [u64: ptr]
... coordinates, boolean flags ...
[u64: ptr to next block]
[TAG_68: ...]  ← sub-block with more wire data
```

---

## 7. COMPONENT ORDERING RULE

**CRITICAL DISCOVERY**: AKAbak re-serializes the entire file on every save.

The ordering rule is:
1. The most recently **modified** component TYPE is placed **first**
2. Other types maintain their previous relative order
3. Within each type, template always comes before instance

Evidence:
| Version | Action           | Order                              |
|---------|------------------|------------------------------------|
| v1      | +Duct            | Duct                               |
| v2      | +Waveguide       | Waveguide, Duct                    |
| v4      | +Radiator        | Radiator, Waveguide, Duct          |
| v6      | Rename Du1→Duct1 | Duct, Radiator, Waveguide          |
| v7      | +DynDriver       | DynDriver, Duct, Radiator, WG      |
| v9      | -Waveguide       | DynDriver, Duct, Radiator          |
| v11     | Duct param change| Duct, DynDriver, Radiator          |

---

## 8. OUTER BLOCK END MARKER

Located at offset `outer_end` (from comp list header).
```
[NIL] [NIL] [u64: self_ref] [NIL] [TAG_68: next_ptr]
[u32: 7]    [NIL] [u64: ptr]
```
- `self_ref ≈ outer_end + 0x10`
- `u32: 7` appears constant across all versions
- After this comes the wire zone

---

## 9. STABLE REGIONS

These sections are IDENTICAL across all versions (same bytes):
- 0x339B-0x33BA: 32 bytes before comp list header (always same pattern)
- "Repository" always at ~0x27B0 (shifts slightly but content stable)
- "Sys" section structure stable
- Footer: last 38-39 bytes constant

These change on every save:
- 0x001D: root pointer (= filesize - 4)
- 0x005A: 4 bytes (likely CRC or hash)
- 0x0075-0x0079: last-modified time digits
- 0x1112-0x1114: pointer tracking file end

---

## 10. FILE OPERATIONS SUMMARY

| Operation              | Size delta | What changes                         |
|------------------------|------------|--------------------------------------|
| Add component          | +type_size | New template+instance pair inserted  |
| Remove component       | -type_size | Pair removed from comp zone          |
| Add wire (1 link)      | +520       | Wire template+instance pair          |
| Remove wire            | -520       | Wire pair removed                    |
| Rename component       | +(delta)   | Short name string length changes + reorder |
| Change parameter       | +0 to +N   | Parameter value string may grow/shrink |
| Any operation          | —          | ALL pointers updated, possible reorder |
