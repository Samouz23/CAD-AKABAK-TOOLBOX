"""
AKP Watcher - Surveillance en temps reel des fichiers .akp
===========================================================
Surveille un fichier (ou dossier) .akp et trace automatiquement
chaque modification faite par AKAbak.

A chaque changement detecte:
  1. Affiche un resume rapide (taille, delta, timestamp)
  2. Lance le diff semantique (constantes, composants, formules)
  3. Lance le diff binaire structurel (insertions, modifications)
  4. Sauvegarde un snapshot numerote pour historique

Usage:
  python akp_watcher.py <fichier.akp>               # Surveille un fichier
  python akp_watcher.py <fichier.akp> --interval 2   # Poll toutes les 2 sec
  python akp_watcher.py <fichier.akp> --log watch.log # Log dans un fichier
  python akp_watcher.py <fichier.akp> --snapshots     # Garde les snapshots
  python akp_watcher.py *.akp                         # Surveille plusieurs fichiers

Appuyer Ctrl+C pour arreter la surveillance.
"""

import struct
import os
import sys
import time
import shutil
import glob
import hashlib
from datetime import datetime

# ── Import des outils existants ──────────────────────────────────────────────

# Ajouter script/ au path pour smart_diff
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'script'))

try:
    from akabak_tool_v2 import AkpFile, diff_files as semantic_diff
    HAS_SEMANTIC = True
except ImportError:
    HAS_SEMANTIC = False

try:
    from smart_diff import find_alignment, find_all_matching_blocks, annotate_position
    HAS_SMART_DIFF = True
except ImportError:
    HAS_SMART_DIFF = False


# ── Constantes ───────────────────────────────────────────────────────────────

TAG_NIL   = 0x65
TAG_REF66 = 0x66
TAG_REF67 = 0x67
TAG_BLOCK = 0x68
TAG_REF69 = 0x69
POINTER_TAGS = (TAG_REF66, TAG_REF67, TAG_BLOCK, TAG_REF69)


# ── Fonctions d'analyse ─────────────────────────────────────────────────────

def file_hash(filepath):
    """SHA-256 rapide d'un fichier."""
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def quick_summary(data):
    """Resume rapide d'un fichier .akp : taille, nb strings, nb composants."""
    size = len(data)

    # Compter les strings
    strings = []
    pos = 0
    while pos < size - 4:
        slen = struct.unpack_from('<I', data, pos)[0]
        if 1 <= slen <= 5000 and pos + 4 + slen <= size:
            chunk = data[pos+4:pos+4+slen]
            if all(0x09 <= c <= 0x7E or c == 0x0D for c in chunk):
                try:
                    strings.append((pos, slen, chunk.decode('ascii')))
                    pos += 4 + slen
                    continue
                except:
                    pass
        pos += 1

    # Trouver les noms de composants
    comp_types = ["DynDriver", "Waveguide", "Duct", "Resistor",
                  "Filter", "Source", "Transform"]
    comps = []
    for off, slen, text in strings:
        if text in comp_types:
            comps.append((off, text))

    return {
        'size': size,
        'num_strings': len(strings),
        'components': comps,
        'strings': strings,
    }


def binary_diff_summary(data_old, data_new, label_old="AVANT", label_new="APRES"):
    """Diff binaire compact entre deux versions."""
    n1, n2 = len(data_old), len(data_new)

    # Prefix/suffix commun
    prefix_len = 0
    for i in range(min(n1, n2)):
        if data_old[i] != data_new[i]:
            break
        prefix_len += 1

    suffix_len = 0
    for i in range(1, min(n1 - prefix_len, n2 - prefix_len) + 1):
        if data_old[n1 - i] != data_new[n2 - i]:
            break
        suffix_len += 1

    mid1_start = prefix_len
    mid1_end = n1 - suffix_len
    mid2_start = prefix_len
    mid2_end = n2 - suffix_len

    print(f"\n  --- DIFF BINAIRE ---")
    print(f"  Taille: {n1} -> {n2} (delta: {n2 - n1:+d} octets)")
    print(f"  Prefixe commun: {prefix_len} octets (0x{prefix_len:04X})")
    print(f"  Suffixe commun: {suffix_len} octets")
    print(f"  Region modifiee dans {label_old}: [0x{mid1_start:06X} - 0x{mid1_end:06X}] ({mid1_end - mid1_start} octets)")
    print(f"  Region modifiee dans {label_new}: [0x{mid2_start:06X} - 0x{mid2_end:06X}] ({mid2_end - mid2_start} octets)")

    # Detail des modifications si petit changement
    changed_bytes = 0
    for i in range(min(n1, n2)):
        if data_old[i] != data_new[i]:
            changed_bytes += 1

    print(f"  Octets differents (dans la zone commune): {changed_bytes}")

    # Si le changement est petit, montrer le detail
    if mid1_end - mid1_start < 500 and mid2_end - mid2_start < 500:
        _show_small_diff(data_old, data_new, mid1_start, mid1_end, mid2_start, mid2_end)

    return prefix_len, suffix_len


