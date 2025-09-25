# Tickets API

This project holds the Coworking Metz tickets API source code, which keep entries about
each period a coworker is physically present in the open space.

## Getting Started

These instructions will give you a copy of the project up and running on
your local machine for development and testing purposes.

### Prerequisites

Requirements for the software and other tools to build, test and push

- [Git](https://git-scm.com/) - Version control system
- [NodeJS](https://nodejs.org/) 20.9+ - Cross-platform JavaScript runtime environment
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

> [!WARNING]
> When you change your Shelly account password, your authentication key is refreshed.

### Set up Home Assistant

In order to contact [Home Assistant](https://github.com/coworking-metz/infrastructure/tree/main/home-assistant), you have to define the following environment variables:
- `HOME_ASSISTANT_BASE_URL`: reachable url of the Home Assistant server (like `http://homeassitant.local:8123/`). Trailing slash does matter.
- `HOME_ASSISTANT_LONG_LIVED_TOKEN`: [Long Lived Token](https://developers.home-assistant.io/docs/auth_api/#long-lived-access-token) of the Home Assistant account used to retrieve data. You can easily create a new one from the profile page http://homeassitant.local:8123/profile.

To find the `entity_id` of the entity you want to control, go to http://homeassistant.local:8123/developer-tools/state and look at for the left column named `Entity`.

> [!IMPORTANT]
> Home Assistant instance is only reachable from the local network or from the production server.

### Set up Auth

User identification is processed by WordPress server located on https://www.coworking-metz.fr/ through OAuth2.
Once the user has been authenticated by WordPress, `tickets-backend` adds another layer based on internal business logic (balance, active subscription, membership).
This results to a JWT authentification containing basic user information and access.

To learn how to consume JWT authentication, check out [AUTH.md](./AUTH.md).

To properly configure auth, here are the following environment variables to set:
- `OAUTH_ENABLED`: words speak for themselves. Default to `0`.
- `OAUTH_FOLLOW_WHITELIST`: list of origins that are allowed to retrieve JWT tokens, separated by commas. Trailing slash does matter.
- `OAUTH_FOLLOW_ANY`: if you want to allow any origin. This should not be enabled in production. Default to `0`.
- `WORDPRESS_BASE_URL`: WordPress server managing users. Default to `https://www.coworking-metz.fr/`.
- `WORDPRESS_OAUTH_CLIENT_ID`: WordPress OAuth plugin client identifier. You will find it the plugin settings.
- `WORDPRESS_OAUTH_CLIENT_SECRET`: WordPress OAuth plugin client secret. You will find it the plugin settings.
- `JWT_ACCESS_TOKEN_PRIVATE_KEY`: anything you want, as long as you don't tell anyone.
- `JWT_ACCESS_TOKEN_EXPIRATION_TIME`: how long an access token should live. In the [zeit/ms](https://github.com/zeit/ms.js) format. Default to `15m`.
- `JWT_REFRESH_TOKEN_PRIVATE_KEY`: anything you want, as long as you don't tell anyone.
- `JWT_REFRESH_TOKEN_EXPIRATION_TIME`: how long an refresh token should live. In the [zeit/ms](https://github.com/zeit/ms.js) format. Default to `30d`.
- `JWT_REFRESH_TOKEN_SECRET_KEY`: anything you want with at least 32 characters. Like it says in the name, keep it secret.

### Mock external services

In case you don't want to setup external services, you can set environment variables to point to
[`mockoon`](https://mockoon.com) which is started through `docker-compose`.

```bash
HOME_ASSISTANT_BASE_URL=http://localhost:33001/home-assistant
SHELLY_SERVER=http://localhost:33001/shelly
```

### Calendar events

To retrieve events from a iCal calendar, you can setup `COWORKING_CALENDAR_URL` which should provide events in the [`ics`](https://en.wikipedia.org/wiki/ICalendar) format.

## Start the project

```bash
yarn start
```

Or if you want some live-reload:

```bash
yarn dev
```

## Email notifications

Tickets bundles a script to send notification emails to members.
You should consider executing this script once a day, at the end of the day.

```bash
node scripts/send-notification-emails.js
```

Pro-tips: use `crontab -e`

When improving emails and to make sure the email is properly rendered, you can start [Greenmail](https://greenmail-mail-test.github.io/greenmail/) and [Roundcube](https://roundcube.net/) with `docker-compose up`.
This will setup a SMTP/IMAP server and a WebUI for test purposes.

Then properly set your local environment:
```
SMTP_HOST=localhost
SMTP_PORT=33025
SMTP_USER=anyUser
SMTP_PASS=anyPassword
```

You should use the following command to take into account the local config when sending emails:
```bash
node --env-file .env scripts/send-notification-emails.js
```

Once emails have been sent, you can read them at http://localhost:38000.
Enter the receiver email and any password as credentials to check its mailbox.

If you want to quickly test the rendered result on multiple email client, go to https://testi.at/.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

- [README-Template](https://github.com/PurpleBooth/a-good-readme-template) for what you're reading

