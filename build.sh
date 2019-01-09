# This script file builds the entire monorepo.
#
# This is necessary because we're using IIFEs and symlinks
# to make the dApps work. This should go away as soon as
# Rollup modules get fixed.

set -e

packages=" \
  types \
  apps \
  contracts \
  cf.js \
  machine \
  node \
  node-provider \
  playground-server \
  playground \
  dapp-high-roller \
  dapp-tic-tac-toe \
"

for package in $packages; do
  echo "⚙️  Building package: ${package}"
  cd packages/${package}
  yarn build
  cd -
done