def _show_small_diff(data_old, data_new, s1, e1, s2, e2):
    """Affiche le detail d'un petit changement."""
    chunk_old = data_old[s1:e1]
    chunk_new = data_new[s2:e2]

    # Essayer d'interpreter comme strings
    _try_show_strings_near(data_old, s1, "  AVANT")
    _try_show_strings_near(data_new, s2, "  APRES")

    # Hex dump compact
    if len(chunk_old) <= 128:
        print(f"  AVANT hex: {chunk_old.hex(' ')}")
    if len(chunk_new) <= 128:
        print(f"  APRES hex: {chunk_new.hex(' ')}")

    # Pointer changes  
    _show_pointer_changes(data_old, data_new, s1, e1, s2, e2)


def _try_show_strings_near(data, pos, prefix):
    """Montre les strings proches d'un offset."""
    found = []
    search_start = max(0, pos - 100)
    search_end = min(len(data), pos + 200)
    p = search_start
    while p < search_end - 4:
        slen = struct.unpack_from('<I', data, p)[0]
        if 1 <= slen <= 500 and p + 4 + slen <= len(data):
            chunk = data[p+4:p+4+slen]
            if all(0x09 <= c <= 0x7E or c == 0x0D for c in chunk):
                try:
                    text = chunk.decode('ascii')
                    rel = p - pos
                    found.append((rel, text[:60]))
                    p += 4 + slen
                    continue
                except:
                    pass
        p += 1
    if found:
        for rel, text in found[:5]:
            print(f"  {prefix} [{rel:+d}]: \"{text}\"")


def _show_pointer_changes(data_old, data_new, s1, e1, s2, e2):
    """Compare les pointeurs tagged dans la zone modifiee."""
    ptrs_old = _scan_pointers(data_old, max(0, s1 - 12), min(len(data_old), e1 + 12))
    ptrs_new = _scan_pointers(data_new, max(0, s2 - 12), min(len(data_new), e2 + 12))

    if ptrs_old or ptrs_new:
        print(f"\n  --- POINTEURS MODIFIES ---")
        # Match by relative position to change start
        for off, tag, val in ptrs_old:
            rel = off - s1
            print(f"    AVANT [0x{off:06X}] (rel {rel:+d}): tag=0x{tag:02X} val=0x{val:08X}")
        for off, tag, val in ptrs_new:
            rel = off - s2
            print(f"    APRES [0x{off:06X}] (rel {rel:+d}): tag=0x{tag:02X} val=0x{val:08X}")


def _scan_pointers(data, start, end):
    """Scan tagged pointers dans une region."""
    ptrs = []
    pos = start
    while pos < end - 12 and pos < len(data) - 12:
        if (data[pos] in POINTER_TAGS and
            data[pos+1] == 0 and data[pos+2] == 0 and data[pos+3] == 0):
            val = struct.unpack_from('<Q', data, pos + 4)[0]
            if val < len(data) * 2:  # Pointer plausible
                ptrs.append((pos, data[pos], val))
        pos += 1
    return ptrs


def semantic_diff_summary(filepath_old, filepath_new):
    """Diff semantique via akabak_tool_v2 (constantes, composants, formules)."""
    if not HAS_SEMANTIC:
        print("  (akabak_tool_v2 non disponible pour le diff semantique)")
        return

    try:
        semantic_diff(filepath_old, filepath_new)
    except Exception as e:
        print(f"  Erreur diff semantique: {e}")


