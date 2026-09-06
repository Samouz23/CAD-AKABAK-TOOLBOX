#!/bin/bash
# Install OpenFOAM (ESI) inside a WSL distribution, from the official
# dl.openfoam.com Debian repository.
#
# Emits KEY=VALUE lines so the Node side can follow progress and report a
# precise failure instead of a wall of apt output. The verbose apt log goes to
# a file; only the summary lines reach stdout.
#
# Usage: bash install_openfoam.sh [version]      (default: 2512)

set -o pipefail

VERSION="${1:-2512}"
# Un nom de paquet part directement dans apt-get : on le contraint à des
# chiffres pour qu'aucune valeur venue de l'interface ne puisse s'y glisser.
case "$VERSION" in
  ''|*[!0-9]*) echo "FOAM_ERROR=invalid version '$VERSION'"; exit 1 ;;
esac

PACKAGE="openfoam${VERSION}-default"
KEYRING="/usr/share/keyrings/openfoam-archive-keyring.gpg"
SOURCE_LIST="/etc/apt/sources.list.d/openfoam.list"
LOG="/tmp/openfoam-install.log"
: > "$LOG"

fail() {
  echo "FOAM_ERROR=$1"
  echo "--- last 30 log lines ---" >&2
  tail -30 "$LOG" >&2
  exit 1
}

if [ "$(id -u)" -ne 0 ]; then
  fail "must run as root inside the distribution"
fi

echo "FOAM_STAGE=prepare"
export DEBIAN_FRONTEND=noninteractive
apt-get update >>"$LOG" 2>&1 || fail "apt-get update failed"
apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release \
  >>"$LOG" 2>&1 || fail "could not install the repository prerequisites"

# Le code de version d'Ubuntu détermine la branche du dépôt ; sans lui, le
# dépôt sert une distribution 'stable' qui peut ne pas correspondre à l'ABI.
CODENAME="$(sed -ne 's/^UBUNTU_CODENAME=//p' /etc/os-release)"
[ -n "$CODENAME" ] || CODENAME="$(sed -ne 's/^VERSION_CODENAME=//p' /etc/os-release)"
[ -n "$CODENAME" ] || CODENAME="stable"
ARCH="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
echo "FOAM_DISTRO=$CODENAME/$ARCH"

echo "FOAM_STAGE=repository"
# `signed-by` restreint la clé à CE dépôt. La déposer dans trusted.gpg.d, comme
# le fait le script officiel, la ferait accepter pour TOUS les dépôts apt.
curl -fsSL https://dl.openfoam.com/pubkey.gpg | gpg --dearmor --yes -o "$KEYRING" \
  || fail "could not fetch the OpenFOAM signing key (no network?)"
chmod 0644 "$KEYRING"
printf 'deb [arch=%s signed-by=%s] https://dl.openfoam.com/repos/deb %s main\n' \
  "$ARCH" "$KEYRING" "$CODENAME" > "$SOURCE_LIST"

echo "FOAM_STAGE=index"
apt-get update >>"$LOG" 2>&1 || fail "apt-get update failed after adding the repository"

if ! apt-cache show "$PACKAGE" >/dev/null 2>&1; then
  fail "package $PACKAGE not available for $CODENAME — try another OpenFOAM version"
fi

echo "FOAM_STAGE=download"
# Environ 1 Go : on tient l'interface informée plutôt que de la laisser muette.
apt-get install -y "$PACKAGE" >>"$LOG" 2>&1 &
APT_PID=$!
while kill -0 "$APT_PID" 2>/dev/null; do
  sleep 3
  LINE="$(grep -Eo '^(Get|Unpacking|Setting up|Preparing)[^\n]*' "$LOG" | tail -1)"
  [ -n "$LINE" ] && echo "FOAM_PROGRESS=$LINE"
done
wait "$APT_PID" || fail "installing $PACKAGE failed"

echo "FOAM_STAGE=verify"
BASHRC=""
for d in /usr/lib/openfoam/openfoam*; do
  [ -f "$d/etc/bashrc" ] && BASHRC="$d/etc/bashrc"
done
[ -n "$BASHRC" ] || fail "installed, but no etc/bashrc found under /usr/lib/openfoam"

# shellcheck disable=SC1090
. "$BASHRC"
MISSING=""
for t in blockMesh snappyHexMesh surfaceFeatureExtract pimpleFoam checkMesh \
         postProcess decomposePar reconstructPar; do
  command -v "$t" >/dev/null 2>&1 || MISSING="$MISSING $t"
done
[ -z "$MISSING" ] || fail "missing after install:$MISSING"

echo "FOAM_BASHRC=$BASHRC"
echo "FOAM_VERSION=$WM_PROJECT_VERSION"
echo "FOAM_RESULT=ok"
