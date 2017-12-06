#!/bin/bash
# test command via HTTP POST
# the client must be running

declare Pkg=curl-test
declare Version=0.1.0

function msg () {
    echo "$Pkg: $*"
}

function err () {
    msg "$*" 1>&2
}

function main () {
    if [[ ! $GITHUB_TOKEN ]]; then
        err "the GITHUB_TOKEN environment variable is not set"
        return 10
    fi

    local iteration=$1
    if [[ $iteration ]]; then
        shift
    else
        iteration=0
    fi
    local repo=$1
    if [[ $repo ]]; then
        shift
    else
        repo=curl-test-$iteration
    fi
    local owner=$1
    if [[ $owner ]]; then
        shift
    else
        owner=atomisthqa
    fi

    local post_data
    printf -v post_data '{
  "name": "EnableTravis",
  "corrid": "local-test-from-hoff-%s",
  "parameters": [],
  "mapped_parameters": [{
    "name": "repo",
    "value": "%s"
  }, {
    "name": "owner",
    "value": "%s"
  }, {
    "name": "githubApiUrl",
    "value": "https://api.github.com/"
  }],
  "secrets": [{
    "name": "github://user_token?scopes=repo,read:org,user:email",
    "value": "%s"
  }]
}' "$iteration" "$repo" "$owner" "$GITHUB_TOKEN"
    if ! curl -v -X POST -H "Authorization: bearer $GITHUB_TOKEN" -H 'Content-Type: application/json' \
         -d "$post_data" http://localhost:2866/command/enable-travis
    then
        err "curl failed"
        return 1
    fi
}

main "$@" || exit 1
exit 0