def structural_diff_summary(data_old, data_new):
    """Diff structurel via smart_diff (blocs, insertions, shifts).
    Consolide les micro-changements (pointeurs relocalises) en zones."""
    if not HAS_SMART_DIFF:
        return

    try:
        matches = find_all_matching_blocks(data_old, data_new, min_block=32)

        # Filtrer en ordre
        ordered = []
        last_i1 = -1
        last_i2 = -1
        for i1, i2, mlen in sorted(matches, key=lambda x: x[0]):
            if i1 > last_i1 and i2 > last_i2:
                ordered.append((i1, i2, mlen))
                last_i1 = i1 + mlen
                last_i2 = i2 + mlen

        if not ordered:
            return

        # Collecter toutes les regions de gap
        raw_regions = []
        prev_end1 = 0
        prev_end2 = 0
        for i1, i2, mlen in ordered:
            gap1 = i1 - prev_end1
            gap2 = i2 - prev_end2
            if gap1 > 0 or gap2 > 0:
                raw_regions.append((prev_end1, i1, prev_end2, i2, gap1, gap2))
            prev_end1 = i1 + mlen
            prev_end2 = i2 + mlen

        # Consolider: fusionner les micro-regions proches (< 64B gap entre elles)
        MERGE_GAP = 64
        consolidated = []
        for r in raw_regions:
            s1, e1, s2, e2, g1, g2 = r
            if consolidated:
                ps1, pe1, ps2, pe2, pg1, pg2 = consolidated[-1]
                # Si la region commence proche de la fin de la precedente, fusionner
                if s1 - pe1 < MERGE_GAP:
                    consolidated[-1] = (ps1, e1, ps2, e2, e1 - ps1, e2 - ps2)
                    continue
            consolidated.append(r)

        # Categoriser les regions consolidees
        insertions = []
        deletions = []
        pointer_relocs = []  # petites modifications (1-4B), typiquement des pointeurs
        real_mods = []

        for s1, e1, s2, e2, g1, g2 in consolidated:
            net = g2 - g1
            if g1 == 0:
                insertions.append((s1, e1, s2, e2, g1, g2))
            elif g2 == 0:
                deletions.append((s1, e1, s2, e2, g1, g2))
            elif g1 == g2 and _is_pointer_relocation_zone(data_old, data_new, s1, e1, s2, e2):
                pointer_relocs.append((s1, e1, s2, e2, g1, g2))
            else:
                real_mods.append((s1, e1, s2, e2, g1, g2))

        # Affichage
        total_regions = len(consolidated)
        print(f"\n  --- ANALYSE STRUCTURELLE ({len(ordered)} blocs, {total_regions} regions) ---")

        if insertions:
            total_ins = sum(g2 for _, _, _, _, _, g2 in insertions)
            print(f"\n  INSERTIONS ({len(insertions)} zones, {total_ins} octets total):")
            for s1, e1, s2, e2, g1, g2 in insertions:
                ctx = annotate_position(data_new, s2) if s2 < len(data_new) else ""
                print(f"    +{g2}B a 0x{s2:06X} (apres f1:0x{s1:06X}){' - ' + ctx if ctx else ''}")

        if deletions:
            total_del = sum(g1 for _, _, _, _, g1, _ in deletions)
            print(f"\n  SUPPRESSIONS ({len(deletions)} zones, {total_del} octets total):")
            for s1, e1, s2, e2, g1, g2 in deletions:
                ctx = annotate_position(data_old, s1) if s1 < len(data_old) else ""
                print(f"    -{g1}B a 0x{s1:06X}{' - ' + ctx if ctx else ''}")

        if real_mods:
            print(f"\n  MODIFICATIONS ({len(real_mods)} zones):")
            for s1, e1, s2, e2, g1, g2 in real_mods:
                net = g2 - g1
                ctx = annotate_position(data_old, s1) if s1 < len(data_old) else ""
                print(f"    0x{s1:06X}-0x{e1:06X} ({g1}B) -> 0x{s2:06X}-0x{e2:06X} ({g2}B) net {net:+d}")
                if ctx:
                    print(f"      {ctx}")
                # Montrer le contenu si raisonnable
                if g1 <= 64:
                    print(f"      AVANT: {data_old[s1:e1].hex(' ')}")
                if g2 <= 64:
                    print(f"      APRES: {data_new[s2:e2].hex(' ')}")

        if pointer_relocs:
            # Resumer les relocalisations de pointeurs (ne pas spammer)
            total_reloc_bytes = sum(g1 for _, _, _, _, g1, _ in pointer_relocs)
            first = pointer_relocs[0]
            last = pointer_relocs[-1]
            print(f"\n  RELOCALISATIONS DE POINTEURS: {len(pointer_relocs)} zones consolidees")
            print(f"    Range: 0x{first[0]:06X} - 0x{last[1]:06X} ({total_reloc_bytes} octets modifies)")

            # Calculer le shift moyen
            shifts = set()
            for s1, e1, s2, e2, g1, g2 in pointer_relocs[:10]:
                for off in range(s1, min(e1, s1 + 50)):
                    if off + 1 < len(data_old) and s2 + (off - s1) + 1 < len(data_new):
                        d_old = data_old[off]
                        d_new = data_new[s2 + (off - s1)]
                        if d_old != d_new:
                            diff_val = d_new - d_old
                            if diff_val != 0:
                                shifts.add(diff_val)
            if shifts and len(shifts) <= 3:
                print(f"    Delta valeurs: {shifts}")

    except Exception as e:
        print(f"  Erreur analyse structurelle: {e}")


