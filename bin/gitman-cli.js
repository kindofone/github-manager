#!/usr/bin/env node

(function() {
  // External modules
  const program = require('caporal');
  const fs = require('fs');
  const chalk = require('chalk');
  const gradient = require('gradient-string');
  const opn = require('opn');
  const Conf = require('conf');
  const octokit = require('@octokit/rest')();
  const simpleGit = require('simple-git/promise');
  const fuzzysearch = require('fuzzysearch');
  const emoji = require('node-emoji');
  const ora = require('ora');
  const inquirer = require('inquirer');

  // Config
  inquirer.registerPrompt(
    'checkbox-plus',
    require('inquirer-checkbox-plus-prompt')
  );
  const globalConfig = new Conf();
  const localConfig = new Conf({
    cwd: process.cwd(),
    configName: '.gitman-config'
  });
  const repositories = {
    local: {},
    remote: {}
  };

  // Classes
  class Repo {
    constructor(name, props) {
      Object.assign(
        this,
        {
          remote: false,
          uncommitedChanges: false
        },
        props
      );

      this.value = name;
      this.name = this.toString();
    }

    toString() {
      let output = this.remote ? this.value : chalk.green(this.value);

      if (this.branch) {
        const branchColor = this.branch === 'master' ? 'cyan' : 'red';
        output += ` (${chalk[branchColor](this.branch)})`;
      }

      if (this.uncommitedChanges) {
        output += ` ${emoji.get('warning')}  ${chalk.red(
          'Uncommited changes'
        )}`;
      }

      return output;
    }
  }

  // Functions
  function resetLocalConfig({ global: globalReset }) {
    if (globalReset) {
      globalConfig.clear();
      console.log(`${chalk.green('✔')} ${gradient.rainbow(
        'Gitman'
      )} global config was cleared.
Run \`gitman\` and it will help you set things up again.\n`);
    }

    localConfig.clear();
    if (!globalReset) {
      console.log(`${chalk.green('✔')} ${gradient.rainbow(
        'Gitman'
      )} local config was cleared.
Run \`gitman\` to config it again in a folder.\n`);
    }
  }

  function authenticate() {
    octokit.authenticate({
      type: 'token',
      token: globalConfig.get('github.token')
    });
  }

  async function getOrgs() {
    if (
      !localConfig.has('github.token') ||
      localConfig.get('github.token') === 'false'
    ) {
      return [];
    }

    const result = await octokit.orgs.listMemberships();
    return result.data;
  }

  function getRepositoriesInPath(path) {
    return fs
      .readdirSync(path)
      .filter(file => fs.statSync(`${path}/${file}`).isDirectory())
      .filter(folder => fs.readdirSync(`${path}/${folder}`).includes('.git'));
  }

  async function getLocalRepos() {
    const currentWorkingDirectory = process.cwd();

    let repos = getRepositoriesInPath(currentWorkingDirectory);
    repos = await Promise.all(
      repos.map(async repoName => {
        const diff = await simpleGit(
          `${currentWorkingDirectory}/${repoName}`
        ).diffSummary();
        const status = await simpleGit(
          `${currentWorkingDirectory}/${repoName}`
        ).status();
        const repo = new Repo(repoName, {
          branch: status.current,
          uncommitedChanges: Boolean(diff.files.length)
        });
        repositories.local[repo.value] = repo;

        return repo;
      })
    );

    return repos;
  }

  async function getRemoteRepos() {
    if (
      !globalConfig.has('github.token') ||
      globalConfig.get('github.token') === 'false'
    ) {
      return [];
    }

    let fetch;
    if (localConfig.has('github.org')) {
      fetch = () =>
        octokit.repos.listForOrg({
          org: localConfig.get('github.org')
        });
    } else {
      fetch = () =>
        octokit.repos.list({
          affiliation: 'owner'
        });
    }

    const { data: remoteRepos } = await fetch().catch(err => {
      console.error(
        chalk.red(`\n\n${err.HttpError ||
          'Error connecting to Github with your access token.'}
Create a new one at: https://github.com/settings/tokens
Then, run \`gitman --set-token <token>\` to save it.
To clear the current token, run \`gitman --clear-token\`\n`)
      );
      return {
        data: []
      };
    });

    const repos = remoteRepos.map(remoteRepo => {
      const repo = new Repo(remoteRepo.name, {
        remote: true,
        cloneUrl: remoteRepo.ssh_url
      });
      repositories.remote[repo.value] = repo;

      return repo;
    });

    return repos;
  }

  async function getRepositories() {
    const spinner = ora('Loading repositories...').start();
    const repos = await Promise.all([getLocalRepos(), getRemoteRepos()]);
    spinner.stop();
    return Promise.resolve(repos);
  }

  function getRepoObjectsFromSelections(selections) {
    return selections.map(repoName =>
      repositories.local[repoName]
        ? repositories.local[repoName]
        : repositories.remote[repoName]
    );
  }

  function prepareActions(repos) {
    const pulls = [];
    const clones = [];

    for (const repoName of Object.keys(repos)) {
      const repo = repos[repoName];
      switch (repo.remote) {
        case true:
          clones.push(repo);
          break;

        case false:
        default:
          pulls.push(repo);
          break;
      }
    }

    return {
      pulls,
      clones
    };
  }

  async function runActions(actions) {
    const reposFolderPath = process.cwd();
    console.log('\nYour wish is my command:\n');

    for (const repo of actions.pulls) {
      /* eslint-disable no-await-in-loop */
      const spinner = ora(`Updating ${chalk.green(repo.value)}`).start();
      await simpleGit(`${reposFolderPath}/${repo.value}`).pull();
      spinner.succeed();
    }

    for (const repo of actions.clones) {
      /* eslint-disable no-await-in-loop */
      const spinner = ora(`Cloning ${chalk.green(repo.value)}`).start();
      await simpleGit(`${reposFolderPath}`).clone(repo.cloneUrl, repo.value);
      spinner.succeed();
    }

    done();
  }

  function done() {
    console.log(`\n${gradient.rainbow('Gitman')}, done!\n`);
    process.exit();
  }

  function terminate() {
    console.log(`\n${gradient.rainbow('Gitman')}, out.\n`);
    process.exit();
  }

  async function updateSelectedRepositories({ all }) {
    const repos = await getLocalRepos();

    if (all) {
      const actions = prepareActions(repos);
      confirmActions(actions);
    } else if (localConfig.has('selectedRepos')) {
      const selectedRepoNames = localConfig.get('selectedRepos').split(',');
      const selectedRepos = getRepoObjectsFromSelections(selectedRepoNames);
      const actions = prepareActions(selectedRepos);
      confirmActions(actions);
    } else {
      console.log(`Run \`gitman update --select\` to select repositories to update.
Then run \`gitman update\` again.
Or, run \`gitman update --all\` to update all local repositories.`);
    }
  }

  function configure({ token } = {}) {
    globalConfig.set(
      'github.token',
      typeof token === 'string' ? token.trim() : 'false'
    );

    if (typeof token !== 'undefined' && token !== 'false') {
      console.log(`${chalk.green('✔')} Github token set`);
      authenticate();
    }
  }

  // UI
  async function localSetup() {
    const orgs = await getOrgs();

    if (orgs.length > 0) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'repositoriesType',
          message:
            'What type of repositories do you want to manage in this folder?',
          choices: ['Personal', 'Organizational']
        },
        {
          when: answers => answers.repositoriesType === 'Organizational',
          type: 'list',
          name: 'org',
          message: 'Select an organization to sync with this folder:',
          choices: orgs.map(org => org.organization.login)
        }
      ]);

      if (answers.repositoriesType === 'Organizational') {
        localConfig.set('type', 'org');
        localConfig.set('github.org', answers.org);
      } else {
        localConfig.set('type', 'personal');
      }
    } else {
      localConfig.set('type', 'personal');
    }

    listRepositories();
  }

  async function setup() {
    console.log(`Let's quickly set things up for you:\n`);

    let answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupInCurrentFolder',
        message: `We're at: ${chalk.cyan(
          process.cwd()
        )}\n  I'll run a quick scan for git repositories here. OK?`
      }
    ]);

    if (!answers.setupInCurrentFolder) {
      console.log(
        '\nNo worries! Summon me again from another folder that you might prefer.'
      );
      terminate();
      return;
    }

    const tokenCreationInstructions =
      'Press Enter to open your browser on https://github.com/settings/tokens';

    answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'manageRemoteRepos',
        message: `Would you also let me clone remote repositories for you?`
      },
      {
        when: answers => answers.manageRemoteRepos,
        type: 'input',
        name: 'githubToken',
        message: 'Great! Insert a Github access token:',
        default: tokenCreationInstructions,
        validate: value => {
          if (value === tokenCreationInstructions) {
            opn('https://github.com/settings/tokens');
            return false;
          }
          if (typeof value === 'string' && value.length > 0) {
            return true;
          }
          return false;
        }
      }
    ]);

    configure({
      token: answers.githubToken
    });

    if (globalConfig.get('github.token') === 'false') {
      listRepositories();
    } else {
      localSetup();
    }
  }

  async function listRepositories() {
    function separator(text, color) {
      const separatorText = `=== ${text} ===`;
      return new inquirer.Separator(
        `\n ${
          typeof color === 'undefined'
            ? separatorText
            : chalk[color](separatorText)
        } `
      );
    }

    const localAndRemoteRepos = await getRepositories();
    const localRepoNames = localAndRemoteRepos[0] || [];
    let remoteRepoNames = localAndRemoteRepos[1] || [];

    // Filter out remote repositories that have already been cloned locally
    remoteRepoNames = remoteRepoNames.filter(
      remoteRepoName =>
        localRepoNames.findIndex(
          localRepoName => localRepoName.value === remoteRepoName.value
        ) === -1
    );

    const answers = await inquirer.prompt([
      {
        type: 'checkbox-plus',
        name: 'selections',
        message: 'Choose repositories to continue:',
        pageSize: 50,
        searchable: true,
        source: (answers, search) => {
          let choices = [
            localRepoNames.length > 0 ? separator('Local', 'cyan') : [],
            ...localRepoNames
          ];

          if (remoteRepoNames.length > 0) {
            choices = [...choices, separator('Remote'), ...remoteRepoNames];
          }

          return Promise.resolve(
            choices.filter(choice => {
              if (!(choice instanceof inquirer.Separator)) {
                return fuzzysearch(search, choice.value);
              }
              return true;
            })
          );
        }
      }
    ]);

    const repos = getRepoObjectsFromSelections(answers.selections);
    const actions = prepareActions(repos);
    confirmActions(actions);
  }

  async function confirmActions(actions) {
    let actionsString = '';

    if (actions.pulls.length > 0) {
      actionsString += chalk.cyan(
        `${emoji.get('arrows_counterclockwise')} Updating:\n`
      );
      actions.pulls.forEach(repo => {
        actionsString += `${chalk.cyan('➜')}  ${chalk.green(repo.value)}\n`;
      });
    }

    if (actions.clones.length > 0) {
      actionsString += chalk.cyan(`\n${emoji.get('new')} Cloning:\n`);
      actions.clones.forEach(repo => {
        actionsString += `${chalk.cyan('➜')}  ${chalk.green(repo.value)}\n`;
      });
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'actionsConfirmed',
        message: `Review and confirm your selections:\n\n${actionsString}\nContinue?`
      }
    ]);

    if (answers.actionsConfirmed) {
      runActions(actions);
    } else {
      terminate();
    }
  }

  async function selectRepositoriesToUpdate() {
    const repos = await getLocalRepos();
    const answers = await inquirer.prompt([
      {
        type: 'checkbox-plus',
        name: 'selections',
        message: 'Select repositories to update:',
        pageSize: 50,
        searchable: true,
        source: (answers, search) => {
          const choices = [...repos];

          return Promise.resolve(
            choices.filter(choice => {
              return fuzzysearch(search, choice.value);
            })
          );
        }
      }
    ]);

    localConfig.set('selectedRepos', answers.selections.join(','));
    console.log(`${chalk.green('✔')} Selected repositories saved.
From now on, run \`gitman update\` to update your selected repositories.
Or, run \`gitman update --all\` to update all local repositories.`);
  }

  function main() {
    console.log(`Welcome to ${gradient.rainbow('Gitman')}!\n`);

    // Check if it's the first run ever
    if (globalConfig.store && Object.keys(globalConfig.store).length === 0) {
      setup();
      return;
    }

    if (globalConfig.get('github.token') !== 'false') {
      authenticate();
    }

    if (localConfig.has('type')) {
      listRepositories();
    } else {
      localSetup();
    }
  }

  // Program
  program
    .version('1.0.1')
    .option('--set-token <token>', 'Store a Github Personal Access Token')
    .option(
      '--clear-token',
      'Remove the previously set Github Personal Access Token'
    )
    .action((args, options) => {
      if (options.setToken || options.clearToken) {
        configure({ token: options.clearToken ? 'false' : options.setToken });
      } else {
        main();
      }
    })
    .command('reset', 'Reset current folder gitman-config to defaults')
    .option(
      '-g, --global',
      'Reset both local and global gitman-config to defaults'
    )
    .action((args, options) => resetLocalConfig(options))
    .command('update', 'Batch update local repositories')
    .option(
      '--select',
      'Select repositories to batch update with `gitman update`'
    )
    .option('--all', 'Forcefully update all local repositories in the folder')
    .action((args, options) => {
      if (options.select) {
        selectRepositoriesToUpdate();
      } else {
        updateSelectedRepositories(options);
      }
    });

  program.parse(process.argv);
})();
