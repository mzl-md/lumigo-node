#!/usr/bin/env bash
set -e

setup_git() {
    git config --global user.email "no-reply@build.com"
    git config --global user.name "CircleCI"
    git checkout master
}

push_tags() {
    git push origin master --tags
}

echo "Deleting old node_modules"
rm -rf node_modules
rm -rf package-lock.json
echo "Installing dependencies"
npm i
echo "Build tracer"
npm run build
setup_git
echo "Setting production ad NODE_ENV"
export NODE_ENV=production
echo "Getting latest changes from git"
changes=$(git log $(git describe --tags --abbrev=0)..HEAD --oneline)
echo ${changes}
echo "Bump patch version"
npm version patch -m "Bump version to %s -- ${changes}"
echo "Create release tag"
push_tags
echo "Push to NPM"
echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
npm publish
rm .npmrc