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

### Set up parking remote (Shelly)

To enable parking remote feature, you must define `SHELLY_TOKEN` (authentication key from your Shelly Cloud or Shelly local account), `SHELLY_SERVER` (URL to Shelly Cloud server or your local device) and `SHELLY_PARKING_REMOTE_DEVICE` (device id) in your environment. We assume everything is already configured and output is on channel 0.

:warning: When you change your Shelly account password, your authentication key is refreshed.

### Set up Home Assistant

In order to contact [Home Assistant](https://github.com/coworking-metz/infrastructure/tree/main/home-assistant), you have to define the following environment variables:
- `HOME_ASSISTANT_BASE_URL`: reachable url of the Home Assistant server (like `http://homeassitant.local:8123/`). Trailing slash does matter.
- `HOME_ASSISTANT_LONG_LIVED_TOKEN`: [Long Lived Token](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token) of the Home Assistant account used to retrieve data. You can easily create a new one from the profile page http://homeassitant.local:8123/profile.

To find the `entity_id` of the entity you want to control, go to http://homeassistant.local:8123/developer-tools/state and look at for the left column named `Entity`.

> **Warning**
> Home Assistant instance is only reachable from the local network or from the VPS.

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

