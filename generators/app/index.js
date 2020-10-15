'use strict';
const Generator = require('yeoman-generator');
const axios = require('axios').default;
const fs = require('fs');
const os = require('os');
const path = require('path');
const util = require('util');
const chalk = require('chalk');
const notice = chalk.blue;
const AWS = require('aws-sdk');

const sleep = function(ms, cb){
  return new Promise (cb => {
    setTimeout(cb,ms)
  });
};

const uid = function(){
  const min = 10000; 
  const max = 99999; 
  return Math.floor(Math.random() * (max - min + 1)) + min; 
}

const rmdirs = function(dir) {
  let entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.map(entry => {
    let fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? rmdirs(fullPath) : fs.unlinkSync(fullPath);
  });
  fs.rmdirSync(dir);
};

require('dotenv').config({ path: `${os.homedir()}/Documents/Sites/.env` });

module.exports = class extends Generator {

  async initializing() {
    if(!process.env.YEOMAN){
      this.log('.env not found. Please change to an appropriate directory.');
      return;
    }

    this.props = {
      awsUserSavedToGroup: false
    };
    this.props.envCreds = {
      aws_region: process.env.AWS_REGION,
      aws_sdk_id: process.env.AWS_ACCESS_KEY_ID,
      aws_sdk_key: process.env.AWS_SECRET_ACCESS_KEY,
      cloudformation_name: process.env.CLOUDFORMATION_STACK_NAME,
      aws_id: '',
      aws_secret: '',
      cloudfront_id: '',
      cloudfront_url: '',
      cloudfront_sih_url: process.env.CLOUDFRONT_SIH_URL,
    }

    this.props.forgeHeaders = {
      Authorization: `Bearer ${process.env.FORGE_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };

    this.props.serverIsReady = false;
    
    this.checkServerStatus = async function(){
      const self = this;
      await axios.get(`https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}`, {headers: this.props.forgeHeaders}).then(function(response){
        self.log(response.data.server.is_ready == true ? (chalk.green("The server has been provisioned and is ready for use.")) : chalk.yellow("The server is not yet ready. Waiting..."));
        if(response.data.server.is_ready){
          self.props.serverIsReady = true;
          self.props.serverDetails = response.data.server;
        }
      }).catch(function(error){
        self.log(chalk.red(error));
      });
    };

  }

  async prompting() {
    const prompts = [
      {
        type: 'confirm',
        name: 'createNewServer',
        message: 'Do you want to create a new server?',
        default: true,
        store: true,
      },
      {
        type: 'confirm',
        name: 'createNewRepo',
        message: 'Do you want to create a Github repository?',
        default: true,
        store: true,
      },
      {
        type: 'confirm',
        name: 'createAws',
        message: 'Do you want to create an AWS Bucket?',
        default: true,
        store: true,
      },
      {
        type: 'confirm',
        name: 'useNitro',
        message: 'Do you want to setup a Nitro site for local development?',
        default: true,
        store: true,
      },
      {
        type: 'input',
        name: 'projectName',
        message: `What's the name of the project? This will be snake-cased for slug/URL purposes. It will be used for as the name for any of the services you've asked to setup.`
      },
      {
        type: 'input',
        name: 'projectUrl',
        message: `What's the local URL of the project? (without protocol or domain. For 'https://newsite.test' type 'newsite')`
      },
    ];

    const props = await this.prompt(prompts);
    // To access props later use this.props.someAnswer;
    this.props.config = props;
    this.props.config.slug = this.props.config.projectName.toLowerCase().split(' ').join('-');
  }

  // *============================*
  // *=========forge setup========*
  // *============================*
  async getServerInfo(){
    if(this.props.config.createNewServer){
      this.log(notice("You indicated you wanted to create a new server. I've got a few questions."));
      const serverPrompts = [
        {
          type: 'list',
          name: 'serverSize',
          message: 'What is the size of the server?',
          choices: [
            '1 - 1GB RAM - 1 CPU Cores - 25GB SSD',
            '2 - 2GB RAM - 1 CPU Cores - 50GB SSD',
            '3 - 4GB RAM - 2 CPU Cores - 80GB SSD',
            '4 - 8GB RAM - 4 CPU Cores - 160GB SSD'
          ],
          default: 0,
          filter: function(val){
            return val.charAt(0);
          }
        },
        {
          type: 'list',
          name: 'phpVersion',
          message: 'What version of PHP should be used?',
          choices: [
            'PHP 7.4',
            'PHP 7.3',
            'PHP 7.2',
            'PHP 7.1',
            'PHP 7.0',
            'PHP 5.6'
          ],
          default: 0,
          filter: function(val){
            const version = val.split(' ')[1].split('.').join('');
            
            return `php${version}`;
          }
        },
        {
          type: 'list',
          name: 'dbDriver',
          message: 'What Database Driver do you want to use?',
          choices: [
            {
              name: 'None',
              value: ''
            },
            {
              name: 'MySQL (5.7)',
              value: 'mysql'
            },
            {
              name: 'MySQL (8.0)',
              value: 'mysql8',
            },
            {
              name: 'MariaDB (10.3)',
              value: 'mariadb',
            },
            {
              name: 'Postgres (12)',
              value: 'postgres'
            }
          ],
          default: 'mariadb'
        },
        {
          type: 'input',
          name: 'dbUser',
          message: 'What is the name of the database user?',
          default: 'craft_admin',
          filter: function(val){
            var newName = val.toLowerCase().split(' ').join('_');
            return newName;
          }
        },
        {
          type: 'input',
          name: 'dbName',
          message: 'What is the name of the database?',
          default: 'craft_live',
          filter: function(val){
            var newName = val.toLowerCase().split(' ').join('_');
            return newName;
          }
        },
      ];
      await this.prompt(serverPrompts)
        .then(serverInfo => {
          this.props.serverInfo = serverInfo
        });
  
      this.props.serverInfo.serverName = this.props.config.slug;
      this.log(notice("Server information received. Sending request to Forge."))
    }
  }

  async createNewServer(){
    
    if(this.props.config.createNewServer){
      const self = this;
      const data = {
        provider: process.env.PROVIDER,
        credential_id: process.env.PROVIDER_CREDENTIAL_ID,
        name: this.props.serverInfo.serverName,
        size: this.props.serverInfo.serverSize,
        database_type: this.props.serverInfo.dbDriver,
        database: this.props.serverInfo.dbName,
        php_version: this.props.serverInfo.phpVersion,
        region: process.env.SERVER_REGION,
      };

      await axios.post('https://forge.laravel.com/api/v1/servers',data, {headers: this.props.forgeHeaders})
      .then(function(response){
        self.log(chalk.green(`${response.status} - ${response.statusText}`));
        self.log(notice(`The server is getting set up. While we wait on that, let's set up some other things.`))
        self.props.newServerData = response.data;
      })
      .catch(function(error){
        self.log(chalk.red(error.response.data))
      })
    }
  }

  // *============================*
  // *========github setup========*
  // *============================*

  async getRepoInfo(){
    
    const self = this;
    if(this.props.config.createNewRepo){
      this.log(notice(`You indicated you wanted to set up a new repo. Let's do that now.`))
      const repoPrompts = [
        {
          type: 'input',
          name: 'repoDesc',
          message: 'Repository description',
        },
        {
          type: 'confirm',
          name: 'repoPrivate',
          message: 'Is the repository private?',
          default: true
        }
      ];

      await this.prompt(repoPrompts)
        .then(repoInfo => {
          self.props.repoInfo = repoInfo
        });
      this.props.repoInfo.repoName = this.props.config.slug;
      this.log(notice("Repository information received. Sending request to Github."))
    }
  }

  async createNewRepository(){
    
    if(this.props.config.createNewRepo){
      const self = this;

      const gitHeaders = {
        Authorization: `token ${process.env.GITHUB_OAUTH}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      };
      const data = {
        name: this.props.repoInfo.repoName,
        description: this.props.repoInfo.repoDesc,
        private: this.props.repoInfo.repoPrivate,
      };
      await axios.post(`https://api.github.com/orgs/madmadmad/repos`, data, {headers: gitHeaders}).then(function(response){
        self.log(chalk.green(`${response.status} - ${response.statusText}`));
        self.log(notice('Repository created successfully.'));
        self.props.newRepoData = response.data;
      }).catch(function(error){
        self.log(chalk.red(error));
        self.log(chalk.red(util.inspect(error.response.data.errors)));
      });
    }
  }

  // *============================*
  // *==========AWS setup=========*
  // *============================*

  // ? Confirm we want to create an AWS setup && verify API credentials
  async awsConfirmCreds() {
    
    if(this.props.config.createAws){
      this.log(notice("You indicated you wanted to create a new AWS S3 bucket. Doing so now."));
      const self = this;
      const envCreds = {
        accessKeyId: this.props.envCreds.aws_sdk_id,
        secretAccessKey: this.props.envCreds.aws_sdk_key
      }
      const credentials = new AWS.Credentials(envCreds);
      AWS.config.credentials = credentials;


      AWS.config.getCredentials(function(err) {
        if (err){
          self.log(chalk.red(err.stack));
          self.props.awsCredsValid = false;
        } else {
          self.log(chalk.green('AWS credentials found. Continuing ...'));
          self.props.awsCredsValid = true;
        }
      });
      AWS.config.update({region: this.props.envCreds.aws_region});
    }
  }

  // ? Create new AWS IAM User
  async awsCreateUser() {
    
    if(this.props.config.createAws && this.props.awsCredsValid){
      const userParams = {
        UserName: this.props.config.slug
      };
      this.log(notice("Creating IAM User now..."));
      try {
        const createUser = await new AWS.IAM().createUser(userParams).promise();
        this.props.awsUserName = createUser.User.UserName;
        this.log(chalk.green('Successfully created new AWS IAM user', createUser.User.UserName));
      } catch {
        this.props.awsUserName = false;
        this.log(chalk.red(createUser.message));
      }
    }

  }

  // ? Assign newly created user to group 'CraftSites'
  async awsAddUserGroup() {
    
    if(this.props.config.createAws && this.props.awsUserName){

      const groupAssignmentParams = {
        GroupName: "CraftSites",
        UserName: this.props.awsUserName
      };
      this.log(notice("Adding IAM User to user group now..."));
      try {
        const assignToGroup = await new AWS.IAM().addUserToGroup(groupAssignmentParams).promise();
        this.props.awsUserSavedToGroup = true;
        this.log(chalk.green('Successfully assigned new user to group'));
      } catch(err) {
        this.props.awsUserSavedToGroup = false;
        this.log(chalk.red("Error assigning new user to group"));
        this.log(chalk.red(err.code, err.message));
      }

    }
  }
          
  // ? Create Access Keys for the User we just created
  async awsCreateAccessKeys() {
    
    if(this.props.config.createAws && this.props.awsUserSavedToGroup){

      const userParams = {
        UserName: this.props.config.slug
      };
      this.log(notice("Creating IAM User Access Keys now..."));
      try {
        const createAccessKey = await new AWS.IAM().createAccessKey(userParams).promise();
        this.props.envCreds.aws_id = createAccessKey.AccessKey.AccessKeyId;
        this.props.envCreds.aws_secret = createAccessKey.AccessKey.SecretAccessKey;
        this.props.awsKeysGenerated = true;
        this.log(chalk.whiteBright('======================================'));
        this.log(chalk.green('SECRET ACCESS KEYS CREATED - TAKE NOTE'));
        this.log(chalk.whiteBright('======================================'));
        this.log(chalk.whiteBright('⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄ACCESS KEY ID⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄'));
        this.log(chalk.magentaBright(''));
        this.log(chalk.blue(createAccessKey.AccessKey.AccessKeyId));
        this.log(chalk.magentaBright(''));
        this.log(chalk.whiteBright('⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄SECRET ACCESS KEY⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄⌄'));
        this.log(chalk.magentaBright(''));
        this.log(chalk.blue(createAccessKey.AccessKey.SecretAccessKey));
        this.log(chalk.magentaBright(''));
      } catch {
        this.props.awsKeysGenerated = false;
        this.log(chalk.red(createAccessKey.message));
      }

    }
  }

  async awsConfirmBucketAvailability() {
    
    if(this.props.config.createAws && this.props.awsKeysGenerated){

      const BucketSettings = {
        Bucket: this.props.config.slug,
      }
      
      const modifiedBucketName = `${this.props.config.slug}-mdhs-${uid()}`;
      this.log(notice("Confirming S3 Bucket name availability..."));
      try {
        const getBucketLocation = await new AWS.S3().getBucketLocation(BucketSettings).promise();
        this.log(chalk.yellow(`S3 Bucket named ${this.props.config.slug} already exists. Changing to make unique...`));
        this.props.awsBucketName = modifiedBucketName;
      } catch(err){
        if(err.NoSuchBucket){
          this.log(chalk.green(`S3 Bucket named ${this.props.config.slug} is available. Continuing...`))
          this.props.awsBucketName = this.props.config.slug;
        } else {
          this.log(chalk.yellow(`S3 Bucket named ${this.props.config.slug} already exists. Changing to make unique...`));
          this.props.awsBucketName = modifiedBucketName;
        }
      }
    }

  }

  async awsCreateBucket(){
    
    if(this.props.config.createAws && this.props.awsBucketName){
      const bucketSetupConfig = {
        ACL: "private",
        Bucket: this.props.awsBucketName,
        CreateBucketConfiguration: {
          LocationConstraint: "us-east-2"
        }
      };
      this.log(notice("Creating S3 Bucket now..."));
      try {
        const createBucket = await new AWS.S3().createBucket(bucketSetupConfig).promise();
        this.props.awsBucketCreated = true;
        this.log(chalk.green(`S3 bucket ${this.props.awsBucketName} created successfully.`))
      } catch(err) {
        this.props.awsBucketCreated = false;
        this.log(chalk.red(err.code, err.message));
      }
    }

  }

  async awsCreateCloudfrontDist() {
    
    if(this.props.config.createAws && this.props.awsBucketCreated){

      const originId = `S3-${this.props.awsBucketName}`;
      const cloudFrontSetupConfig = {
        
        DistributionConfig: {
          CallerReference: Date.now().toString(),
          DefaultCacheBehavior: {
            TargetOriginId: originId,
            ViewerProtocolPolicy: 'allow-all',
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            MinTTL: 0,
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none"
              } 
            }
          },
          Comment: this.props.awsBucketName,
          Enabled: true,
          Origins: {
            Quantity: 1,
            Items: [{
              Id: originId,
              DomainName: `${this.props.awsBucketName}.s3.amazonaws.com`,
              S3OriginConfig: {
                OriginAccessIdentity: ''
              }
            }]
          }
        },
      };
      this.log(notice("Creating CloudFront distribution now..."));
      try {
        const createCloudFrontDist = await new AWS.CloudFront().createDistribution(cloudFrontSetupConfig).promise();
        this.props.awsCloudFrontCreated = true;
        this.log(chalk.green(`CloudFront distribution created successfully.`));
        this.props.envCreds.cloudfront_url = createCloudFrontDist.Distribution.DomainName;
        this.props.envCreds.cloudfront_id = createCloudFrontDist.Distribution.Id;
        
      } catch(err) {
        this.log(chalk.red(JSON.stringify(err)))
        this.log(chalk.red(err.code, err.message));
      }
    
    } else {
      this.props.awsCloudFrontCreated = false;
      this.log(chalk.red('Cannot create new CloudFront distribution because the request to make a new Bucket failed.'));
    }
  }

  async awsGetExistingParams() {
    
    if (this.props.config.createAws && this.props.awsCloudFrontCreated){
      const cloudFormationSettings = {
        StackName: this.props.envCreds.cloudformation_name,
      }

      this.log(notice("Getting existing CloudFormation Stack parameters..."));

      try{
        const existingStack = await new AWS.CloudFormation().describeStacks(cloudFormationSettings).promise();
        this.props.awsExistingParams = true;
        this.props.cloudformationOriginalParameters = existingStack.Stacks[0].Parameters;
      } catch(err) {
        this.props.awsExistingParams = false;
        this.log(chalk.red(err.code, err.message))
      }

    }
  }

  async awsUpdateCloudFormationStack() {
    
    if(this.props.config.createAws && this.props.cloudformationOriginalParameters){

      // ? Get just the SourceBuckets parameter object
      const originalSourceListArr = this.props.cloudformationOriginalParameters.filter((param) => {
        return param.ParameterKey === "SourceBuckets";
      });

      // ? Get everything except the SourceBuckets parameter object
      const originalParametersSansSourceBuckets = this.props.cloudformationOriginalParameters.filter((param) => {
        return param.ParameterKey !== "SourceBuckets";
      });

      // ? turn param string into array so we can easily modify
      const originalSourceBuckets = originalSourceListArr[0].ParameterValue.split(', ');
      originalSourceBuckets.push(this.props.awsBucketName);
      const newSourceBuckets = originalSourceBuckets.join(', ');
      originalSourceListArr[0].ParameterValue = newSourceBuckets;
      // ? combine the original params with the updated SourceBuckets params
      const newParams = originalParametersSansSourceBuckets.concat(originalSourceListArr[0]);

      const cloudFormationSettings = {
        StackName: this.props.envCreds.cloudformation_name,
        Parameters: newParams,
        UsePreviousTemplate: true,
        Capabilities: ["CAPABILITY_NAMED_IAM"]
      }

      this.log(notice("Adding new bucket to CloudFormation Stack parameters..."));

      try{
        const updateCloudFormation = await new AWS.CloudFormation().updateStack(cloudFormationSettings).promise();
        this.log(chalk.green("The SIH CloudFormation stack has been updated with the new bucket name."))
      } catch(err){
        this.log(chalk.red(err.code, err.message))
      }

    }
  }

  // *=====================================*
  // *========wait for server setup========*
  // *=====================================*

  async waitForServerProvision(){
    if(this.props.config.createNewServer){
      this.log("Go grab yourself a coffee ☕️. This will take about 15 minutes.")
      while(!this.props.serverIsReady){
        await sleep(240000, this.checkServerStatus());
      }
    }
  }

  // *=================================*
  // *=========forge site setup========*
  // *=================================*

  async getDatabaseDetails(){
    if(this.props.config.createNewServer){
      if(!this.props.serverIsReady){
        this.checkServerStatus();
        await sleep(5000);
      }
      this.log(notice('Getting database details...'));
      const self = this;

      await axios.get(`https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/mysql`, {headers: this.props.forgeHeaders})
      .then(function(response){
        self.log(chalk.green("Database details received successfully."));
        self.props.databaseDetails = response.data.databases[0];
      })
      .catch(function(error){
        self.log(chalk.red("Unable to retrieve database details."))
        self.log(chalk.red(error.response.data))
      })
    }
  }

  async createDatabaseUser(){
    if(this.props.config.createNewServer && this.props.serverIsReady){
      this.log(notice("Creating database user..."));
      const self = this;

      const data = {
        name: this.props.serverInfo.dbName,
        password: this.props.newServerData.database_password,
        databases: [
          this.props.databaseDetails.id
        ]
      };

      try{
        await axios.post(`https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/mysql-users`,data, {headers: this.props.forgeHeaders})
          .then(function(response){
            self.log(chalk.green(response.status, response.statusText));
          })
          .catch(function(error){
            self.log(chalk.red(error))
          })
      } catch(error){
        this.log(chalk.red(error));
      }

    }
  }

  async deleteDefaultSite(){
    if(this.props.config.createNewServer && this.props.serverIsReady){
      this.log(notice("Deleting default forge site..."))
      const self = this;
      
      try{
        
        await axios.get(
          `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites`, 
          {headers: this.props.forgeHeaders}
        ).then(function(response){
            self.props.defaultSiteData = response.data.sites;
          })
      }catch(error){
        this.log(chalk.red(error))
      }

      if(this.props.defaultSiteData.length > 0 && this.props.defaultSiteData[0].name === 'default'){
        try{
          await axios.delete(
            `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.defaultSiteData[0].id}`, 
            {headers: this.props.forgeHeaders}
          ).then(function(response){
              self.log(chalk.green(response.status, "Default Forge site deleted successfully."))
            })
        } catch(error){
          this.log(chalk.red(error))
        }
      }
    }
  }

  async createNewSite(){
    if(this.props.config.createNewServer && this.props.serverIsReady){
      this.log(notice("Creating new site on the server..."));
      const self = this;

      const data = {
        domain: `${this.props.config.projectUrl}.madmadmad.net`,
        project_type: "php",
        directory: "/public"
      };
      
      try{
        await axios.post(`https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites`,data, {headers: this.props.forgeHeaders})
        .then(function(response){
          self.log(chalk.green(response.status, response.statusText));
          self.props.newSiteData = response.data;
        })
        .catch(function(error){
          self.log(chalk.red(error.response.data));
        })
      } catch(error){
        this.log(chalk.red(error));
      }
    }
  }

  writing() {
    this.log(notice("Writing template files with project information..."));

    const projectName = this.props.config.slug;
    this.fs.copyTpl(
      this.templatePath('local/.env'),
      this.destinationPath(`${os.homedir()}/${projectName}_temp/local/.env`),
      this.props
    )
    this.fs.copyTpl(
      this.templatePath('local/general.php'),
      this.destinationPath(`${os.homedir()}/${projectName}_temp/local/general.php`),
      this.props
    )
    this.fs.copyTpl(
      this.templatePath('server/.env'),
      this.destinationPath(`${os.homedir()}/${projectName}_temp/server/.env`),
      this.props
    )
    this.fs.copyTpl(
      this.templatePath('server/deployment-script.conf'),
      this.destinationPath(`${os.homedir()}/${projectName}_temp/server/deployment-script.conf`),
      this.props
    )
  }

  install() {
    const projectName = this.props.config.slug;
    
    const projectFolder = `${os.homedir()}/Documents/Sites/${projectName}`;
    const execOptions = {cwd: projectFolder};

    this.log(notice('Creating new Composer project...'));
    this.spawnCommandSync('composer', [`create-project`, 'madhouse/craft-starter', projectFolder, '1.2.0.x-dev', '--remove-vcs', '--no-scripts']);

    this.log(notice('Installing NPM...'))
    this.spawnCommandSync('npm', ['install'], execOptions);

    if(this.props.config.useNitro){
      this.log(notice('Setting up local Nitro config...'))
      this.spawnCommandSync('nitro',['add', `--hostname=${this.props.config.projectUrl}`, `--webroot=public`], execOptions);
      this.spawnCommandSync('nitro', ['db', 'add', '&&', this.props.config.projectName], execOptions);
    }

    if(this.props.config.createNewRepo){
      this.log(notice('Pushing new project to Github...'))
      this.spawnCommandSync('git', ['init'], execOptions);
      this.spawnCommandSync('git', ['add', '.'], execOptions);
      this.spawnCommandSync('git', ['commit', '-m "🎉 Initial Commit 🎉"'], execOptions);
      this.spawnCommandSync('git', ['branch', '-M', 'master'], execOptions);
      this.spawnCommandSync('git', ['remote', 'add', 'origin', `${this.props.newRepoData.clone_url}`], execOptions);
      this.spawnCommandSync('git', ['push', '-u', 'origin', 'master'], execOptions);
    }
    
    this.log(chalk.green("Composer, NPM, and/or Nitro has installed / initiated."));
  }

  async end(){ 
    this.log(notice('Wrapping things up...'));

    const self = this;
    const projectName = this.props.config.slug;
    
    const uploadEnvData = {
      "content": JSON.stringify(this.fs.read(`${os.homedir()}/${projectName}_temp/server/.env`))
    };

    const uploadDeploymentScript = {
      "content": JSON.stringify(this.fs.read(`${os.homedir()}/${projectName}_temp/server/deployment-script.conf`))
    }

    // ? Moving Local env file to new project folder
    this.log('Moving local .env file...');
    this.fs.move(`${os.homedir()}/${projectName}_temp/local/.env`, `${os.homedir()}/Documents/Sites/${projectName}/`);

    // ? Moving general.php file to new project folder
    this.log('Moving general.php file...');
    this.fs.move(`${os.homedir()}/${projectName}_temp/local/general.php`, `${os.homedir()}/Documents/Sites/${projectName}/config/`)

    // ? Add new repository to Forge site
    if(this.props.config.createNewServer && this.props.config.createNewRepo && this.props.serverIsReady){
      
      this.log(notice('Connecting our new repository to the site we just created...'));
      const data = {
        provider: "github",
        repository: `madmadmad/${this.props.repoInfo.repoName}`,
        branch: "master"
      };

      try{
        await axios.post(
          `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.newSiteData.site.id}/git`,
          data, 
          {headers: this.props.forgeHeaders}
        )
        .then(function(response){
          self.log(chalk.green(response.status, response.statusText));
        })
        .catch(function(error){
          self.log(chalk.red(error))
        })
      } catch(error){
        this.log(chalk.red(error));
      }
    }

    // ? Add server.env file to forge site      
    this.log(notice('Uploading .env file to site...'));
    try {
      await axios.put(
        `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.newSiteData.site.id}/env`, 
        uploadEnvData, 
        {headers: this.props.forgeHeaders}
      )
      .then(function(response){
        self.log(chalk.green(response.status, response.statusText));
      })
      .catch(function(error){
        self.log(chalk.red(error))
      });
    } catch(error){
      this.log(chalk.red(error));
    }

    // ? Upload new deployment script
    this.log(notice('Uploading deployment script to site...'));
    try{
      await axios.put(
        `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.newSiteData.site.id}/deployment/script`,
        uploadDeploymentScript, 
        {headers: this.props.forgeHeaders}
      )
      .then(function(response){
        self.log(chalk.green(response.status, response.statusText));
      })
      .catch(function(error){
        self.log(chalk.red(error))
      });
    } catch(error){
      this.log(chalk.red(error));
    }
        

    // ? Enable quick deploy on the new forge site
    this.log(notice('Enabling quick deploy on server...'));
    if(this.props.config.createNewServer && this.props.serverIsReady){
      try{
        axios.post(
          `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.newSiteData.site.id}/deployment`,
          {},
          {headers: this.props.forgeHeaders}
        )
        .then(function(response){
          self.log(chalk.green(response.status, response.statusText));
        })
        .catch(function(error){
          self.log(chalk.red(error.response.data));
        })
      } catch(error){
        this.log(chalk.red(error));
      }
    }

    // ? Run deployment on forge      
    this.log(notice('Running deployment on the site...'));
    try {
      await axios.post(
        `https://forge.laravel.com/api/v1/servers/${this.props.newServerData.server.id}/sites/${this.props.newSiteData.site.id}/deployment/deploy`,
        {},
        {headers: this.props.forgeHeaders})
        .then(function(response){
          self.log(chalk.green(response.status, response.statusText));
        })
        .catch(function(error){
          self.log(chalk.red(error))
        });
    } catch(error){
      this.log(chalk.red(error));
    }
        
    this.log('Deleting temp folder.');
    rmdirs(`${os.homedir()}/${projectName}_temp`);
    this.log('🎉🎉🎉🎉🎉');
    this.log(notice('All finished! You can now cd into your new project and get to work.'));
    this.log('🎉🎉🎉🎉🎉');

  }
};
