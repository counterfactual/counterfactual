#!/bin/bash

MONOREPO_PATH="$(pwd)"

echo "(1/7) Running preflight checks and cleanups..."

if [ -z "$PYTHON" ];
then
  echo "  > Error: Please set the PYTHON environment variable."
  exit
else
  echo "  > Found Python at: $PYTHON"
fi

if [ -z "$NVM_DIR" ];
then
  echo "  > Error: Please install nvm."
  exit
else
  echo "  > Found NVM"
  . $NVM_DIR/nvm.sh
  nvm use
fi

if [ -d "packages/greenboard/extension" ];
then
  unlink packages/greenboard/extension
  echo "  > Unlinked extension symlink"
fi

if [ -d "/tmp/metamask-extension" ];
then
  rm -rf /tmp/metamask-extension
  echo "  > Cleaned up /tmp/metamask-extension"
fi

echo "(2/7) Cloning metamask into /tmp/metamask-extension..."

git clone --depth 1 --single-branch --branch alon/cf-rfc-middleware git@github.com:prototypal/metamask-extension /tmp/metamask-extension

echo "(3/7) Ensuring installed dependencies..."

yarn --frozen-lockfile

echo "(4/7) Building Counterfactual..."

yarn build

echo "(5/7) Injecting Counterfactual IIFEs into Metamask vendors..."

cp packages/cf.js/dist/index-iife.js /tmp/metamask-extension/app/vendor/counterfactual/node/cf.js.iife.js
cp packages/firebase-client/dist/index.iife.js /tmp/metamask-extension/app/vendor/counterfactual/node/firebase-client.iife.js
cp packages/node/dist/index.iife.js /tmp/metamask-extension/app/vendor/counterfactual/node/node.iife.js

echo "(6/7) Installing Metamask dependencies and building extension..."

cd /tmp/metamask-extension
nvm use
yarn --frozen-lockfile
yarn dist

cd "$MONOREPO_PATH"

echo "(7/7) Symlinking Metamask build into Greenboard workspace..."

ln -s /tmp/metamask-extension/dist/chrome $MONOREPO_PATH/packages/greenboard/extension

echo "Ready!"
