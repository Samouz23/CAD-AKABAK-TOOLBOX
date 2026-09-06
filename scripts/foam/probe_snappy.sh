#!/bin/bash
# Affiche les dictionnaires de reference du cas motorBike (exemple canonique
# de snappyHexMesh) pour caler la syntaxe exacte de la version installee.

FOAM_BASHRC=""
for d in /usr/lib/openfoam/openfoam*; do
  [ -f "$d/etc/bashrc" ] && FOAM_BASHRC="$d/etc/bashrc"
done
# shellcheck disable=SC1090
. "$FOAM_BASHRC" 2>/dev/null

MB="$FOAM_TUTORIALS/incompressible/pisoFoam/LES/motorBike/motorBike"

echo "=== surfaceFeatureExtractDict ==="
sed -n '15,60p' "$MB/system/surfaceFeatureExtractDict"

echo
echo "=== snappyHexMeshDict : entete geometry + castellated ==="
sed -n '17,110p' "$MB/system/snappyHexMeshDict"

echo
echo "=== meshQualityControls du meme dict ==="
grep -n -A 8 "meshQualityControls" "$MB/system/snappyHexMeshDict" | head -20
