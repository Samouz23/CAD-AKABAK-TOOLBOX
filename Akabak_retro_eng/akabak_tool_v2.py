"""
AKAbak .akp File Tool v2
========================
Outil complet pour modifier des fichiers AKAbak existants et creer de nouveaux projets LEM.

Fonctionnalites:
  1. Lister composants, constantes, formules d'un fichier .akp
  2. Modifier constantes globales (dimensions, parametres)
  3. Modifier formules de composants individuels
  4. Appliquer un fichier de configuration complet (batch)
  5. Extraire un composant d'un fichier source
  6. Inserer un composant extrait dans un fichier cible
  7. Dupliquer un composant existant
  8. Generer des formules pour les types LEM standard

Format binaire .akp:
  - Signature: "RDTeam File 000 1.000"
  - Tags: 0x65(NIL/4B), 0x66-0x69(ref+u64/12B), 0x68(block+u64_end/12B)
  - Strings: u32_len + ASCII bytes
  - Pointeurs absolus dans tout le fichier

Usage:
  python akabak_tool_v2.py list <fichier.akp>
  python akabak_tool_v2.py patch <source.akp> <output.akp> --set "VAR1=val1,VAR2=val2"
  python akabak_tool_v2.py formula <source.akp> <output.akp> --comp 0 --formula "SDf=900\\nSDr=900"
  python akabak_tool_v2.py apply <source.akp> <output.akp> --config projet.ini
  python akabak_tool_v2.py extract <source.akp> --comp 0 --out composant.bin
  python akabak_tool_v2.py insert <target.akp> <output.akp> --blob composant.bin
  python akabak_tool_v2.py duplicate <source.akp> <output.akp> --comp 0
  python akabak_tool_v2.py generate DynDriver --params "SDf=855,Mms=173"
  python akabak_tool_v2.py diff <file1.akp> <file2.akp>
  python akabak_tool_v2.py templates
"""

import struct
import os
import sys
import re
import argparse
import configparser
from datetime import datetime
from collections import Counter


# ============================================================================
# BINARY FORMAT PRIMITIVES
# ============================================================================

TAG_NIL   = 0x65
TAG_REF66 = 0x66
TAG_REF67 = 0x67
TAG_BLOCK = 0x68
TAG_REF69 = 0x69

POINTER_TAGS = (TAG_REF66, TAG_REF67, TAG_BLOCK, TAG_REF69)

COMP_TYPE_NAMES = [
    "DynDriver", "Waveguide", "Duct", "Resistor",
    "Filter", "Source", "Transform", "Radiator",
    "Encl", "EnclVented", "MassAcou", "GND",
]

# Precise pointer maps for formula-enabled blobs (TEMPLATE_FINAL snapshots).
# Positions are relative to template or instance start. All are u64 preceded by tags.
POINTER_MAPS = {
    # --- Formula-enabled blobs (from TEMPLATE_FINAL snapshots) ---
    # NOTE: All offsets point to the u64 pointer value AFTER the preceding tag u32.
    'Duct': {
        'template_size': 451, 'instance_size': 2109,
        'template_ptrs': [0x0010, 0x0020, 0x00CF, 0x0175, 0x0192, 0x01AF, 0x01BB],
        'instance_ptrs': [
            0x0010, 0x001C, 0x007C, 0x00DA, 0x00E6, 0x0127, 0x0178,
            0x01BC, 0x0216, 0x0222, 0x0247, 0x026B, 0x027B, 0x0287,
            0x0293, 0x029F, 0x02FE, 0x035B, 0x0383, 0x03AF, 0x03DB,
            0x0404, 0x042C, 0x0460, 0x046C, 0x04A6, 0x050C, 0x0518,
            0x0569, 0x05CD, 0x05D9, 0x0622, 0x0689, 0x0695, 0x0701,
            0x0769, 0x0775, 0x07D4, 0x0835,
        ],
    },
    'Waveguide': {
        'template_size': 489, 'instance_size': 2382,
        'template_ptrs': [0x0015, 0x0025, 0x00D4, 0x019B, 0x01B8, 0x01D5, 0x01E1],
        'instance_ptrs': [
            0x0015, 0x0021, 0x0081, 0x00DF, 0x00EB, 0x012C, 0x017D,
            0x01C1, 0x021B, 0x0227, 0x024C, 0x0270, 0x0280, 0x028C,
            0x0298, 0x02A4, 0x0304, 0x0361, 0x0389, 0x03B8, 0x03E7,
            0x0410, 0x0438, 0x046C, 0x0478, 0x04D7, 0x0534, 0x055C,
            0x058B, 0x05BA, 0x05E3, 0x060B, 0x063F, 0x064B, 0x068A,
            0x06F2, 0x06FE, 0x0750, 0x07B8, 0x07C4, 0x082A, 0x088E,
            0x089A, 0x08E8, 0x0946,
        ],
    },
    # Radiator: removed from POINTER_MAPS — uses heuristic fallback instead.
    # The original map had many false entries (non-pointer values at mapped positions)
    # which caused corruption when delta != 0. Heuristic rebase validates each target.
    'DynDriver': {
        'template_size': 529, 'instance_size': 3944,
        'template_ptrs': [0x0015, 0x0025, 0x00D5, 0x01C3, 0x01E0, 0x01FD, 0x0209],
        'instance_ptrs': [
            0x0015, 0x0021, 0x0081, 0x00DF, 0x00EB, 0x012C, 0x017D,
            0x01C1, 0x021B, 0x0227, 0x024C, 0x0270, 0x0280, 0x028C,
            0x0298, 0x02FA, 0x0357, 0x037F, 0x03A7, 0x03CF, 0x03FA,
            0x0422, 0x0456, 0x0462, 0x04C2, 0x051F, 0x0547, 0x056F,
            0x0597, 0x05C2, 0x05EA, 0x061E, 0x062A, 0x0636, 0x0676,
            0x06E1, 0x06ED, 0x0732, 0x0796, 0x07A2, 0x07E8, 0x0852,
            0x085E, 0x08A1, 0x0908, 0x0914, 0x0957, 0x09BE, 0x09CA,
            0x0A19, 0x0A7A, 0x0A86, 0x0ACE, 0x0B33, 0x0B3F, 0x0B4B,
            0x0B94, 0x0BFE, 0x0C0A, 0x0C4A, 0x0CAE, 0x0CBA, 0x0CFF,
            0x0D60, 0x0D6C, 0x0DB5, 0x0E0A, 0x0E35, 0x0E5E, 0x0E87,
            0x0EB2, 0x0EDB, 0x0F04, 0x0F2C, 0x0F60,
        ],
    },
    'Encl': {
        'template_size': 410, 'instance_size': 1253,
        'template_ptrs': [0x0010, 0x0020, 0x00D1, 0x014C, 0x0169, 0x0186, 0x0192],
        'instance_ptrs': [
            0x0010, 0x001C, 0x007C, 0x00DA, 0x00E6, 0x0127, 0x0178,
            0x01BC, 0x0216, 0x0222, 0x0247, 0x026B, 0x027B, 0x0287,
            0x0293, 0x029F, 0x02E4, 0x0348, 0x0354, 0x03B2, 0x0416,
            0x0422, 0x0471, 0x04DD,
        ],
    },
    'EnclVented': {
        'template_size': 487, 'instance_size': 3074,
        'template_ptrs': [0x0016, 0x0026, 0x00D7, 0x0199, 0x01B6, 0x01D3, 0x01DF],
        'instance_ptrs': [
            0x0016, 0x0022, 0x0082, 0x00E0, 0x00EC, 0x012D, 0x017E,
            0x01C2, 0x021C, 0x0228, 0x024D, 0x0271, 0x0281, 0x028D,
            0x0299, 0x02A5, 0x02EA, 0x034E, 0x035A, 0x03CB, 0x042F,
            0x043B, 0x048A, 0x04EE, 0x04FA, 0x0545, 0x05AE, 0x05BA,
            0x0639, 0x0692, 0x069E, 0x06E2, 0x0747, 0x0753, 0x0796,
            0x07FB, 0x0807, 0x0873, 0x08D5, 0x08E1, 0x0948, 0x09A5,
            0x09CE, 0x09FA, 0x0A26, 0x0A4F, 0x0A78, 0x0AAD, 0x0AB9,
            0x0AE2, 0x0B3F, 0x0B4B, 0x0B99, 0x0BFA,
        ],
    },
    'MassAcou': {
        'template_size': 527, 'instance_size': 1008,
        'template_ptrs': [0x0014, 0x0024, 0x00D3, 0x01C1, 0x01DE, 0x01FB, 0x0207],
        'instance_ptrs': [
            0x0014, 0x0020, 0x0080, 0x00DE, 0x00EA, 0x012B, 0x017C,
            0x01C0, 0x021A, 0x0226, 0x024B, 0x026F, 0x027F, 0x028B,
            0x0297, 0x02D0, 0x0331, 0x033D, 0x0383, 0x03E8,
        ],
    },
    'GND': {
        'template_size': 191, 'instance_size': 783,
        'template_ptrs': [0x000F, 0x001F],
        'instance_ptrs': [
            0x000F, 0x002F, 0x004C, 0x0069, 0x0075, 0x008C, 0x0098,
            0x00F8, 0x0156, 0x0162, 0x01A3, 0x01F4, 0x0238, 0x0292,
            0x029E, 0x02C3, 0x02E7, 0x02F7, 0x0307,
        ],
    },
    'Wire': {
        'template_size': 315, 'instance_size': 205,
        'template_ptrs': [0x0010, 0x0020, 0x00CD, 0x00ED, 0x010A, 0x0127, 0x0133],
        'instance_ptrs': [0x0010, 0x001C, 0x0045, 0x00A3, 0x00C5],
        'coord_offset': 0x00AB,
    },
}


COMPONENT_DIMS = {
    'Waveguide':  {'width': 8, 'height': 6, 'port_y_offset': 3},
    'Duct':       {'width': 8, 'height': 4, 'port_y_offset': 2},
    'DynDriver':  {'width': 8, 'height': 8, 'port_y_offset': 1},
    'Radiator':   {'width': 4, 'height': 8, 'port_y_offset': 1},
    'Filter':     {'width': 6, 'height': 4, 'port_y_offset': 2},
    'Source':     {'width': 2, 'height': 8, 'port_y_offset': 1},
    'Resistor':   {'width': 6, 'height': 2, 'port_y_offset': 1},
    'Encl':       {'width': 8, 'height': 6, 'port_y_offset': 3},
    'EnclVented': {'width': 8, 'height': 8, 'port_y_offset': 3},
    'MassAcou':   {'width': 8, 'height': 4, 'port_y_offset': 2},
    'GND':        {'width': 2, 'height': 2, 'port_y_offset': 1},
}


