# @atomist/ci-automation

[![npm version](https://badge.fury.io/js/%40atomist%2Fci-automation.svg)](https://badge.fury.io/js/%40atomist%2Fci-automation)
[![Build Status](https://travis-ci.org/atomist/ci-automation.svg?branch=master)](https://travis-ci.org/atomist/ci-automation)
[![Docker Pulls](https://img.shields.io/docker/pulls/atomist/ci-automation.svg)](https://hub.docker.com/r/atomist/ci-automation/)

This repository contains Atomist automation for continuous integration
platforms like [Travis CI][travis-ci] and [CircleCI][circleci].  These
automation use the [`@atomist/automation-client`][client] node module
to implement a client that connects to the Atomist API.

[travis-ci]: https://travis-ci.org/
[circleci]: https://circleci.com/
[client]: https://github.com/atomist/automation-client-ts (@atomist/automation-client Node Module)

## Prerequisites

Below are brief instructions on how to get started running this
project yourself.  If you just want to use the functionality this
project provides, see the [Atomist documentation][docs].  For more
detailed information on developing automations, see
the [Atomist Developer Guide][dev].

[docs]: https://docs.atomist.com/ (Atomist User Guide)
[dev]: https://docs.atomist.com/developer/ (Atomist Developer Guide)

### GitHub account

You must have a GitHub account, either GitHub.com or GitHub Enterprise
(GHE).  If you want to use Atomist with GHE, please [contact
Atomist](mailto:support@atomist.com).  The remainder of these
instructions assume you have a GitHub.com account.  If you do not
already have a GitHub.com account, you can [create
one][github-create].

[github-create]: https://github.com/join (Join GitHub)

### Atomist workspace

You also need to sign up with Atomist and create a workspace.  Once
you have a GitHub.com account, you can sign up with Atomist at
[https://app.atomist.com/][atm-app].  Once you are registered with
Atomist, you can create an Atomist workspace and add your GitHub user
and/or organizations to that workspace.

[atm-app]: https://app.atomist.com/ (Atomist Web Interface)

### Kubernetes

This automation works with [Kubernetes][kube], so you need a
Kubernetes cluster with a functioning ingress controller, such as
[ingress-nginx][].

If you do not have access to a Kubernetes cluster, you can create one
on your local system using [minikube][].  Once you have minikube
running, you can create an ingress controller in the cluster using the
ingress add-on.

```console
$ minikube start
$ minikube addons enable ingress
```

[kube]: https://kubernetes.io/ (Kubernetes)
[ingress-nginx]: https://github.com/kubernetes/ingress-nginx (Ingress nginx)
[minikube]: https://kubernetes.io/docs/getting-started-guides/minikube/ (Minikube)

### Slack

Atomist has a powerful [Slack][slackhq] application, allowing you to
see and act on your development activity right in Slack.  Slack is
_not_ a requirement for using Atomist, but if you try it, you'll
probably like it.  If you do not have access to a Slack team, it is
easy to [create your own][slack-team].

In your Slack team, install the Atomist app in Slack, click the button
below.

<p align="center">
 <a href="https://atm.st/2wiDlUe">
  <img alt="Add to Slack" height="50" width="174" src="https://platform.slack-edge.com/img/add_to_slack@2x.png" />
 </a>
</p>

Once installed, the Atomist bot will guide you through connecting
Atomist, Slack, and GitHub.

[slackhq]: https://slack.com/ (Slack)
[slack-team]: https://slack.com/get-started#create (Create a Slack Team)

## Running

The automations provided by this package are run globally by Atomist
so you only have to run this yourself if you wish to customize its
behavior.

You can use the Kubernetes resource files in the [kube
directory][kube] as a starting point for deploying this automation in
your Kubernetes cluster.  Before deploying this automation, you will
need to create a secret with the automation configuration.  The only
required configuration values are the `teamIds` and `token`.  The
`teamIds` should be your Atomist team ID(s), which you can get from
the settings page for your Atomist workspace or by sending `team` as a
message to the Atomist bot, e.g., `@atomist team`, in Slack.  The
`token` should be a [GitHub personal access token][ghpat] with
`read:org` and `repo` scopes.

```console
$ kubectl create secret generic automation \
    --from-literal=config='{"teamIds":["TEAM_ID"],"token":"TOKEN"}'
```

In the above commands, replace `TEAM_ID` with your Atomist team ID,
and `TOKEN` with your GitHub token.

To deploy the automation, run the following command:

```console
$ kubectl apply -f https://raw.githubusercontent.com/atomist/ci-automation/master/assets/kube/deployment.yaml
```

[kube]: ./assets/kube/ (ci-automation Kubernetes Resources)
[ghpat]: https://github.com/settings/tokens (GitHub Personal Access Tokens)

## Support

General support questions should be discussed in the `#support`
channel in our community Slack team
at [atomist-community.slack.com][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/ci-automation/issues

## Development

Before developing this project, you will need to install Node.js and
configure your environment.

### Node.js

You will need to have [Node.js][node] installed.  To verify that the
right versions are installed, please run:

```console
$ node -v
v9.7.1
$ npm -v
5.6.0
```

The `node` version should be 8 or greater and the `npm` version should
be 5 or greater.

[node]: https://nodejs.org/ (Node.js)

### Cloning the repository and installing dependencies

To get started run the following commands to clone the project,
install its dependencies, and build the project:

```console
$ git clone git@github.com:atomist/ci-automation.git
$ cd ci-automation
$ npm install
$ npm run build
```

### Configuring your environment

If this is the first time you will be running an Atomist API client
locally, you should first configure your system using the `atomist`
script:

```console
$ `npm bin`/atomist config
```

The script does two things: records what Slack team you want your
automations running in and creates
a [GitHub personal access token][token] with "repo" and "read:org"
scopes.

The script will prompt you for your Atomist workspace/team ID, or you
can supply it using the `--team TEAM_ID` command-line option.  You can
get your Atomist team ID from the settings page for your Atomist
workspace or by typing `team` in a DM to the Atomist bot.

The script will prompt you for your GitHub credentials.  It needs them
to create the GitHub personal access token.  Atomist does not store
your credentials and only writes the generated token to your local
machine.

The Atomist API client authenticates using a GitHub personal access
token.  The Atomist API uses the token to confirm you are who you say
you are and are in a GitHub organization connected to the Slack team
in which you are running the automations.  In addition, it uses the
token when performing any operations that access the GitHub API.

[token]: https://github.com/settings/tokens (GitHub Personal Access Tokens)

### Running locally

You can run this automation client locally, allowing you to change the
source code of this project and immediately see the effects in your
environment with the following command

```console
$ npm run autostart
```

To run in a more traditional manner, build the project and then simple
start it.

```console
$ npm run build
$ npm start
```

To download and run the Docker image of this project, run the
following command

```console
$ docker run --rm -e GITHUB_TOKEN=YOUR_TOKEN -e ATOMIST_TEAMS=TEAM_ID \
    atomist/ci-automation:VERSION
```

replacing `YOUR_TOKEN` and `TEAM_ID` with the token and team ID from
your `~/.atomist/client.config.json` created by the `atomist config`
command and `VERSION` with the [latest release of this repo][latest].
Note that this will not be running any code from your local machine
but the code in the Docker image.

[latest]: https://github.com/atomist/ci-automation/releases/latest

### Build and Test

Command | Reason
------- | ------
`npm install` | install all the required packages
`npm run build` | lint, compile, and test
`npm start` | start the Atomist automation client
`npm run autostart` | run the client, refreshing when files change
`npm run lint` | run tslint against the TypeScript
`npm run compile` | compile all TypeScript into JavaScript
`npm test` | run tests and ensure everything is working
`npm run autotest` | run tests continuously
`npm run clean` | remove stray compiled JavaScript files and build directory

### Release

To create a new release of the project, update the version in
package.json and then push a tag for the version.  The version must be
of the form `M.N.P` where `M`, `N`, and `P` are integers that form the
next appropriate [semantic version][semver] for release.  The version
in the package.json must be the same as the tag.  For example:

[semver]: http://semver.org

```console
$ npm version 1.2.3
$ git tag -a -m 'The ABC release' 1.2.3
$ git push origin 1.2.3
```

The Travis CI build (see badge at the top of this page) will publish
the NPM module and automatically create a GitHub release using the tag
name for the release and the comment provided on the annotated tag as
the contents of the release notes.

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack team][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
