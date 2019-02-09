# This script file builds the entire monorepo.
#
# This is necessary because we're using IIFEs and symlinks
# to make the dApps work. This should go away as soon as
# Rollup modules get fixed.

set -e

if [ "$PLAYGROUND_SCOPE" = "server" ]
then
  packages=" \
    types \
    apps \
    contracts \
    node-provider \
    cf.js \
    machine \
    node \
    playground-server \
  "
else
  packages=" \
    types \
    apps \
    contracts \
    node-provider \
    cf.js \
    machine \
    node \
    playground-server \
    playground \
    dapp-high-roller \
    dapp-tic-tac-toe \
  "
fi

echo "Will build packages: $packages"

for package in $packages; do
  echo "⚙️  Building package: ${package}"
  cd packages/${package}
  yarn build
  if [ "$?" != "0" ]
  then
    exit $?;
  fi
  cd -
done
