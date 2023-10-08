# Tickets API

This project holds the Coworking Metz tickets API source code, which keep entries about
each period a coworker is physically present in the open space.

## Getting Started

These instructions will give you a copy of the project up and running on
your local machine for development and testing purposes.

### Prerequisites

Requirements for the software and other tools to build, test and push

- [Git](https://git-scm.com/) - Version control system
- [NodeJS](https://nodejs.org/) 18.12+ - Cross-platform JavaScript runtime environment
- [yarn](https://yarnpkg.com/) - Package manager

### Install

A step by step series of examples that tell you how to get a development environment running

```bash
git clone git@github.com:coworking-metz/tickets-backend.git
cd tickets-backend
yarn
```

Copy the default environment file and set variable according to your will

```bash
cp .env.sample .env
```

### Initialize database with an archive

You can either have a MongoDB process already running or
start a new one through Docker prior importing the archive:
```bash
docker-compose up -d
```

```bash
docker exec -i tickets-backend-mongodb /usr/bin/mongorestore --nsInclude="tickets.*" --archive < /Users/whatever/2023-09-01-12-00-01-mongo-tickets.mongoarchive
```

### Set up Netatmo

To use Netatmo features you have to define `NETATMO_CLIENT_ID`, `NETATMO_CLIENT_SECRET` and `NETATMO_ENABLED=1` in your environment (basically you can edit your `.env` file).

You also need to initialize your configuration with an new refresh token generated from [Netatmo dev dashboard](https://dev.netatmo.com/apps).

:warning: You MUST NOT re-use a refresh token from the production environment since you WILL break the production.

```bash
node scripts/netatmo-authenticate.js "your-refresh-token"

> Authentication successful
```

*Double quotes are required since Netatmo tokens contain the | (pipe) character.*

### Start the project

```bash
yarn start
```

Or if you want some live-reload:

```bash
yarn dev
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

- [README-Template](https://github.com/PurpleBooth/a-good-readme-template) for what you're reading

