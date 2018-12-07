#!/usr/bin/env node

;(function () {
  // External modules
  const program = require('caporal'),
        fs = require('fs'),
        chalk = require('chalk'),
        gradient = require('gradient-string'),
        figlet = require('figlet'),
        opn = require('opn'),
        Conf = require('conf'),
        octokit = require('@octokit/rest')(),
        simpleGit = require('simple-git/promise'),
        fuzzysearch = require('fuzzysearch'),
        emoji = require('node-emoji'),
        clear = require('clear'),
        ora = require('ora'),
        inquirer = require('inquirer');

  // Config
  inquirer.registerPrompt('checkbox-plus', require('inquirer-checkbox-plus-prompt'));
  const globalConfig = new Conf(),
        localConfig = new Conf({
          cwd: process.cwd(),
          configName: ".gitman-config"
        });
  const repositories = {
    local: {},
    remote: {}
  };

  // Classes
  class Repo {
    constructor(name, props) {
      Object.assign(this, {
        remote: false,
        uncommitedChanges: false
      }, props);
  
      this.value = name;
      this.name = this.toString();
    }
  
    toString() {
      let output = this.remote ? chalk.gray(this.value) : chalk.green(this.value);
  
      if (this.branch) {
        const branchColor = this.branch === "master" ? "cyan" : "red";
        output += ` (${chalk[branchColor](this.branch)})`;
      }
  
      if (this.uncommitedChanges) {
        output += ` ${emoji.get('warning')}  ${chalk.red('Uncommited changes')}`;
      }
  
      return output;
    }
  }

  // Functions
  function resetLocalConfig({ global: globalReset }) {
    if (globalReset) {
      globalConfig.clear();
    }

    localConfig.clear();
  }

  function authenticate() {
    octokit.authenticate({
      type: 'token',
      token: globalConfig.get("github.token")
    });
  }

  function getOrgs() {
    return octokit.orgs.listMemberships().then(result => {
      return result.data;
    });
  }

  function getRepositoriesInPath(path) {
    return fs.readdirSync(path)
      .filter(file => fs.statSync(`${path}/${file}`).isDirectory())
      .filter(folder => fs.readdirSync(`${path}/${folder}`).includes('.git'));
  }

  async function getLocalRepos() {
    const currentWorkingDirectory = process.cwd();
    
    let repos = getRepositoriesInPath(currentWorkingDirectory);
    repos = await Promise.all(repos.map(async repoName => {
        const diff = await simpleGit(`${currentWorkingDirectory}/${repoName}`).diffSummary();
        const status = await simpleGit(`${currentWorkingDirectory}/${repoName}`).status();
        const repo = new Repo(repoName, {
          branch: status.current,
          uncommitedChanges: !!diff.files.length
        });
        repositories.local[repo.value] = repo;

        return repo;
    }));

    return repos;
  }

  async function getRemoteRepos() {
    if (!globalConfig.has("github.token") || globalConfig.get("github.token") === "false") {
      return [];
    }

    let fetch;
    if (localConfig.has("github.org")) {
      fetch = () => octokit.repos.listForOrg({ 
        org: localConfig.get("github.org")
      });
    } else {
      fetch = () => octokit.repos.list({
        affiliation: "owner"
      });
    }

    return fetch().then(({ data }) => {
      const repos = data.map(remoteRepo => {
        const repo = new Repo(remoteRepo.name, {
          remote: true,
          cloneUrl: remoteRepo.ssh_url
        });
        repositories.remote[repo.value] = repo;

        return repo;
      });

      return repos;
    })
    .catch(error => {
      console.log(`\n\n${error.HttpError || "Error connecting to Github with access token."}
You can create a new one at: https://github.com/settings/tokens
Then run \`gitman configure --token <token>\` to save it.`);
    });
  }

  async function getRepositories() {
    const spinner = ora("Loading repositories...").start();
    const repos = await Promise.all([getLocalRepos(), getRemoteRepos()]);
    spinner.stop();
    return Promise.resolve(repos);
  }

  function getRepoObjectsFromSelections(selections) {
    return selections.map(repoName => 
      repositories.local[repoName] ? repositories.local[repoName] : repositories.remote[repoName]);
  }

  function prepareActions(repos) {
    let pulls = [],
        clones = [];

    for (let repoName of Object.keys(repos)) {
      let repo = repos[repoName];
      switch (repo.remote) {
        case true:
          clones.push(repo);
          break;

        case false:
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
    console.log(chalk.blue("\nYour wish is my command:\n"));

    for (let repo of actions.pulls) {
      const spinner = ora(`Updating ${chalk.green(repo.value)}`).start();
      await simpleGit(`${reposFolderPath}/${repo.value}`).pull();
      spinner.succeed();
    }

    for (let repo of actions.clones) {
      const spinner = ora(`Cloning ${chalk.green(repo.value)}`).start();
      await simpleGit(`${reposFolderPath}`).clone(repo.cloneUrl, repo.value);
      spinner.succeed();
    }

    done();
  }

  function done() {
    console.log(chalk.blue('Done!\n'));
  }

  function terminate() {
    console.log(`\nYours truely,\n- ${gradient.rainbow('Gitman')}\n`);
    process.exit();
  }

  async function updateStarredRepositories({ all }) {
    const repos = await getLocalRepos();

    if (all) {
      const actions = prepareActions(repos);
      confirmActions(actions);
    } else if (localConfig.has("starredRepos")) {
      const starredRepoNames = localConfig.get("starredRepos").split(",");
      const starredRepos = getRepoObjectsFromSelections(starredRepoNames);
      const actions = prepareActions(starredRepos);
      confirmActions(actions);
    } else {
      console.log(`No repositories are starred.
Run \`gitman star\` to select repositories to star.
Then run \`gitman update\` again.
Or, run \`gitman update --all\` to force updating all local repositories.`);
    }
  }
  
  function configure({ token,  }) {
    if (typeof token !== "undefined") {
      globalConfig.set("github.token", token.trim());
      authenticate();
      console.log(`${chalk.green("✔")} Github token set`)
    }
  }

  // UI
  async function localSetup() {
    const orgs = await getOrgs();

    if (orgs.length) {
      return inquirer.prompt([
        {
          type: 'list',
          name: 'repositoriesType',
          message: 'What type of repositories do you want to manage in this folder?',
          choices: ['Personal', 'Organizational']
        },
        {
          when: answers => answers.repositoriesType === "Organizational",
          type: 'list',
          name: 'org',
          message: 'Select an organization to sync with this folder:',
          choices: orgs.map(org => org.organization.login)
        }
      ])
      .then(answers => {
        if (answers.repositoriesType === "Organizational") {
          localConfig.set("type", "org");
          localConfig.set("github.org", answers.org);
        } else {
          localConfig.set("type", "personal");
        }
        
        clear();
        listRepositories();
      });
    } else {
      localConfig.set("type", "personal");
    }
  }

  function setup() {
    console.log(`\n${gradient.rainbow('=== Gitman ===')}`)
    console.log(`\nLet's quickly set things up for you:\n`);

    inquirer.prompt([
      {
        type: 'confirm',
        name: 'setupInCurrentFolder',
        message: `We're at: ${chalk.cyan(process.cwd())}\n  Is this where you manage your local git repositories?`
      }
    ]).then(answers => {
      if (!answers.setupInCurrentFolder) {
        console.log('\nNo worries! Summon me again from another folder that you might prefer.');
        terminate();
        return;
      }

      const tokenCreationInstructions = "Press Enter to open your browser on https://github.com/settings/tokens";
      
      inquirer.prompt([
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
              opn('https://github.com/settings/tokens')
              return false;
            } else if (typeof value === "string" && value.length) {
              return true;
            } else {
              return false;
            }
          }
        }
      ])
      .then(answers => {
        configure({
          token: answers.githubToken || "false"
        });

        if (globalConfig.get("github.token") !== "false") {
          localSetup();
        } else {
          clear();
          listRepositories();
        }
      });
    });
  }

  function listRepositories() {
    function separator(text, color) {
      return new inquirer.Separator(`\n ${chalk[color]("=== " + text + " ===")} `);
    }

    getRepositories().then(repos => {
      let localRepoNames  = repos[0] || [],
          remoteRepoNames = repos[1] || [];

      // Filter out remote repositories that have already been cloned locally
      remoteRepoNames = remoteRepoNames.filter(remoteRepoName => 
        localRepoNames.findIndex(localRepoName => localRepoName.value === remoteRepoName.value) === -1);

      console.log(`\n${gradient.rainbow('=== Gitman ===')}\n`);

      inquirer.prompt([
        {
          type: 'checkbox-plus',
          name: 'selections',
          message: 'Choose repositories to continue:',
          pageSize: 50,
          searchable: true,
          source: (answers, search) => {
            let choices = [
              localRepoNames.length ? separator("Local", "cyan") : [],
              ...localRepoNames
            ];

            if (remoteRepoNames.length) {
              choices = [
                ...choices,
                separator("Remote", "gray"), 
                ...remoteRepoNames
              ];
            }

            return Promise.resolve(choices
              .filter(choice => {
              if (!(choice instanceof inquirer.Separator)) {
                return fuzzysearch(search, choice.value);
              } else {
                return true;
              }
            }));
          }
        },
      ])
      .then(answers => {
        clear();
        const repos = getRepoObjectsFromSelections(answers.selections);
        const actions = prepareActions(repos);
        confirmActions(actions);
      });
    });
  }

  function confirmActions(actions) {
    let actionsString = "";

    if (actions.pulls.length) {
      actionsString += chalk.cyan(`=== update ${emoji.get('arrows_counterclockwise')} ===\n`);
      actions.pulls.forEach(repo => {
        actionsString += `${chalk.cyan('➜')} ${chalk.green(repo.value)}\n`;
      });
    }

    if (actions.clones.length) {
      actionsString += chalk.cyan(`\n=== clone ${emoji.get('new')} ===\n`);
      actions.clones.forEach(repo => {
        actionsString += `${chalk.cyan('➜')} ${chalk.green(repo.value)}\n`;
      });
    }

    inquirer.prompt([
      {
        type: 'confirm',
        name: 'actionsConfirmed',
        message: `Review and confirm your selections:\n\n${actionsString}\nContinue?`
      }
    ])
    .then(answers => {
      if (answers.actionsConfirmed) {
        clear();
        runActions(actions);
      } else {
        terminate();
      }
    })
  }

  function starRepositories() {
    getLocalRepos().then(repos => {
      inquirer.prompt([
        {
          type: 'checkbox-plus',
          name: 'selections',
          message: 'Choose repositories to star:',
          pageSize: 50,
          searchable: true,
          source: (answers, search) => {
            let choices = [ ...repos ];

            return Promise.resolve(choices
              .filter(choice => {
                return fuzzysearch(search, choice.value);
              }));
          }
        },
      ])
      .then(answers => {
        localConfig.set("starredRepos", answers.selections.join(","));
        console.log(`${chalk.green("✔")} Starred repositories set.
Run \`gitman update\` to update all of the starred repositories.`)
      });
    });
  }

  function main() {
    // Check if it's the first run ever
    if (globalConfig.store && Object.keys(globalConfig.store).length == 0) {
      setup();
      return;
    }
    
    if (globalConfig.get("github.token") !== "false") {
      authenticate();
    }

    if (!localConfig.has("type")) {
      localSetup();
    } else {
      listRepositories();
    }
  }

  // Program
  program
    .version('1.0.0')
    .action(function() {
      main();
    })
    .command('configure', 'Set Gitman configuration properties')
    .option('--token <token>', 'Store a Github Personal Access Token')
    .action(function(args, options) {
      configure(options);
    })
    .command('star', 'Select repositories to star for easy update with `gitman update`')
    .action(function(args, options) {
      starRepositories();
    })
    .command('reset', 'Reset current folder gitman-config to defaults')
    .option('-g, --global', 'Reset both local and global gitman-config to defaults')
    .action(function(args, options) {
      resetLocalConfig(options);
    })
    .command('update', 'Batch update local repositories')
    .option('--all', 'Forcefully update all local repositories in the folder')
    .action(function(args, options) {
      updateStarredRepositories(options);
    });

  program.parse(process.argv);
})();