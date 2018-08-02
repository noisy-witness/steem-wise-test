#!/usr/bin/env bash
set -e # fail on first error
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

## Load config
source "${DIR}/../config.sh"
if [ -z "$WISETEST_CONFIG_LOADED" ]; then echo "Config not loaded. Exiting" && exit 1; fi


if [ ! -d "${REPOSITORIES_DIR}" ]; then
    echo "${REPOSITORIES_DIR} does not exist. Exiting"
    exit 1
fi

if [ ! -d "${REPOSITORIES_DIR}/${REPO_DIRNAME_CORE}" ]; then
    echo "${REPOSITORIES_DIR}/${REPO_DIRNAME_CORE} does not exist. Exiting"
    exit 1
fi

if [ ! -d "${REPOSITORIES_DIR}/${REPO_DIRNAME_CLI}" ]; then
    echo "${REPOSITORIES_DIR}/${REPO_DIRNAME_CLI} does not exist. Exiting"
    exit 1
fi

if [ ! -d "${REPOSITORIES_DIR}/${REPO_DIRNAME_VOTER_PAGE}" ]; then
    echo "${REPOSITORIES_DIR}/${REPO_DIRNAME_VOTER_PAGE} does not exist. Exiting"
    exit 1
fi

## Compile & run tests
gradle clean test