def is_tag(data, pos):
    """Check if there's a valid tag at position pos"""
    if pos + 4 > len(data):
        return False
    return (data[pos] in (TAG_NIL, TAG_REF66, TAG_REF67, TAG_BLOCK, TAG_REF69)
            and data[pos+1] == 0 and data[pos+2] == 0 and data[pos+3] == 0)


def read_u32(data, pos):
    return struct.unpack_from('<I', data, pos)[0]


def read_u64(data, pos):
    return struct.unpack_from('<Q', data, pos)[0]


def write_u32(data, pos, val):
    struct.pack_into('<I', data, pos, val)


def write_u64(data, pos, val):
    struct.pack_into('<Q', data, pos, val)


# ============================================================================
# STRING SCANNER
# ============================================================================

def find_all_strings(data, min_len=1, max_len=50000):
    """Find all length-prefixed ASCII strings in binary data."""
    strings = []
    i = 0
    while i < len(data) - 4:
        slen = read_u32(data, i)
        if min_len <= slen <= max_len and i + 4 + slen <= len(data):
            chunk = data[i+4:i+4+slen]
            if all(0x09 <= c <= 0x7E or c == 0x0D for c in chunk):
                try:
                    text = chunk.decode('ascii')
                    strings.append((i, slen, text))
                    i += 4 + slen
                    continue
                except (UnicodeDecodeError, ValueError):
                    pass
        i += 1
    return strings


# ============================================================================
# POINTER SCANNER
# ============================================================================

def find_all_pointers(data, max_ptr=None):
    """Find all tag+pointer positions in the file."""
    if max_ptr is None:
        max_ptr = len(data) + 0x100000
    pointers = []
    for i in range(len(data) - 11):
        if is_tag(data, i) and data[i] in POINTER_TAGS:
            ptr = read_u64(data, i + 4)
            if ptr <= max_ptr:
                pointers.append((i, data[i], ptr))
    return pointers


# ============================================================================
# AKP PATCHER ENGINE
# ============================================================================

