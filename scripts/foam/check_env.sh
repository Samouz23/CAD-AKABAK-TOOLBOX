#!/bin/bash
# Probe the OpenFOAM environment inside WSL and report what the Toolbox CFD
# backend can rely on. Prints KEY=VALUE lines so the Node side can parse it.

FOAM_BASHRC=""
for d in /usr/lib/openfoam/openfoam*; do
  [ -f "$d/etc/bashrc" ] && FOAM_BASHRC="$d/etc/bashrc"
done

if [ -z "$FOAM_BASHRC" ]; then
  echo "FOAM_FOUND=0"
  exit 1
fi

# shellcheck disable=SC1090
. "$FOAM_BASHRC"

echo "FOAM_FOUND=1"
echo "FOAM_BASHRC=$FOAM_BASHRC"
echo "FOAM_VERSION=$WM_PROJECT_VERSION"
echo "FOAM_NPROC=$(nproc)"

for t in blockMesh snappyHexMesh surfaceFeatureExtract pimpleFoam simpleFoam \
         checkMesh postProcess foamToVTK decomposePar reconstructPar \
         transformPoints topoSet createPatch; do
  if command -v "$t" >/dev/null 2>&1; then
    echo "TOOL_$t=OK"
  else
    echo "TOOL_$t=MISSING"
  fi
done
