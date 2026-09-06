#!/bin/bash
# End-to-end smoke test: mesh + solve a small tutorial case to prove the
# OpenFOAM install actually computes, not just that the binaries exist.

FOAM_BASHRC=""
for d in /usr/lib/openfoam/openfoam*; do
  [ -f "$d/etc/bashrc" ] && FOAM_BASHRC="$d/etc/bashrc"
done
# Sourcing must happen before `set -e`: OpenFOAM's config.sh emits a harmless
# "pop_var_context" warning under bash 5.2 that would abort a strict shell.
# shellcheck disable=SC1090
. "$FOAM_BASHRC" 2>/dev/null

set -e

WORK=/tmp/foam-smoke
rm -rf "$WORK"
mkdir -p "$WORK"
cp -r "$FOAM_TUTORIALS/incompressible/pimpleFoam/RAS/pitzDaily" "$WORK/case"
cd "$WORK/case"

echo "--- blockMesh ---"
blockMesh > log.blockMesh 2>&1
tail -3 log.blockMesh

echo "--- checkMesh ---"
checkMesh > log.checkMesh 2>&1
grep -E "cells:|Mesh OK|FAILED" log.checkMesh | head -5

# Keep the smoke test short: stop after a few time steps.
foamDictionary system/controlDict -entry endTime -set 0.02
foamDictionary system/controlDict -entry writeInterval -set 0.01

echo "--- pimpleFoam ---"
pimpleFoam > log.pimpleFoam 2>&1
grep -E "^Time = |ExecutionTime" log.pimpleFoam | tail -4

echo "--- written time directories ---"
ls -d [0-9]* 0.* 2>/dev/null | tr '\n' ' '
echo
echo "SMOKE_TEST=PASS"