def _is_pointer_relocation_zone(data_old, data_new, s1, e1, s2, e2):
    """Heuristique: une zone est une relocalisation de pointeurs si
    les changements sont petits et reguliers (1-2 octets par point)."""
    g1 = e1 - s1
    g2 = e2 - s2
    if g1 != g2:
        return False
    # Compter les octets qui different
    changed = 0
    for i in range(g1):
        if data_old[s1 + i] != data_new[s2 + i]:
            changed += 1
    # Si peu d'octets changent par rapport a la taille de la zone
    # c'est probablement des pointeurs (1-2 octets LSB sur 8B)
    return changed <= g1 * 0.5  # Moins de la moitie des octets modifies


# ── Moteur de surveillance ───────────────────────────────────────────────────

class AkpWatcher:
    def __init__(self, filepaths, interval=1.0, log_file=None, keep_snapshots=False):
        self.filepaths = filepaths
        self.interval = interval
        self.log_file = log_file
        self.keep_snapshots = keep_snapshots
        self.states = {}  # filepath -> {hash, mtime, size, data, snapshot_dir, change_count}
        self.snapshot_dir = os.path.join(os.path.dirname(filepaths[0]) or '.', '_akp_snapshots')

    def initialize(self):
        """Prend le snapshot initial de chaque fichier."""
        print(f"\n{'='*70}")
        print(f"AKP WATCHER - Surveillance en temps reel")
        print(f"{'='*70}")
        print(f"Fichiers surveilles: {len(self.filepaths)}")
        print(f"Intervalle de poll: {self.interval}s")
        if self.keep_snapshots:
            print(f"Snapshots dans: {self.snapshot_dir}")
            os.makedirs(self.snapshot_dir, exist_ok=True)
        print(f"Ctrl+C pour arreter\n")

        for fp in self.filepaths:
            fp = os.path.abspath(fp)
            if not os.path.exists(fp):
                print(f"  ATTENTION: {fp} n'existe pas encore, sera surveille quand cree")
                self.states[fp] = None
                continue

            data = open(fp, 'rb').read()
            h = hashlib.sha256(data).hexdigest()
            stat = os.stat(fp)
            summary = quick_summary(data)

            self.states[fp] = {
                'hash': h,
                'mtime': stat.st_mtime,
                'size': stat.st_size,
                'data': data,
                'change_count': 0,
            }

            print(f"  {os.path.basename(fp)}: {stat.st_size} octets, "
                  f"{len(summary['components'])} composants, "
                  f"{summary['num_strings']} strings")

            # Sauver snapshot initial
            if self.keep_snapshots:
                snap_name = f"{os.path.basename(fp)}.v0"
                shutil.copy2(fp, os.path.join(self.snapshot_dir, snap_name))

        print(f"\n{'─'*70}")
        print(f"En attente de modifications...")
        print(f"{'─'*70}\n")

    def check_once(self):
        """Verifie une fois si des fichiers ont change. Retourne True si changement."""
        any_changed = False

        for fp in self.filepaths:
            fp = os.path.abspath(fp)

            if not os.path.exists(fp):
                if self.states.get(fp) is not None:
                    # Fichier supprimé
                    ts = datetime.now().strftime("%H:%M:%S")
                    print(f"\n[{ts}] SUPPRIME: {os.path.basename(fp)}")
                    self.states[fp] = None
                    any_changed = True
                continue

            stat = os.stat(fp)

            # Fichier nouveau ou recree
            if self.states.get(fp) is None:
                data = open(fp, 'rb').read()
                h = hashlib.sha256(data).hexdigest()
                self.states[fp] = {
                    'hash': h,
                    'mtime': stat.st_mtime,
                    'size': stat.st_size,
                    'data': data,
                    'change_count': 0,
                }
                ts = datetime.now().strftime("%H:%M:%S")
                print(f"\n[{ts}] NOUVEAU: {os.path.basename(fp)} ({stat.st_size} octets)")
                any_changed = True
                continue

            old_state = self.states[fp]

            # Quick check: mtime or size changed?
            if stat.st_mtime == old_state['mtime'] and stat.st_size == old_state['size']:
                continue

            # Read and hash
            try:
                data = open(fp, 'rb').read()
            except (PermissionError, OSError):
                # File might still be written
                continue

            h = hashlib.sha256(data).hexdigest()
            if h == old_state['hash']:
                # mtime changed but content same
                old_state['mtime'] = stat.st_mtime
                continue

            # ── CHANGEMENT DETECTE ───────────────────────────────────────
            any_changed = True
            old_data = old_state['data']
            change_num = old_state['change_count'] + 1

            ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"\n{'='*70}")
            print(f"[{ts}] MODIFICATION #{change_num}: {os.path.basename(fp)}")
            print(f"{'='*70}")

            # 1. Resume rapide
            summary_old = quick_summary(old_data)
            summary_new = quick_summary(data)
            print(f"  Taille: {len(old_data)} -> {len(data)} ({len(data) - len(old_data):+d})")
            print(f"  Composants: {len(summary_old['components'])} -> {len(summary_new['components'])}")
            print(f"  Strings: {summary_old['num_strings']} -> {summary_new['num_strings']}")

            # Lister les composants
            if summary_new['components'] != summary_old['components']:
                print(f"\n  Composants AVANT: {[c[1] for c in summary_old['components']]}")
                print(f"  Composants APRES: {[c[1] for c in summary_new['components']]}")

            # 2. Diff binaire
            binary_diff_summary(old_data, data)

            # 3. Diff structurel (smart_diff)
            structural_diff_summary(old_data, data)

            # 4. Diff semantique (constantes/formules)
            if HAS_SEMANTIC:
                # Ecrire les deux versions dans des fichiers temporaires
                tmp_old = fp + '.watcher_old.tmp'
                tmp_new = fp + '.watcher_new.tmp'
                try:
                    with open(tmp_old, 'wb') as f:
                        f.write(old_data)
                    with open(tmp_new, 'wb') as f:
                        f.write(data)
                    semantic_diff_summary(tmp_old, tmp_new)
                finally:
                    for tmp in (tmp_old, tmp_new):
                        if os.path.exists(tmp):
                            os.remove(tmp)

            # 5. Snapshot
            if self.keep_snapshots:
                snap_name = f"{os.path.basename(fp)}.v{change_num}"
                shutil.copy2(fp, os.path.join(self.snapshot_dir, snap_name))
                print(f"\n  Snapshot sauvegarde: {snap_name}")

            # Log
            if self.log_file:
                with open(self.log_file, 'a', encoding='utf-8') as lf:
                    lf.write(f"\n[{ts}] {os.path.basename(fp)} #{change_num}: "
                             f"{len(old_data)} -> {len(data)} ({len(data) - len(old_data):+d})\n")

            print(f"\n{'─'*70}")
            print(f"En attente de modifications...")
            print(f"{'─'*70}")

            # Mettre a jour l'etat
            self.states[fp] = {
                'hash': h,
                'mtime': stat.st_mtime,
                'size': stat.st_size,
                'data': data,
                'change_count': change_num,
            }

        return any_changed

    def run(self):
        """Boucle principale de surveillance."""
        self.initialize()
        try:
            while True:
                self.check_once()
                time.sleep(self.interval)
        except KeyboardInterrupt:
            print(f"\n\nSurveillance arretee.")
            total = sum(s['change_count'] for s in self.states.values() if s)
            print(f"Total modifications detectees: {total}")
            if self.keep_snapshots:
                print(f"Snapshots dans: {self.snapshot_dir}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Surveille les fichiers .akp et trace les modifications en temps reel"
    )
    parser.add_argument('files', nargs='+',
                        help='Fichier(s) .akp a surveiller (supporte les globs)')
    parser.add_argument('--interval', '-i', type=float, default=1.0,
                        help='Intervalle de poll en secondes (defaut: 1.0)')
    parser.add_argument('--log', '-l', type=str, default=None,
                        help='Fichier de log (optionnel)')
    parser.add_argument('--snapshots', '-s', action='store_true', default=True,
                        help='Garder des snapshots numerotes de chaque version (actif par defaut)')
    parser.add_argument('--no-snapshots', action='store_true',
                        help='Desactiver les snapshots')

    args = parser.parse_args()

    # Expand globs
    filepaths = []
    for pattern in args.files:
        expanded = glob.glob(pattern)
        if expanded:
            filepaths.extend(expanded)
        else:
            filepaths.append(pattern)  # Keep for "waiting for creation" mode

    if not filepaths:
        print("Erreur: aucun fichier specifie")
        sys.exit(1)

    watcher = AkpWatcher(
        filepaths=filepaths,
        interval=args.interval,
        log_file=args.log,
        keep_snapshots=not args.no_snapshots,
    )
    watcher.run()


if __name__ == '__main__':
    main()
