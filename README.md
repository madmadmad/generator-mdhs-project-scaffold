# generator-mdhs-project-scaffold
> An opinionated generator to jumpstart new Craft CMS projects hosted on Laravel Forge

## Installation

First, install [Yeoman](http://yeoman.io) and generator-mdhs-project-scaffold using [npm](https://www.npmjs.com/) (we assume you have pre-installed [node.js](https://nodejs.org/)).

```bash
npm install -g yo
```

Once this project is on NPM, you can install via 

```bash
npm install -g generator-mdhs-project-scaffold
```

Until then, you can download the project zip, open the project folder in your terminal and run 

```bash
npm link
```

## What it Does

1. Creates a new server (Laravel Forge)
    - Deletes "default" site
    - Creates new database and user
    - adds new repository to site
    - updates site's environment file
    - updates site's deployment script
    - enables auto-deploy
2. Creates a new repository (Github)
3. Creates a new AWS User
    - Assigns created user to specific group
    - Generates access keys for user
4. Creates new AWS S3 Bucket
5. Create CloudFront Distribution for new bucket
6. Updates CloudFormation stack to include new bucket
7. Creates new local project folder via `composer create-project` & our [craft-starter](https://github.com/madmadmad/craft-starter/tree/1.2.0) project
    - composer and npm are installed automatically
8. Adds new project folder to Craft Nitro and sets up new local database

## Before Using the Generator

The generator expects certain files and folders to be in certain places.

### Environment File

The generator expects a `.env` to be located in `<home_directory>/Documents/Sites/.env` with the following contents.

```
YEOMAN=TRUE

FORGE_KEY=""

PROVIDER=""
PROVIDER_CREDENTIAL_ID=""
SERVER_REGION=""

GITHUB_OAUTH=""
GITHUB_USER=""
GITHUB_PASSWORD=""

AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION=""

CLOUDFORMATION_STACK_NAME=""
CLOUDFRONT_SIH_URL=""
```

### Project Folder

The generated project folder will be placed in the `<home_directory>/Documents/Sites` directory.

## Using the Generator


```bash
yo mdhs-project-scaffold
```

## Roadmap & To-dos

- Cleanup all Forge requests to by more DRY.
- Create a better store for all the data. Currently, response data is handled willy-nilly.
- Fix delay after server has successfully provisioned.

## License

MIT © 2020 [Madhouse Creative, LLC](https://madmadmad.com)