class AkpFile:
    """
    Engine for reading and modifying .akp files.
    Handles pointer recalculation after any size-changing operations.
    """

    def __init__(self, data):
        self.data = bytearray(data)

    @classmethod
    def from_file(cls, filepath):
        with open(filepath, 'rb') as f:
            return cls(f.read())

    @property
    def size(self):
        return len(self.data)

    # ------------------------------------------------------------------
    # String operations
    # ------------------------------------------------------------------

    def get_strings(self, min_len=1):
        return find_all_strings(bytes(self.data), min_len=min_len)

    def get_constants_block(self):
        """Find the main constants/formula block (largest text with assignments)."""
        best = None
        for off, slen, text in self.get_strings(min_len=30):
            if '=' in text and '//' in text:
                if best is None or slen > best[1]:
                    best = (off, slen, text)
        return best

    def get_components(self):
        """
        Find all LEM component TEMPLATES (not instances) and their formulas.
        Each component in AKAbak appears twice: template (in Repository) and instance (in Sys).
        Templates are followed by a short name (e.g., "Wg1", "DRIVER").
        Instances are followed by "Active", "no,yes".
        We only return templates.

        Returns list of dicts with keys:
            type, short_name, type_offset, formula_offset, formula_length, formula_text
        """
        strings = self.get_strings()
        components = []

        for idx, (off, slen, text) in enumerate(strings):
            if text not in COMP_TYPE_NAMES:
                continue

            # Check if this is a template or instance
            # Instances have "Active" as one of the NEXT 2 strings (immediate neighbors)
            # Templates have short_name → [formula] → TypeName(instance) → Active (at idx+3 or later)
            is_instance = False
            for j in range(idx + 1, min(idx + 3, len(strings))):
                if strings[j][2] == 'Active':
                    is_instance = True
                    break
            if is_instance:
                continue

            # This is a template - extract short name and formula
            short_name = None
            short_name_off = None
            short_name_len = None
            formula = None
            for j in range(idx + 1, min(idx + 30, len(strings))):
                foff, fslen, ftext = strings[j]

                # Short name: first short string (1-20 chars) that's not a type name
                if short_name is None and 1 <= fslen <= 20 and ftext not in COMP_TYPE_NAMES:
                    if ftext not in ('Active', 'no,yes'):
                        short_name = ftext
                        short_name_off = foff
                        short_name_len = fslen

                # Formula: multi-line with assignments or @ references
                if formula is None:
                    if '=' in ftext and ('\n' in ftext or '\r' in ftext or '@' in ftext):
                        formula = (foff, fslen, ftext)
                    elif any(kw in ftext for kw in [
                        'SDf', 'SDr', 'Mms', 'WD ', 'HD ', 'Len ', 'Len=',
                        'HTh', 'HMo', 'WTh', 'WMo', 'HCab', 'WCab', 'LenCab',
                        'RangeMin', 'LineLength', 'OffsetAxial'
                    ]):
                        formula = (foff, fslen, ftext)

                # Stop if we hit another type name (next component)
                if ftext in COMP_TYPE_NAMES:
                    break

            comp = {
                'type': text,
                'short_name': short_name or '?',
                'type_offset': off,
            }
            if short_name_off is not None:
                comp['short_name_offset'] = short_name_off
                comp['short_name_length'] = short_name_len
            if formula:
                comp['formula_offset'] = formula[0]
                comp['formula_length'] = formula[1]
                comp['formula_text'] = formula[2]
            components.append(comp)

        return components

    def get_component_block_range(self, comp_name_offset):
        """
        Find the enclosing block (0x68 tag) for a component.
        Searches backwards from the component name for the nearest valid block start,
        then reads its end offset.
        Returns (block_start, block_end) or None.
        """
        data = bytes(self.data)
        # Search backwards for nearest 0x68 block
        for i in range(comp_name_offset - 1, max(0, comp_name_offset - 300), -1):
            if is_tag(data, i) and data[i] == TAG_BLOCK:
                end_off = read_u64(data, i + 4)
                if end_off > comp_name_offset and end_off < len(data) + 0x10000:
                    return (i, end_off)
        return None

    # ------------------------------------------------------------------
    # Modification operations
    # ------------------------------------------------------------------

    def replace_string(self, offset, old_len, new_text, pad=' '):
        """
        Replace a length-prefixed string at given offset.
        By default uses in-place padding (no size change, no pointer adjustments).
        The new text is padded to old_len with the pad character.
        The LPS length field is kept at old_len so the file structure is unchanged.
        Returns 0 (no size delta).
        """
        new_bytes = new_text.encode('ascii', errors='replace')
        new_len = len(new_bytes)
        if new_len > old_len:
            raise ValueError(f"New text ({new_len}) longer than old ({old_len}). "
                             f"In-place replace requires new_text <= old_len.")
        # Pad to keep same length — LPS length stays old_len
        padded = new_bytes + pad.encode('ascii') * (old_len - new_len)
        self.data[offset + 4:offset + 4 + old_len] = padded
        return 0

    def insert_blob(self, position, blob):
        """
        Insert raw binary data at position.
        Adjusts all pointers >= position by +len(blob).
        Skips the blob region itself (blob pointers are pre-rebased by caller).
        """
        delta = len(blob)
        new_data = bytearray()
        new_data.extend(self.data[:position])
        new_data.extend(blob)
        new_data.extend(self.data[position:])

        # Only adjust pointers OUTSIDE the blob region
        # The blob's internal pointers were already rebased by _rebase_blob_pointers
        blob_start = position
        blob_end = position + delta
        self._adjust_pointers(new_data, position, delta,
                              skip_range=(blob_start, blob_end))
        self.data = new_data
        return delta

    def remove_blob(self, start, end):
        """
        Remove bytes from start to end.
        Adjusts all pointers >= end by -(end-start).
        """
        delta = -(end - start)
        new_data = bytearray()
        new_data.extend(self.data[:start])
        new_data.extend(self.data[end:])

        self._adjust_pointers(new_data, end, delta)
        self.data = new_data
        return delta

    def _adjust_pointers(self, data, shift_point, delta, skip_range=None):
        """
        Adjust all absolute pointers in the file.
        Any pointer with value >= shift_point is adjusted by +delta.
        If skip_range=(start, end) is given, tags within that byte range are skipped
        (their pointers are already correct, e.g. from _rebase_blob_pointers).
        """
        file_max = len(data) + abs(delta) + 0x100000
        tag65 = b'\x65\x00\x00\x00'
        tag68 = b'\x68\x00\x00\x00'
        zeros4 = b'\x00\x00\x00\x00'

        # Build set of byte positions inside any pointer-tag (66-69) u64 value.
        # TAG_NIL (65) bytes at these positions are embedded in u64 data, not real tags.
        # IMPORTANT: A byte that looks like a tag (e.g. 0x67) may itself be embedded
        # inside another tag's u64 value (when pointer values are in 0x6500-0x69FF).
        # So we skip any candidate that falls inside an already-identified tag's u64.
        in_ptr_u64 = set()
        i = 0
        while i < len(data) - 11:
            if is_tag(data, i) and data[i] in POINTER_TAGS and i not in in_ptr_u64:
                for j in range(i + 4, min(i + 12, len(data))):
                    in_ptr_u64.add(j)
                i += 12  # skip past this tag's u64 value
            else:
                i += 1

        # Pass 1: adjust tagged pointers (66-69) and TAG_NIL u64 pointers (65)
        for i in range(len(data) - 11):
            if skip_range and skip_range[0] <= i < skip_range[1]:
                continue
            if not is_tag(data, i):
                continue
            tag = data[i]
            if tag in POINTER_TAGS:
                # Detect compound [TAG_66/67/69][TAG_NIL][u64]: real ptr at i+8.
                # TAG_BLOCK(68) + TAG_NIL is handled by Pass 2 raw u32.
                if (tag != TAG_BLOCK and i + 16 <= len(data)
                        and is_tag(data, i + 4) and data[i + 4] == TAG_NIL):
                    old_ptr = read_u64(data, i + 8)
                    if old_ptr >= shift_point and old_ptr < file_max:
                        new_ptr = old_ptr + delta
                        if new_ptr >= 0 and new_ptr < file_max:
                            write_u64(data, i + 8, new_ptr)
                    continue
                # Simple: direct u64 at i+4
                ptr_pos = i + 4
                if ptr_pos + 8 <= len(data):
                    old_ptr = read_u64(data, ptr_pos)
                    if old_ptr >= shift_point and old_ptr < file_max:
                        new_ptr = old_ptr + delta
                        if new_ptr >= 0 and new_ptr < file_max:
                            write_u64(data, ptr_pos, new_ptr)
            elif tag == TAG_NIL:
                # TAG_NIL can precede u64 absolute pointers throughout the file.
                # Reject if embedded inside a pointer tag's u64 value (false tag).
                if i in in_ptr_u64:
                    continue
                # Skip TAG_NIL preceded by ANY tag — handled by compound (above)
                # or raw u32 pass (below).
                if i >= 4 and is_tag(data, i - 4):
                    continue
                ptr_pos = i + 4
                if ptr_pos + 8 <= len(data):
                    old_ptr = read_u64(data, ptr_pos)
                    if old_ptr >= shift_point and old_ptr < file_max:
                        new_ptr = old_ptr + delta
                        if new_ptr >= 0:
                            tgt = int(new_ptr)
                            if tgt + 4 <= len(data) and is_tag(data, tgt):
                                write_u64(data, ptr_pos, new_ptr)

        # Pass 2: adjust raw u32 in [PREFIX TAG_65 u32 00000000] patterns.
        # Matches [65 65 u32 0000] (block-end self-refs) and [68 65 u32 0000]
        # (block-start end-offsets).
        for i in range(len(data) - 12):
            if skip_range and skip_range[0] <= i < skip_range[1]:
                continue
            if data[i:i+4] == tag65 and data[i+8:i+12] == zeros4:
                if i >= 4 and (data[i-4:i] == tag65 or data[i-4:i] == tag68):
                    val = read_u32(data, i + 4)
                    if val >= shift_point and val < file_max:
                        write_u32(data, i + 4, val + delta)

    def update_header_size(self):
        """Update the root block end offset in the header."""
        if len(self.data) > 0x25 and self.data[0x19] == TAG_BLOCK:
            write_u64(self.data, 0x1D, len(self.data) - 4)

    def update_date(self):
        """Update the save date in the header."""
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for off, slen, text in self.get_strings():
            if re.match(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', text):
                if slen == len(now):
                    self.data[off+4:off+4+slen] = now.encode('ascii')
                break

    def rename_project(self, new_name):
        """
        Rename the project: update project name and hex-encoded file paths.
        Uses in-place padding so file size is unchanged.
        Returns the old project name.
        """
        strings = self.get_strings()

        # 1. Find the project name (first non-header string around offset 0x60-0x200)
        old_name = None
        name_off = None
        name_len = None
        skip_prefixes = ('RDTeam', 's=ms', '3.1.', '3.0.')
        for off, slen, text in strings:
            if off < 0x50:
                continue
            if off > 0x300:
                break
            if any(text.startswith(p) for p in skip_prefixes):
                continue
            if re.match(r'\d{4}-\d{2}-\d{2}', text):
                continue
            if slen >= 20 and all(c in '0123456789ABCDEFabcdef' for c in text):
                continue
            old_name = text
            name_off = off
            name_len = slen
            break

        if old_name is None:
            raise ValueError("Could not find project name in header")

        if len(new_name) > name_len:
            raise ValueError(
                f"New name '{new_name}' ({len(new_name)} chars) is longer than "
                f"old name '{old_name}' ({name_len} chars). "
                f"In-place rename requires new_name <= old length.")

        # 2. Replace project name in-place (pad with spaces)
        self.replace_string(name_off, name_len, new_name)
        print(f"  Name: '{old_name}' -> '{new_name}' (at 0x{name_off:06X})")

        # 3. Replace hex-encoded filename occurrences
        old_filename_hex = (old_name + '.akp').encode('ascii').hex().upper()
        new_filename_hex = (new_name + '.akp').encode('ascii').hex().upper()
        hex_pad = '0' * (len(old_filename_hex) - len(new_filename_hex))
        replacement_hex = new_filename_hex + hex_pad

        replaced_count = 0
        for off, slen, text in strings:
            if old_filename_hex in text:
                new_text = text.replace(old_filename_hex, replacement_hex)
                if len(new_text) == slen:
                    self.data[off + 4:off + 4 + slen] = new_text.encode('ascii')
                    replaced_count += 1
                    print(f"  Hex path updated at 0x{off:06X}")

        if replaced_count == 0:
            print(f"  Warning: no hex-encoded path found for '{old_name}.akp'")

        return old_name

    def save(self, filepath):
        """Save the modified file."""
        self.update_header_size()
        with open(filepath, 'wb') as f:
            f.write(self.data)
        print(f"Saved: {filepath} ({len(self.data)} bytes)")


# ============================================================================
# COMPONENT BLOB EXTRACTOR
# ============================================================================

def find_all_template_offsets(akp):
    """
    Find all component template LPS offsets (the u32 length field position).
    A template has [LPS type_name][NIL=0x65][TAG_68=0x68] after it.
    Returns sorted list of (lps_offset, type_name).
    """
    data = bytes(akp.data)
    templates = []
    for type_name in COMP_TYPE_NAMES:
        type_bytes = type_name.encode('ascii')
        type_len = len(type_bytes)
        pos = 0
        while True:
            pos = data.find(type_bytes, pos)
            if pos < 0:
                break
            if pos >= 4:
                lps_len = read_u32(data, pos - 4)
                if lps_len == type_len:
                    # Check: after type_name, there should be NIL then TAG_68 (template)
                    after = pos + type_len
                    if after + 8 <= len(data):
                        nil_val = read_u32(data, after)
                        tag_val = read_u32(data, after + 4)
                        if nil_val == TAG_NIL and tag_val == TAG_BLOCK:
                            templates.append((pos - 4, type_name))
            pos += 1
    templates.sort()
    return templates


def find_outer_end(akp):
    """
    Find the outer_end offset from the component list header.
    This marks the end of the component zone.
    """
    templates = find_all_template_offsets(akp)
    if not templates:
        return None
    first_comp = templates[0][0]  # LPS offset of first template
    return read_u64(akp.data, first_comp - 24)


def find_component_boundaries(akp, comp_idx):
    """
    Find the byte range enclosing a complete component (template + instance).

    Uses template-to-template boundary detection:
    - Start = LPS offset of this component's template
    - End = LPS offset of the next component's template, or outer_end for last

    Returns (start, end) or None.
    """
    components = akp.get_components()
    if comp_idx >= len(components):
        return None

    comp = components[comp_idx]
    template_off = comp['type_offset']  # LPS length field offset
    template_lps = template_off          # Already points to LPS length field

    # Find ALL templates sorted by offset
    all_templates = find_all_template_offsets(akp)
    if not all_templates:
        return None

    # Find this template's index in the sorted list
    my_idx = None
    for i, (lps_off, tname) in enumerate(all_templates):
        if lps_off == template_lps:
            my_idx = i
            break

    if my_idx is None:
        print(f"WARNING: Template not found in template list for [{comp_idx}] {comp['type']}")
        return None

    start = template_lps

    # End: next template's LPS offset, or outer_end
    if my_idx + 1 < len(all_templates):
        end = all_templates[my_idx + 1][0]
    else:
        # Last template - end at outer_end
        oe = find_outer_end(akp)
        if oe and oe < len(akp.data):
            end = oe
        else:
            end = len(akp.data) - 40

    return (start, end)


def extract_component_blob(akp, comp_idx):
    """
    Extract the raw binary content of a component.
    Returns (blob_bytes, source_offset) or (None, None).
    source_offset is the absolute position in the source file where the blob starts.
    """
    bounds = find_component_boundaries(akp, comp_idx)
    if bounds is None:
        print(f"ERROR: Cannot find boundaries for component [{comp_idx}]")
        print(f"  Tip: extraction works best with simple files created in AKAbak.")
        print(f"  For complex files, use 'apply' to modify parameters instead.")
        return None, None

    start, end = bounds
    blob = bytes(akp.data[start:end])
    print(f"Extracted [{comp_idx}] bytes 0x{start:06X}..0x{end:06X} ({len(blob)} bytes)")
    return blob, start


# ============================================================================
# COMPONENT INSERTION LOGIC
# ============================================================================

def find_insertion_point(akp):
    """
    Find the best position to insert a new component.
    Inserts at the BEGINNING of the component zone (first_comp LPS offset).
    AKAbak requires the most recently added component to be first.
    Falls back to boundary detection if no components exist.
    """
    data = bytes(akp.data)

    # Preferred: insert at first_comp (beginning of component zone)
    comp_types = [b'DynDriver', b'Duct', b'Waveguide', b'Filter',
                  b'Transform', b'Source', b'Resistor', b'Radiator',
                  b'Encl', b'EnclVented', b'MassAcou', b'GND']
    first_comp = None
    for t in comp_types:
        pos = data.find(t, 0x1000)
        while pos > 0:
            if pos >= 4 and read_u32(akp.data, pos - 4) == len(t):
                lps = pos - 4
                if first_comp is None or lps < first_comp:
                    first_comp = lps
                break
            pos = data.find(t, pos + 1)
    if first_comp is not None:
        return first_comp

    # Fallback for files with no existing components
    components = akp.get_components()
    if components:
        bounds = find_component_boundaries(akp, len(components) - 1)
        if bounds:
            return bounds[1]

    rvf_marker = b'RDTeam RVF Editor'
    rvf_pos = data.find(rvf_marker)
    if rvf_pos > 0:
        for i in range(rvf_pos - 1, max(0, rvf_pos - 500), -1):
            if is_tag(data, i) and data[i] == TAG_BLOCK:
                return i
        return rvf_pos - 100

    return len(data) - 50


def duplicate_component(akp, comp_idx, new_formula=None):
    """
    Duplicate an existing component by extracting its blob and reinserting it.
    Optionally applies a new formula to the duplicate.
    Returns the new AkpFile, or None on failure.
    """
    blob, source_offset = extract_component_blob(akp, comp_idx)
    if blob is None:
        return None

    insert_pos = find_insertion_point(akp)
    print(f"Inserting duplicated component at 0x{insert_pos:06X}")

    # Strip repo block header if present (from small source files)
    blob, source_offset = _strip_repo_header(bytearray(blob), source_offset)

    # Adjust internal pointers within the blob to point to their new absolute positions
    adjusted_blob = _rebase_blob_pointers(blob, insert_pos, source_offset)

    blob_size = len(adjusted_blob)
    akp.insert_blob(insert_pos, adjusted_blob)

    # Fix component count and block_end after insertion
    _fix_component_metadata(akp)
    _fix_blob_outer_block(akp, insert_pos, blob_size)
    _fix_blob_tail_ref(akp, insert_pos, blob_size)

    if new_formula:
        # Find the newly inserted component and update its formula
        components = akp.get_components()
        # The new component should be the last one of its type
        comp = akp.get_components()[-1]
        if 'formula_offset' in comp:
            akp.replace_string(comp['formula_offset'], comp['formula_length'], new_formula)

    return akp


def _fix_component_metadata(akp):
    """
    Fix the component count and block_end fields after insertion/removal.
    These are raw u32 values at known positions relative to the first component,
    not tagged pointers, so _adjust_pointers doesn't handle them.
    """
    components = akp.get_components()
    if not components:
        return

    # Find the first component type string offset (LPS-aware: verify length prefix)
    comp_types = [b'DynDriver', b'Duct', b'Waveguide', b'Filter',
                  b'Transform', b'Source', b'Resistor', b'Radiator',
                  b'Encl', b'EnclVented', b'MassAcou', b'GND']
    data = bytes(akp.data)
    first_comp = None
    for t in comp_types:
        pos = data.find(t, 0x1000)
        while pos > 0:
            # Verify this is a real LPS component name (u32 length prefix matches)
            if pos >= 4 and read_u32(akp.data, pos - 4) == len(t):
                if first_comp is None or pos < first_comp:
                    first_comp = pos
                break
            pos = data.find(t, pos + 1)

    if first_comp is None:
        return

    # The count field is at first_comp - 20
    # It counts total components minus the original GND terminator (always -1).
    # Verified across 15 TEMPLATE_FINAL snapshots: field = len(get_components()) - 1
    count_off = first_comp - 20
    actual_count = len(components) - 1
    write_u32(akp.data, count_off, actual_count)

    # The block_end field is at first_comp - 28
    # It should point to the end-of-block marker [TAG_65 TAG_65 ...] after the last component
    block_end_off = first_comp - 28
    pattern = bytes([0x65, 0x00, 0x00, 0x00, 0x65, 0x00, 0x00, 0x00])

    # Find the last component's end position
    last_bounds = find_component_boundaries(akp, len(components) - 1)
    if last_bounds:
        search_start = last_bounds[1]
    else:
        search_start = first_comp + 1000

    # Search for the real block_end marker: [TAG_65 TAG_65 self_ref 0000] [TAG_65 TAG_68]
    # The [65 68] suffix distinguishes the real block_end from similar patterns in component blobs.
    new_block_end = None
    for pos in range(search_start, min(search_start + 10000, len(data) - 24)):
        if (data[pos:pos+8] == pattern and
            data[pos+12:pos+16] == b'\x00\x00\x00\x00' and
            data[pos+16:pos+20] == b'\x65\x00\x00\x00' and
            data[pos+20:pos+24] == b'\x68\x00\x00\x00'):
            new_block_end = pos
            break

    if new_block_end is None:
        # Looser fallback: just [65 65 self_ref 0000] with valid self_ref
        for pos in range(search_start, min(search_start + 10000, len(data) - 16)):
            if (data[pos:pos+8] == pattern and
                data[pos+12:pos+16] == b'\x00\x00\x00\x00'):
                self_ref = read_u32(akp.data, pos + 8)
                if pos < self_ref < pos + 0x100:
                    new_block_end = pos
                    break

    if new_block_end is not None:
        write_u32(akp.data, block_end_off, new_block_end)
        # Also fix the self-referencing u32 at block_end + 8
        # It should point to block_end + 0x10
        expected_self_ref = new_block_end + 0x10
        write_u32(akp.data, new_block_end + 8, expected_self_ref)

    # Fix the after_name field: u64 at first_comp - 12 (relative to name string start).
    # Must point to the byte immediately after the first component's type name string.
    # _adjust_pointers shifts it with the old first component, but after inserting
    # a new component at position 0, the first component changes.
    after_name_off = first_comp - 12  # u64 at header byte 24
    first_type_name_len = read_u32(akp.data, first_comp - 4)
    correct_after_name = first_comp + first_type_name_len
    write_u64(akp.data, after_name_off, correct_after_name)


def _strip_repo_header(blob, source_offset):
    """
    If the blob starts with a repository block header [68 65 u32 0000] where
    the u32 end-offset points far past the blob (i.e., it's the repo block,
    not a component-level block), strip those 16 bytes.

    This happens when extracting from small files where the component starts
    right at the repository block boundary.

    Returns (blob, source_offset) — possibly modified.
    """
    if len(blob) < 20:
        return blob, source_offset
    if (blob[0:4] == b'\x68\x00\x00\x00' and
        blob[4:8] == b'\x65\x00\x00\x00' and
        blob[12:16] == b'\x00\x00\x00\x00'):
        end_off = read_u32(blob, 8)
        blob_end = source_offset + len(blob)
        # If end-offset points more than blob_size past the blob, it's a repo header
        if end_off > blob_end + len(blob):
            print(f"Stripping repo block header (end-offset 0x{end_off:06X} >> blob end 0x{blob_end:06X})")
            blob = blob[16:]
            source_offset += 16
    return blob, source_offset


def _fix_blob_outer_block(akp, blob_start, blob_size):
    """
    After insertion, fix any [68 65 u32 0000] patterns in the inserted blob
    whose end-offset points outside the blob (repo block references from the
    source file). Patch them to point to the destination's actual block_end.
    """
    data = akp.data
    blob_end = blob_start + blob_size

    # Find destination's block_end — search ALL component types with LPS validation
    comp_types = [b'DynDriver', b'Duct', b'Waveguide', b'Filter',
                  b'Transform', b'Source', b'Resistor', b'Radiator',
                  b'Encl', b'EnclVented', b'MassAcou', b'GND']
    raw = bytes(data)
    first_comp = None
    for t in comp_types:
        pos = raw.find(t, 0x1000)
        while pos > 0:
            if pos >= 4 and read_u32(data, pos - 4) == len(t):
                lps = pos - 4
                if first_comp is None or lps < first_comp:
                    first_comp = lps
                break
            pos = raw.find(t, pos + 1)
    if first_comp is None:
        return
    block_end = read_u32(data, first_comp - 24)

    # Scan blob range for [68 65 u32 0000] with u32 pointing past the blob
    for i in range(blob_start, min(blob_end - 16, len(data) - 16)):
        if (data[i:i+4] == b'\x68\x00\x00\x00' and
            data[i+4:i+8] == b'\x65\x00\x00\x00' and
            data[i+12:i+16] == b'\x00\x00\x00\x00'):
            val = read_u32(data, i + 8)
            if val > blob_end:
                print(f"  Fixing outer block at 0x{i:06X}: 0x{val:06X} -> 0x{block_end:06X}")
                write_u32(data, i + 8, block_end)


def _fix_blob_tail_ref(akp, blob_start, blob_size):
    """
    Fix 'tail reference' pointers inside the inserted blob that point PAST the
    blob boundary.  These are [TAG_65 u32 00000000] patterns where the u32
    targets the "after-name" position of the NEXT component in the source file.
    After insertion, that offset is stale — patch it to the correct position in
    the destination file.
    Skips [TAG_68 TAG_65 …] patterns (handled by _fix_blob_outer_block).
    """
    data = akp.data
    blob_end = blob_start + blob_size

    # Read the next component's LPS at blob_end
    if blob_end + 4 >= len(data):
        return
    next_name_len = read_u32(data, blob_end)
    if next_name_len == 0 or next_name_len > 50:
        return  # Not an LPS — might be block_end region, skip
    correct_target = blob_end + 4 + next_name_len

    tag65 = b'\x65\x00\x00\x00'
    tag68 = b'\x68\x00\x00\x00'
    zeros = b'\x00\x00\x00\x00'

    # Scan for [TAG_65 u32 00000000] where u32 >= blob_end (outer-pointing).
    # Skip positions preceded by TAG_68 (those are block-end refs).
    for i in range(blob_start, blob_end - 11):
        if (data[i:i+4] == tag65 and
            data[i+8:i+12] == zeros):
            # Skip if preceded by TAG_68 (handled by _fix_blob_outer_block)
            if i >= blob_start + 4 and data[i-4:i] == tag68:
                continue
            val = read_u32(data, i + 4)
            if val >= blob_end:
                print(f"  Fixing tail ref at 0x{i:06X}: 0x{val:06X} -> 0x{correct_target:06X}")
                write_u32(data, i + 4, correct_target)


def _patch_blob_position(blob, x, y):
    """
    Patch the schematic grid position (X, Y) within a component blob.
    Position is stored at "Formula of component" LPS + 154 (X, u32) and +158 (Y, u32).
    Returns the patched blob (bytearray).
    """
    blob = bytearray(blob)
    foc_needle = struct.pack('<I', 20) + b'Formula of component'
    pos = bytes(blob).find(foc_needle)
    if pos < 0:
        print("  WARNING: 'Formula of component' not found in blob, cannot set position")
        return blob
    if pos + 162 > len(blob):
        print("  WARNING: blob too short to patch position")
        return blob
    old_x = read_u32(blob, pos + 154)
    old_y = read_u32(blob, pos + 158)
    write_u32(blob, pos + 154, x)
    write_u32(blob, pos + 158, y)
    print(f"  Position: ({old_x},{old_y}) -> ({x},{y})")
    return bytes(blob)


# ============================================================================
# WIRE INSERTION LOGIC
# ============================================================================

def find_wire_zone_info(akp):
    """
    Find wire zone metadata:
    - wire_count_pos: position of the u32 wire count field
    - wire_insert_pos: position to insert new wires (after last existing wire)
    - current_wire_count: number of existing wires
    - wire_container_block_end_pos: position of the container block end u32
    Returns dict or None.
    """
    data = bytes(akp.data)

    # Find outer_end from component list header
    # Use find_insertion_point (robust: doesn't check TAG_BLOCK, handles rebased blobs)
    first_comp = find_insertion_point(akp)
    if first_comp is None:
        return None
    outer_end = int(read_u64(akp.data, first_comp - 24))
    if outer_end >= len(data) or outer_end < 0x100:
        return None

    # After outer_end: [65 65 self_ref 0000] [65 68 block_end ...]
    # Find the wire container block: TAG_68 after outer_end + 16
    container_block_pos = None
    for p in range(outer_end, min(outer_end + 32, len(data) - 12)):
        if (akp.data[p] == TAG_BLOCK and akp.data[p+1] == 0
                and akp.data[p+2] == 0 and akp.data[p+3] == 0):
            container_block_pos = p
            break
    if container_block_pos is None:
        return None

    container_block_end = int(read_u64(akp.data, container_block_pos + 4))

    # After the container block end, the wire instance header has:
    # [68 65 u32_big_block_end 0000] [u32 wire_count] [65] [u64 after_first_wire_name]
    # The 68 65 pattern at container_block_end
    cbe = container_block_end
    if cbe + 32 > len(data):
        return None

    # Verify [68 65 u32 0000] pattern at container_block_end
    if (akp.data[cbe] == TAG_BLOCK and akp.data[cbe+4] == TAG_NIL):
        wire_container_block_end_pos = cbe + 8  # position of the u32 value
        wire_count_pos = cbe + 16
    else:
        return None

    wire_count = read_u32(akp.data, wire_count_pos)

    # Find wire insertion position (after last wire, or right after header if count=0)
    if wire_count > 0:
        # Find last Wire template, then skip template+instance (520 bytes)
        wire_tpl_positions = []
        pos = cbe
        while True:
            idx = data.find(b'Wire', pos)
            if idx < 0 or idx > len(data) - 8:
                break
            if idx >= 4 and read_u32(akp.data, idx - 4) == 4:
                after = idx + 4
                if (after + 8 <= len(data) and
                        read_u32(akp.data, after) == TAG_NIL and
                        read_u32(akp.data, after + 4) == TAG_BLOCK):
                    wire_tpl_positions.append(idx - 4)
            pos = idx + 1
        if wire_tpl_positions:
            last_wire_tpl = wire_tpl_positions[-1]
            wire_insert_pos = last_wire_tpl + 520  # template + instance
        else:
            wire_insert_pos = wire_count_pos + 16  # after count(4) + NIL(4) + u64 ptr_first(8)
    else:
        # No wires yet: insert right after the wire header
        wire_insert_pos = wire_count_pos + 16  # after count(4) + NIL(4) + u64 ptr_first(8)

    return {
        'wire_count_pos': wire_count_pos,
        'wire_count': wire_count,
        'wire_insert_pos': wire_insert_pos,
        'wire_container_block_end_pos': wire_container_block_end_pos,
        'container_block_pos': container_block_pos,
        'outer_end': outer_end,
    }


def insert_wire(akp, wire_blob, source_offset, x1, y1, x2, y2, flag1=0, flag2=0):
    """
    Insert a wire blob into the wire zone and set its coordinates.
    wire_blob: raw bytes of a wire template+instance (520 bytes)
    source_offset: original absolute position in source file
    x1, y1, x2, y2: grid coordinates for wire endpoints (signed i32)
    flag1, flag2: T-junction flags (0=normal, 1=T-junction)
    Returns True on success.
    """
    info = find_wire_zone_info(akp)
    if info is None:
        print("ERROR: Could not find wire zone")
        return False

    insert_pos = info['wire_insert_pos']
    old_count = info['wire_count']
    print(f"  Wire insert at 0x{insert_pos:06X} (count {old_count} -> {old_count+1})")

    # Rebase wire blob pointers
    adjusted = _rebase_blob_pointers(bytearray(wire_blob), insert_pos, source_offset)
    adjusted = bytearray(adjusted)

    pm = POINTER_MAPS['Wire']
    t_size = pm['template_size']  # 315

    # Set coordinates (signed i32) in the instance part of the adjusted blob
    coord_abs = t_size + pm['coord_offset']
    struct.pack_into('<i', adjusted, coord_abs, x1)
    struct.pack_into('<i', adjusted, coord_abs + 4, y1)
    struct.pack_into('<i', adjusted, coord_abs + 8, x2)
    struct.pack_into('<i', adjusted, coord_abs + 12, y2)

    # Set junction flags
    adjusted[t_size + 0xBB] = flag1
    adjusted[t_size + 0xBC] = flag2
    print(f"  Wire coords: ({x1},{y1}) -> ({x2},{y2}) flags=({flag1},{flag2})")

    # Set this wire as LAST in chain: overwrite chain pointer with [NIL][u32 end+4]
    end_of_new_wires = insert_pos + 520
    write_u32(adjusted, t_size + 0xC5, TAG_NIL)  # NIL tag
    write_u32(adjusted, t_size + 0xC9, end_of_new_wires + 4)  # u32 end+4

    # Insert the blob and adjust file pointers
    akp.insert_blob(insert_pos, bytes(adjusted))

    # 1. Update wire count
    new_count = old_count + 1
    write_u32(akp.data, info['wire_count_pos'], new_count)

    # 2. Fix previous last wire's chain pointer (change [NIL][u32] -> u64)
    if old_count > 0:
        prev_chain_pos = insert_pos - 8  # previous instance's +0xC5 = insert_pos - 205 + 0xC5 = insert_pos - 8
        new_tpl_after_name = insert_pos + 8  # new template LPS end (past "Wire")
        write_u64(akp.data, prev_chain_pos, new_tpl_after_name)

    # 3. Fix wire zone header ptr_last_tail -> new instance + 0xC1
    ptr_last_tail_pos = info['wire_container_block_end_pos']  # = cbe + 8
    new_inst_start = insert_pos + t_size
    write_u64(akp.data, ptr_last_tail_pos, new_inst_start + 0xC1)

    # 4. If this is the first wire, update ptr_first in header
    if old_count == 0:
        ptr_first_pos = info['wire_count_pos'] + 8  # cbe + 24
        write_u64(akp.data, ptr_first_pos, insert_pos + 8)  # first_tpl + 8

    return True


def insert_wire_chain(akp, wire_blob_path, count, start_x=10, y=30, spacing=11, wire_len=3):
    """
    Insert a chain of wires connecting consecutive components.
    Each wire connects the right port of component N to the left port of N+1.
    count: number of wires to insert
    start_x: X position of the first wire's left endpoint
    y: Y grid position (all horizontal)
    spacing: grid distance between consecutive wire starts
    wire_len: length of each wire in grid units
    """
    # Load wire blob
    with open(wire_blob_path, 'rb') as f:
        raw = f.read()
    if raw[:4] == b'AKB\x01':
        source_offset = struct.unpack('<I', raw[4:8])[0]
        wire_blob = raw[8:]
    else:
        source_offset = 0
        wire_blob = raw

    print(f"Wire chain: {count} wires, blob={len(wire_blob)}B, source=0x{source_offset:06X}")

    for i in range(count):
        x1 = start_x + i * spacing
        x2 = x1 + wire_len
        print(f"\n  --- Wire {i+1}/{count} ---")
        ok = insert_wire(akp, wire_blob, source_offset, x1, y, x2, y)
        if not ok:
            print(f"ERROR: Failed to insert wire {i+1}")
            return False

    return True


def _rebase_blob_pointers(blob, new_base, source_offset=None):
    """
    Adjust all internal pointers within a component blob.

    Strategy:
      1. If the blob's component type has a POINTER_MAP, use exact positions
         (zero false positives). This is the preferred path.
      2. Otherwise, fall back to heuristic tag scanning (handles unknown types).

    source_offset: the original absolute position in the source file where the blob
                   was extracted from. If None, uses heuristic detection.
    """
    blob = bytearray(blob)
    blob_len = len(blob)

    # Try precise rebase using POINTER_MAPS
    if source_offset is not None and blob_len > 8:
        name_len = read_u32(blob, 0)
        if 0 < name_len < 50 and 4 + name_len <= blob_len:
            comp_type = blob[4:4+name_len].decode('ascii', errors='replace')
            if comp_type in POINTER_MAPS:
                delta = new_base - source_offset
                if delta == 0:
                    return bytes(blob)
                pm = POINTER_MAPS[comp_type]
                t_size = pm['template_size']
                count = 0
                for pos in pm['template_ptrs']:
                    if pos + 8 <= blob_len:
                        old_val = read_u64(blob, pos)
                        write_u64(blob, pos, old_val + delta)
                        count += 1
                for pos in pm['instance_ptrs']:
                    abs_pos = t_size + pos
                    if abs_pos + 8 <= blob_len:
                        old_val = read_u64(blob, abs_pos)
                        write_u64(blob, abs_pos, old_val + delta)
                        count += 1
                # Also rebase raw u32 pointers if defined
                for pos in pm.get('template_u32_ptrs', []):
                    if pos + 4 <= blob_len:
                        old_val = read_u32(blob, pos)
                        if old_val > 0:
                            write_u32(blob, pos, old_val + delta)
                            count += 1
                for pos in pm.get('instance_u32_ptrs', []):
                    abs_pos = t_size + pos
                    if abs_pos + 4 <= blob_len:
                        old_val = read_u32(blob, abs_pos)
                        if old_val > 0:
                            write_u32(blob, abs_pos, old_val + delta)
                            count += 1
                # Also rebase raw u32 in [65 65 u32 0000] and [68 65 u32 0000]
                # patterns (block-end self-refs and block-start end-offsets).
                # These are NOT tagged u64 pointers and not in the POINTER_MAP.
                original_end = source_offset + blob_len
                tag65 = b'\x65\x00\x00\x00'
                tag68 = b'\x68\x00\x00\x00'
                zeros4 = b'\x00\x00\x00\x00'
                for i in range(blob_len - 16):
                    if blob[i+4:i+8] == tag65 and blob[i+12:i+16] == zeros4:
                        if blob[i:i+4] == tag65 or blob[i:i+4] == tag68:
                            val = read_u32(blob, i + 8)
                            if source_offset <= val < original_end + 0x10000:
                                write_u32(blob, i + 8, val + delta)
                                count += 1
                print(f"  Precise rebase: {count} pointers (delta={delta:+d})")
                return bytes(blob)

    # Fallback: heuristic rebase for unknown component types

    # Determine original base from source_offset or heuristic
    if source_offset is not None:
        original_start = source_offset
    else:
        # Heuristic: collect all tagged pointer values and raw u32 offsets
        all_offsets = []
        for i in range(len(blob) - 11):
            if is_tag(blob, i) and blob[i] in POINTER_TAGS:
                ptr = read_u64(blob, i + 4)
                if 0x1000 < ptr < 0x100000:
                    all_offsets.append(ptr)
        # Also check [65 65 u32 0000] patterns
        for i in range(len(blob) - 16):
            if (blob[i:i+4] == b'\x65\x00\x00\x00' and
                blob[i+4:i+8] == b'\x65\x00\x00\x00' and
                blob[i+12:i+16] == b'\x00\x00\x00\x00'):
                val = read_u32(blob, i + 8)
                if 0x1000 < val < 0x100000:
                    all_offsets.append(val)
        if not all_offsets:
            return bytes(blob)
        min_val = min(all_offsets)
        original_start = min_val

    delta = new_base - original_start
    if delta == 0:
        return bytes(blob)

    original_end = original_start + blob_len
    tag65 = b'\x65\x00\x00\x00'
    tag68 = b'\x68\x00\x00\x00'

    # Build exclusion set: byte positions inside any pointer-tag (66-69) u64 value.
    in_ptr_u64 = set()
    for i in range(len(blob) - 11):
        if is_tag(blob, i) and blob[i] in POINTER_TAGS:
            for j in range(i + 4, min(i + 12, len(blob))):
                in_ptr_u64.add(j)

    # 1. Adjust tagged u64 pointers (66-69)
    for i in range(len(blob) - 11):
        if is_tag(blob, i) and blob[i] in POINTER_TAGS:
            ptr = read_u64(blob, i + 4)
            if original_start <= ptr < original_end + 0x10000:
                new_ptr = ptr + delta
                tgt = int(new_ptr) - new_base
                if 0 <= tgt and tgt + 4 <= len(blob) and is_tag(blob, tgt):
                    write_u64(blob, i + 4, new_ptr)

    # 2. Adjust TAG_NIL u64 pointers (65)
    for i in range(len(blob) - 12):
        if blob[i:i+4] == tag65:
            if i >= 4 and (blob[i-4:i] == tag65 or blob[i-4:i] == tag68):
                continue
            ptr = read_u64(blob, i + 4)
            if original_start <= ptr < original_end + 0x10000:
                # Target validation: only adjust if target is a tag position.
                new_ptr = ptr + delta
                tgt = int(new_ptr) - new_base
                if 0 <= tgt and tgt + 4 <= len(blob) and is_tag(blob, tgt):
                    write_u64(blob, i + 4, new_ptr)

    # 3. Adjust raw u32 in [... TAG_65 u32 00000000] patterns.
    #    Covers [65 65 u32 0000], [68 65 u32 0000], [67 65 u32 0000],
    #    [00 65 u32 0000], [XX 65 u32 0000] — any 4 bytes preceding TAG_65.
    #    Track adjusted positions to avoid double-adjusting.
    adjusted_u32 = set()
    for i in range(len(blob) - 12):
        if (blob[i:i+4] == tag65 and
            blob[i+8:i+12] == b'\x00\x00\x00\x00'):
            ptr_pos = i + 4
            if ptr_pos in adjusted_u32:
                continue
            val = read_u32(blob, ptr_pos)
            if original_start <= val < original_end + 0x10000:
                write_u32(blob, ptr_pos, val + delta)
                adjusted_u32.add(ptr_pos)

    return bytes(blob)


# ============================================================================
# CONFIG FILE WORKFLOW
# ============================================================================

def parse_config(config_path):
    """
    Parse an INI-style configuration file for batch modifications.
    Supports [raw_constants_page1] and [raw_constants_page2] sections with //
    comments (written verbatim to .akp constants blocks), plus legacy
    [raw_constants] for backwards compatibility.
    Also supports standard ConfigParser sections for component formulas and [names].
    """
    with open(config_path, 'r', encoding='utf-8') as f:
        raw_text = f.read()

    # Extract raw_constants_page1 block (CONSTANTE / DIMENSION — smaller block)
    raw_page1 = None
    m = re.search(r'\[raw_constants_page1\]\s*\n(.*?)(?=\n\[|\Z)', raw_text, re.DOTALL)
    if m:
        raw_page1 = m.group(1).strip()

    # Extract raw_constants_page2 block (HP driver + component dims — larger block)
    raw_page2 = None
    m = re.search(r'\[raw_constants_page2\]\s*\n(.*?)(?=\n\[|\Z)', raw_text, re.DOTALL)
    if m:
        raw_page2 = m.group(1).strip()

    # Extract raw_constants_page3 block (layout/graph page — medium block)
    raw_page3 = None
    m = re.search(r'\[raw_constants_page3\]\s*\n(.*?)(?=\n\[|\Z)', raw_text, re.DOTALL)
    if m:
        raw_page3 = m.group(1).strip()

    # Legacy: single [raw_constants] section (both pages combined)
    raw_constants = None
    if not raw_page1 and not raw_page2:
        m = re.search(r'\[raw_constants\]\s*\n(.*?)(?=\n\[|\Z)', raw_text, re.DOTALL)
        if m:
            raw_constants = m.group(1).strip()

    # Remove all raw_constants sections before feeding to ConfigParser
    clean_text = re.sub(r'\[raw_constants(?:_page[123])?\].*?(?=\n\[|\Z)', '', raw_text, flags=re.DOTALL)

    config = configparser.ConfigParser()
    config.optionxform = str  # Preserve case
    config.read_string(clean_text)
    config.raw_constants = raw_constants
    config.raw_page1 = raw_page1
    config.raw_page2 = raw_page2
    config.raw_page3 = raw_page3
    return config


def apply_config(akp, config):
    """
    Apply a complete configuration to an AkpFile.
    Processes raw_constants (page1 + page2, or legacy single block),
    component formulas, and [names].
    """
    changes = 0

    raw_page1 = getattr(config, 'raw_page1', None)
    raw_page2 = getattr(config, 'raw_page2', None)
    raw_page3 = getattr(config, 'raw_page3', None)
    raw_constants = getattr(config, 'raw_constants', None)

    # Find ALL constants blocks (text strings with both '=' and '//')
    # sorted by size ascending so we can match pages to blocks
    const_blocks = []
    for off, slen, text in akp.get_strings(min_len=30):
        if '=' in text and '//' in text:
            const_blocks.append((off, slen, text))
    const_blocks.sort(key=lambda b: b[1])

    if raw_page1 and raw_page2 and len(const_blocks) >= 2:
        # Multi-page mode: match pages to blocks by size order
        # Block order (ascending size): page1 (smallest), page3 (medium), page2 (largest)
        page_map = []
        page_map.append((const_blocks[0], raw_page1, 'Page 1'))   # smallest block
        page_map.append((const_blocks[-1], raw_page2, 'Page 2'))  # largest block
        if raw_page3 and len(const_blocks) >= 3:
            page_map.append((const_blocks[1], raw_page3, 'Page 3'))  # medium block

        for (off, slen, _), raw_text, label in page_map:
            new_text = raw_text.replace('\n', '\r\n')
            byte_len = len(new_text.encode('ascii', errors='replace'))
            if byte_len <= slen:
                akp.replace_string(off, slen, new_text)
                changes += 1
                print(f"  {label} constants replaced ({byte_len}B <= {slen}B block)")
            else:
                print(f"  Warning: {label} text ({byte_len}B) exceeds block ({slen}B)")

    elif raw_constants or config.has_section('constants'):
        # Legacy single-block mode
        const_block = akp.get_constants_block()
        if const_block:
            off, slen, text = const_block
            if raw_constants:
                new_text = raw_constants.replace('\n', '\r\n')
            else:
                const_lines = ['// Constants']
                for var_name, new_value in config.items('constants'):
                    const_lines.append(f'{var_name} = {new_value}')
                new_text = '\r\n'.join(const_lines)
            if len(new_text.encode('ascii', errors='replace')) <= slen:
                akp.replace_string(off, slen, new_text)
                changes += 1
                print(f"  Constants replaced (legacy single block)")
            else:
                print(f"  Warning: constants text ({len(new_text.encode('ascii', errors='replace'))}B) exceeds block ({slen}B)")

    # Apply component formulas
    components = akp.get_components()
    reserved_sections = ('constants', 'names')
    for section in config.sections():
        if section in reserved_sections:
            continue

        # Parse section name: "TypeName.index" or just "TypeName"
        parts = section.split('.')
        comp_type = parts[0]
        comp_idx_filter = int(parts[1]) if len(parts) > 1 else None

        # Build formula text from config values
        lines = []
        for key, value in config.items(section):
            lines.append(f"{key} = {value}")
        formula_text = '\r\n'.join(lines)

        # Find matching component(s)
        type_count = 0
        for cidx, comp in enumerate(components):
            if comp['type'] == comp_type:
                if comp_idx_filter is not None and type_count != comp_idx_filter:
                    type_count += 1
                    continue

                if 'formula_offset' in comp:
                    akp.replace_string(
                        comp['formula_offset'],
                        comp['formula_length'],
                        formula_text
                    )
                    changes += 1
                    print(f"  [{cidx}] {comp['type']} {comp['short_name']} formula updated")

                type_count += 1
                if comp_idx_filter is not None:
                    break

    # Rename components
    if config.has_section('names'):
        for name_key, new_name in config.items('names'):
            parts = name_key.split('.')
            comp_type = parts[0]
            comp_idx = int(parts[1]) if len(parts) > 1 else 0
            type_count = 0
            for comp in components:
                if comp['type'] == comp_type:
                    if type_count == comp_idx:
                        if 'short_name_offset' in comp:
                            akp.replace_string(
                                comp['short_name_offset'],
                                comp['short_name_length'],
                                new_name
                            )
                            changes += 1
                            print(f"  Renamed {comp['type']} {comp['short_name']} -> {new_name}")
                        break
                    type_count += 1

    return changes


# ============================================================================
# OUTPUT / DISPLAY
# ============================================================================

def list_file(filepath):
    """List the contents of an .akp file."""
    akp = AkpFile.from_file(filepath)

    print(f"\n{'='*60}")
    print(f"File: {os.path.basename(filepath)} ({akp.size} bytes)")
    print(f"{'='*60}")

    # Header info
    strings = akp.get_strings()
    for off, slen, text in strings[:6]:
        if any(kw in text for kw in ['RDTeam', '3.1.', '2026', '2025', '2024', 's=ms']):
            print(f"  {text}")

    # Constants
    const_block = akp.get_constants_block()
    if const_block:
        off, slen, text = const_block
        print(f"\n--- CONSTANTS (offset 0x{off:06X}, {slen} bytes) ---")
        for line in text.split('\r\n' if '\r\n' in text else '\n'):
            if line.strip():
                print(f"  {line}")

    # Components
    components = akp.get_components()
    print(f"\n--- LEM COMPONENTS ({len(components)}) ---")
    for i, comp in enumerate(components):
        ctype = comp['type']
        sname = comp['short_name']
        label = f"{ctype} ({sname})"
        if 'formula_text' in comp:
            formula = comp['formula_text'].replace('\r\n', ' | ').replace('\n', ' | ')
            if len(formula) > 70:
                formula = formula[:70] + "..."
            print(f"  [{i:2d}] {label:25s}: {formula}")
        else:
            print(f"  [{i:2d}] {label:25s}: (default params)")

    return akp


def diff_files(filepath1, filepath2):
    """Compare two .akp files and show differences."""
    akp1 = AkpFile.from_file(filepath1)
    akp2 = AkpFile.from_file(filepath2)

    print(f"\n{'='*60}")
    print(f"DIFF: {os.path.basename(filepath1)} vs {os.path.basename(filepath2)}")
    print(f"{'='*60}")
    print(f"  Size: {akp1.size} vs {akp2.size} (delta: {akp2.size - akp1.size})")

    # Compare constants
    c1 = akp1.get_constants_block()
    c2 = akp2.get_constants_block()
    if c1 and c2:
        vars1 = _parse_assignments(c1[2])
        vars2 = _parse_assignments(c2[2])
        all_vars = sorted(set(list(vars1.keys()) + list(vars2.keys())))
        const_diffs = []
        for v in all_vars:
            v1 = vars1.get(v, '(absent)')
            v2 = vars2.get(v, '(absent)')
            if v1 != v2:
                const_diffs.append((v, v1, v2))
        if const_diffs:
            print(f"\n  Constants differences:")
            for v, v1, v2 in const_diffs:
                print(f"    {v}: {v1} -> {v2}")
        else:
            print(f"\n  Constants: identical")

    # Compare components
    comp1 = akp1.get_components()
    comp2 = akp2.get_components()
    print(f"\n  Components: {len(comp1)} vs {len(comp2)}")

    # Match by index
    max_len = max(len(comp1), len(comp2))
    for i in range(max_len):
        c1 = comp1[i] if i < len(comp1) else None
        c2 = comp2[i] if i < len(comp2) else None

        if c1 is None:
            print(f"    [{i}] ADDED: {c2['type']} ({c2['short_name']})")
        elif c2 is None:
            print(f"    [{i}] REMOVED: {c1['type']} ({c1['short_name']})")
        elif c1['type'] != c2['type']:
            print(f"    [{i}] TYPE CHANGED: {c1['type']} -> {c2['type']}")
        else:
            f1 = c1.get('formula_text', '')
            f2 = c2.get('formula_text', '')
            if f1 != f2:
                print(f"    [{i}] {c1['type']} ({c1['short_name']}): formula changed")
                # Show line-by-line diff
                lines1 = f1.split('\r\n')
                lines2 = f2.split('\r\n')
                for l1, l2 in zip(lines1, lines2):
                    if l1 != l2:
                        print(f"         - {l1}")
                        print(f"         + {l2}")


def _parse_assignments(text):
    """Parse 'VAR = value' lines into a dict."""
    result = {}
    for line in text.replace('\r\n', '\n').split('\n'):
        line = line.strip()
        if '//' in line:
            line = line[:line.index('//')]
        m = re.match(r'(\w+)\s*=\s*(.+)', line.strip())
        if m:
            result[m.group(1)] = m.group(2).strip()
    return result


# ============================================================================
# TEMPLATE SYSTEM
# ============================================================================

LEM_TEMPLATES = {
    'DynDriver': {
        'desc': 'Haut-parleur electrodynamique',
        'props': {
            'SDf': ('Surface frontale', 'cm2', 855.0),
            'SDr': ('Surface arriere', 'cm2', 855.0),
            'Mms': ('Masse mobile', 'g', 50.0),
            'fs': ('Frequence resonance', 'Hz', 40.0),
            'Qms': ('Q mecanique', '', 5.0),
            'Re': ('Resistance DC bobine', 'Ohm', 6.0),
            'BL': ('Facteur de force', 'T*m', 10.0),
            'Le': ('Inductance bobine', 'mH', 1.0),
        },
        'formula': 'SDf = {SDf}\r\nSDr = {SDr}\r\nMms = {Mms}\r\nfs  = {fs}\r\nQms = {Qms}\r\nRe  = {Re}\r\nBL  = {BL}\r\nLe  = {Le}',
    },
    'Duct': {
        'desc': 'Conduit acoustique rectangulaire',
        'props': {
            'WD': ('Largeur', 'mm', 100),
            'HD': ('Hauteur', 'mm', 100),
            'Len': ('Longueur', 'mm', 200),
            'eta': ('Amortissement', '', 0.01),
        },
        'formula': 'WD  = {WD}\r\nHD  = {HD}\r\nLen = {Len}\r\neta = {eta}',
    },
    'Waveguide': {
        'desc': 'Guide d\'onde / pavillon',
        'props': {
            'HTh': ('Hauteur gorge', 'mm', 100),
            'HMo': ('Hauteur bouche', 'mm', 200),
            'WTh': ('Largeur gorge', 'mm', 50),
            'WMo': ('Largeur bouche', 'mm', 100),
            'Len': ('Longueur', 'mm', 300),
            'T': ('Facteur Salmon', '', 10),
        },
        'formula': 'HTh = {HTh}\r\nHMo = {HMo}\r\nWTh = {WTh}\r\nWMo = {WMo}\r\nLen = {Len}\r\nT   = {T}',
    },
    'Volume': {
        'desc': 'Volume / chambre acoustique',
        'props': {
            'HCab': ('Hauteur enceinte', 'mm', 500),
            'WCab': ('Largeur', 'mm', 300),
            'LenCab': ('Profondeur', 'mm', 400),
            'HD': ('Hauteur port', 'mm', 100),
            'WD': ('Largeur port', 'mm', 100),
        },
        'formula': 'HCab   = {HCab}\r\nWCab   = {WCab}\r\nLenCab = {LenCab}\r\n\r\nHD  = {HD}\r\nWD  = {WD}',
    },
    'Filter': {'desc': 'Filtre electrique', 'props': {}, 'formula': ''},
    'Resistor': {'desc': 'Resistance', 'props': {}, 'formula': ''},
    'Source': {'desc': 'Source de tension/courant', 'props': {}, 'formula': ''},
}


def show_templates():
    """Display available component templates."""
    print(f"\n{'='*60}")
    print("LEM COMPONENT TEMPLATES")
    print(f"{'='*60}")
    for name, tmpl in LEM_TEMPLATES.items():
        print(f"\n  [{name}] - {tmpl['desc']}")
        for prop, (desc, unit, default) in tmpl['props'].items():
            unit_str = f" ({unit})" if unit else ""
            print(f"    {prop:10s} = {default}{unit_str}  - {desc}")


def generate_formula(comp_type, params=None):
    """Generate a formula string for a component type."""
    if comp_type not in LEM_TEMPLATES:
        avail = ', '.join(LEM_TEMPLATES.keys())
        raise ValueError(f"Unknown type: {comp_type}. Available: {avail}")

    tmpl = LEM_TEMPLATES[comp_type]
    values = {k: v[2] for k, v in tmpl['props'].items()}
    if params:
        values.update(params)
    return tmpl['formula'].format(**values)


# ============================================================================
# CLI MAIN
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='AKAbak .akp File Tool v2',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s list "SZKCH-115LM LEM.akp"
  %(prog)s patch "SZKCH-115LM LEM.akp" output.akp --set "HEIGHT=700,WIDTH=500"
  %(prog)s formula "SZKCH-115LM LEM.akp" output.akp --comp 0 --formula "SDf=900\\nSDr=900"
  %(prog)s apply "SZKCH-115LM LEM.akp" output.akp --config projet.ini
  %(prog)s extract "SZKCH-115LM LEM.akp" --comp 0 --out dyndriver.bin
  %(prog)s insert 2.akp output.akp --blob dyndriver.bin
  %(prog)s duplicate "SZKCH-115LM LEM.akp" output.akp --comp 2
  %(prog)s generate DynDriver --params "SDf=855,Mms=173"
  %(prog)s rename "TEMPLATE LEM.akp" output.akp --name "SZKCH-115LM"
  %(prog)s diff "file1.akp" "file2.akp"
  %(prog)s wire input.akp output.akp --blob wire.akb --count 4
  %(prog)s templates
        """
    )

    sub = parser.add_subparsers(dest='cmd')

    # list
    p = sub.add_parser('list', help='List file contents')
    p.add_argument('file')

    # templates
    sub.add_parser('templates', help='Show component templates')

    # patch constants
    p = sub.add_parser('patch', help='Patch constants')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--set', required=True, help='VAR1=val1,VAR2=val2')

    # patch formula
    p = sub.add_parser('formula', help='Patch component formula')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--comp', type=int, required=True, help='Component index')
    p.add_argument('--formula', required=True, help='New formula (\\n for newlines)')

    # apply config
    p = sub.add_parser('apply', help='Apply config file')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--config', required=True, help='INI config file path')

    # extract component
    p = sub.add_parser('extract', help='Extract component blob')
    p.add_argument('file')
    p.add_argument('--comp', type=int, required=True)
    p.add_argument('--out', required=True, help='Output blob file')

    # insert component
    p = sub.add_parser('insert', help='Insert component blob')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--blob', required=True, help='Component blob file')
    p.add_argument('--pos', help='Grid position X,Y (e.g. --pos 64,9)')

    # batch-insert: insert N components of the same type as a touching chain
    p = sub.add_parser('batch-insert', help='Insert N components as touching chain')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--blob', required=True, help='Component blob file')
    p.add_argument('--count', '-n', type=int, required=True, help='Number to insert')
    p.add_argument('--start-x', type=int, default=64, help='X of first component (default: 64 = after DynDriver)')
    p.add_argument('--start-y', type=int, default=9, help='Y of first component (default: 9 = port at Y=12)')
    p.add_argument('--reverse', action='store_true', help='Insert in reverse order so comp 0 (closest to driver) appears first in file')

    # duplicate component
    p = sub.add_parser('duplicate', help='Duplicate a component')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--comp', type=int, required=True)
    p.add_argument('--formula', help='New formula for the duplicate')

    # generate formula
    p = sub.add_parser('generate', help='Generate formula text')
    p.add_argument('type', help='Component type')
    p.add_argument('--params', help='param1=val1,param2=val2')

    # reposition component
    p = sub.add_parser('reposition', help='Move a component to a new grid position')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--comp', required=True, help='Component type.index (e.g. Radiator.0)')
    p.add_argument('--pos', required=True, help='New grid position X,Y (e.g. 88,12)')

    # rename project
    p = sub.add_parser('rename', help='Rename project (name + hex paths)')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--name', required=True, help='New project name')

    # diff
    p = sub.add_parser('diff', help='Compare two files')
    p.add_argument('file1')
    p.add_argument('file2')

    # wire chain
    p = sub.add_parser('wire', help='Insert wires to chain components')
    p.add_argument('file')
    p.add_argument('output')
    p.add_argument('--blob', required=True, help='Wire blob file (.akb)')
    p.add_argument('--count', type=int, required=True, help='Number of wires')
    p.add_argument('--x', type=int, default=10, help='Start X position (default: 10)')
    p.add_argument('--y', type=int, default=30, help='Y position (default: 30)')
    p.add_argument('--spacing', type=int, default=11, help='Spacing between wires (default: 11)')
    p.add_argument('--wirelen', type=int, default=3, help='Wire length in grid units (default: 3)')

    args = parser.parse_args()

    if args.cmd == 'list':
        list_file(args.file)

    elif args.cmd == 'templates':
        show_templates()

    elif args.cmd == 'patch':
        akp = AkpFile.from_file(args.file)
        const_block = akp.get_constants_block()
        if not const_block:
            print("ERROR: No constants block found")
            return
        off, slen, text = const_block
        new_text = text
        for pair in args.set.split(','):
            key, val = pair.split('=', 1)
            pattern = rf'(?<!\w)({re.escape(key.strip())})\s*=\s*([^\r\n]+)'
            new_text = re.sub(pattern, rf'\g<1> = {val.strip()}', new_text)
        if new_text != text:
            akp.replace_string(off, slen, new_text)
            akp.update_date()
            akp.save(args.output)
        else:
            print("No changes made")

    elif args.cmd == 'formula':
        akp = AkpFile.from_file(args.file)
        components = akp.get_components()
        if args.comp >= len(components):
            print(f"ERROR: Index {args.comp} invalid (max: {len(components)-1})")
            return
        comp = components[args.comp]
        if 'formula_offset' not in comp:
            print(f"ERROR: Component [{args.comp}] {comp['type']} has no formula")
            return
        formula = args.formula.replace('\\r\\n', '\r\n').replace('\\n', '\r\n')
        akp.replace_string(comp['formula_offset'], comp['formula_length'], formula)
        akp.update_date()
        akp.save(args.output)
        print(f"Formula updated for [{args.comp}] {comp['type']} {comp['short_name']}")

    elif args.cmd == 'apply':
        akp = AkpFile.from_file(args.file)
        config = parse_config(args.config)
        changes = apply_config(akp, config)
        if changes > 0:
            akp.update_date()
        akp.save(args.output)
        print(f"Applied {changes} changes")

    elif args.cmd == 'extract':
        akp = AkpFile.from_file(args.file)
        blob, source_offset = extract_component_blob(akp, args.comp)
        if blob:
            with open(args.out, 'wb') as f:
                # AKB header: magic + source_offset for pointer rebasing
                f.write(b'AKB\x01')
                f.write(struct.pack('<I', source_offset))
                f.write(blob)
            print(f"Blob saved: {args.out} ({len(blob)} bytes, source_offset=0x{source_offset:06X})")

    elif args.cmd == 'insert':
        akp = AkpFile.from_file(args.file)
        with open(args.blob, 'rb') as f:
            raw = f.read()
        # Parse AKB header if present
        if raw[:4] == b'AKB\x01':
            source_offset = struct.unpack('<I', raw[4:8])[0]
            blob = raw[8:]
            print(f"AKB blob: {len(blob)} bytes, source_offset=0x{source_offset:06X}")
        else:
            source_offset = None
            blob = raw
            print(f"Raw blob (no AKB header): {len(blob)} bytes")
        insert_pos = find_insertion_point(akp)
        print(f"Inserting at 0x{insert_pos:06X}")
        # Strip repo block header if present (from small source files)
        blob, source_offset = _strip_repo_header(bytearray(blob), source_offset)
        adjusted = _rebase_blob_pointers(bytearray(blob), insert_pos, source_offset)
        # Patch position if requested
        if args.pos:
            px, py = [int(v) for v in args.pos.split(',')]
            adjusted = _patch_blob_position(bytearray(adjusted), px, py)
        blob_size = len(adjusted)
        akp.insert_blob(insert_pos, adjusted)
        _fix_component_metadata(akp)
        _fix_blob_outer_block(akp, insert_pos, blob_size)
        _fix_blob_tail_ref(akp, insert_pos, blob_size)
        akp.update_date()
        akp.save(args.output)
        print(f"Saved: {args.output}")

    elif args.cmd == 'batch-insert':
        akp = AkpFile.from_file(args.file)
        with open(args.blob, 'rb') as f:
            raw = f.read()
        if raw[:4] == b'AKB\x01':
            source_offset = struct.unpack('<I', raw[4:8])[0]
            blob_template = raw[8:]
        else:
            source_offset = None
            blob_template = raw

        # Detect component width from blob
        name_len = read_u32(blob_template, 0)
        comp_type = blob_template[4:4+name_len].decode('ascii', errors='replace') if 0 < name_len < 50 else ''
        dims = COMPONENT_DIMS.get(comp_type, {'width': 8})
        comp_width = dims['width']

        print(f"Batch insert: {args.count}x {comp_type} (width={comp_width})")
        print(f"  Chain: X={args.start_x}..{args.start_x + (args.count-1)*comp_width}, Y={args.start_y}")

        # Determine iteration order: --reverse inserts farthest first so closest
        # ends up as the first component in the file (AkpFile inserts at beginning)
        indices = list(range(args.count))
        if args.reverse:
            indices = list(reversed(indices))

        for i in indices:
            x = args.start_x + i * comp_width
            y = args.start_y
            blob = bytes(blob_template)  # Fresh copy each time
            insert_pos = find_insertion_point(akp)
            print(f"\n  --- Component {i+1}/{args.count} at ({x},{y}) ---")
            blob, so = _strip_repo_header(bytearray(blob), source_offset)
            adjusted = _rebase_blob_pointers(bytearray(blob), insert_pos, so)
            adjusted = _patch_blob_position(bytearray(adjusted), x, y)
            blob_size = len(adjusted)
            akp.insert_blob(insert_pos, adjusted)
            _fix_component_metadata(akp)
            _fix_blob_outer_block(akp, insert_pos, blob_size)
            _fix_blob_tail_ref(akp, insert_pos, blob_size)

        akp.update_date()
        akp.save(args.output)
        print(f"\nSaved: {args.output} ({len(akp.data)} bytes)")

    elif args.cmd == 'duplicate':
        akp = AkpFile.from_file(args.file)
        formula = args.formula.replace('\\n', '\r\n') if args.formula else None
        result = duplicate_component(akp, args.comp, formula)
        if result:
            result.update_date()
            result.save(args.output)

    elif args.cmd == 'generate':
        params = {}
        if args.params:
            for pair in args.params.split(','):
                key, val = pair.split('=', 1)
                params[key.strip()] = val.strip()
        formula = generate_formula(args.type, params)
        print(f"Formula for {args.type}:")
        print(formula)

    elif args.cmd == 'reposition':
        akp = AkpFile.from_file(args.file)
        comp_type, comp_idx = args.comp.rsplit('.', 1)
        comp_idx = int(comp_idx)
        x, y = [int(v) for v in args.pos.split(',')]
        # Build a map of component type → list of FoC offsets
        foc_needle = struct.pack('<I', 20) + b'Formula of component'
        comp_names = [b'DynDriver', b'Duct', b'Waveguide', b'Filter',
                      b'Transform', b'Source', b'Resistor', b'Radiator',
                      b'Encl', b'EnclVented', b'MassAcou', b'GND']
        data = akp.data
        raw = bytes(data)
        # Find all component type LPSs and their nearest FoC
        type_focs = {}  # {type_name: [foc_offset, ...]}
        for cname in comp_names:
            lps = struct.pack('<I', len(cname)) + cname
            p = 0
            while True:
                p = raw.find(lps, p)
                if p < 0:
                    break
                # The FoC should be within ~600 bytes after the type name
                foc_pos = raw.find(foc_needle, p, p + 5000)
                if foc_pos >= 0:
                    nm = cname.decode('ascii')
                    focs = type_focs.setdefault(nm, [])
                    if foc_pos not in focs:
                        focs.append(foc_pos)
                p += 1
        if comp_type not in type_focs or comp_idx >= len(type_focs[comp_type]):
            print(f"ERROR: {args.comp} not found")
            sys.exit(1)
        foc_off = type_focs[comp_type][comp_idx]
        old_x = struct.unpack_from('<i', data, foc_off + 154)[0]
        old_y = struct.unpack_from('<i', data, foc_off + 158)[0]
        struct.pack_into('<i', data, foc_off + 154, x)
        struct.pack_into('<i', data, foc_off + 158, y)
        print(f"Repositioned {comp_type}.{comp_idx}: ({old_x},{old_y}) -> ({x},{y})")
        akp.update_date()
        akp.save(args.output)

    elif args.cmd == 'rename':
        akp = AkpFile.from_file(args.file)
        old_name = akp.rename_project(args.name)
        akp.update_date()
        akp.save(args.output)
        print(f"Renamed: '{old_name}' -> '{args.name}'")

    elif args.cmd == 'diff':
        diff_files(args.file1, args.file2)

    elif args.cmd == 'wire':
        akp = AkpFile.from_file(args.file)
        ok = insert_wire_chain(akp, args.blob, args.count,
                               start_x=args.x, y=args.y,
                               spacing=args.spacing, wire_len=args.wirelen)
        if ok:
            akp.update_date()
            akp.save(args.output)
        else:
            print("Wire insertion failed")

    else:
        parser.print_help()


if __name__ == '__main__':
    main()
