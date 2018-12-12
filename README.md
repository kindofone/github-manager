# github-manager

[![build status](https://img.shields.io/travis/kindofone/github-manager.svg)](https://travis-ci.com/kindofone/github-manager)
[![code coverage](https://img.shields.io/codecov/c/github/kindofone/github-manager.svg)](https://codecov.io/gh/kindofone/github-manager)
[![code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![made with lass](https://img.shields.io/badge/made_with-lass-95CC28.svg)](https://lass.js.org)
[![license](https://img.shields.io/github/license/kindofone/github-manager.svg)](LICENSE)
[![npm downloads](https://img.shields.io/npm/dt/github-manager.svg)](https://npm.im/github-manager)

> Manage, update and clone personal and organizational Github repositories.


## Table of Contents

* [Install](#install)
* [Overview](#overview)
* [Usage](#usage)
* [Configs](#configs)
  * [Global config](#global-config)
  * [Local config](#local-config)
  * [Changing configurations](#changing-configurations)
* [Contributors](#contributors)
* [License](#license)


## Install

[npm][]:

```sh
npm install -g github-manager
```

[yarn][]:

```sh
yarn global add github-manager
```


## Overview

Gitman is a tool for working with multiple local git and remote Github repositories. Many developers manage multiple repositories in one folder and sometimes split personal repositories and organizational repositories to separate folders.

When Gitman is run in a folder, it looks for a `.gitman-config.json` file. If the file does not exist, it asks the user to define the scope of the current folder: managing personal or organizational repositories.

Once Gitman knows the scope, it shows the list of locally cloned repositories inside the folder, and also shows a list of remotely available repositories (personal and organizational).

Updating local repositories and cloning remote repositories is  as easy as running `gitman` in the folder to see the UI, or `gitman update` to directly update existing local repositories.


## Usage

Run `gitman` to start managing your local and remote repositories (make sure you're in a folder that contains the repositories).
When run for the first time, Gitman will ask some configuration questions.

```sh
gitman
```

To update a list of preselected local repositories, run the following. If it's the first `update` ever in a folder, Gitman will ask you to select a list of repositories:

```sh
gitman update
```

To forcefully update **all** local repositories in the folder:

```sh
gitman update --all
```

To confirm the list of repositories prior to the update process, add `--confirm`:

```sh
gitman update --confirm
```

Or:

```sh
gitman update --all --confirm
```


## Configs

Gitman uses two separate config files in parallel:

* A global config file that is located in an operating system user folder.
* A local config file that is located in the folder that Gitman was ran in.

When Gitman is run for the first time ever on a computer, it asks questions to configure both the global and local config files.
When Gitman is run for the first time in a certain folder, it asks questions to configure the local config file for that folder.

Here are some details what is being saved in the config files.

### Global config

* **Github Token** - A user generated Github Personal Access Token.

### Local config

* **Folder Type** - Whether the current folder contains personal or organizational repositories.
* **Starred Repositories** - A list of select repositories that can be updated in batch by running `gitman update` in that folder.

### Changing configurations

Set a Github Personal Access Token (you can create one at <https://github.com/settings/tokens>):

```sh
gitman --set-token <token>
```

Clear a preset access token:

```sh
gitman --clear-token
```

Select repositories to update with `gitman update`:

```sh
gitman update --select
```

Reset Gitman current folder configurations (personal or org, update selections, etc.)

```sh
gitman reset
```

Reset all of Gitman configurations (global and current folder):

```sh
gitman reset -global
```


## Contributors

| Name             | Website                       |
| ---------------- | ----------------------------- |
| **Yogev Ahuvia** | <http://www.yogevahuvia.com/> |


## License

[MIT](LICENSE) © [Yogev Ahuvia](http://www.yogevahuvia.com/)


## 

[npm]: https://www.npmjs.com/

[yarn]: https://yarnpkg.com/
