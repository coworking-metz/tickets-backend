# Tickets API

This project holds the Coworking Metz tickets API source code, which keep entries about
each period a coworker is physically present in the open space.

## Getting Started

These instructions will give you a copy of the project up and running on
your local machine for development and testing purposes.

### Prerequisites

Requirements for the software and other tools to build, test and push

- [Git](https://git-scm.com/) - Version control system
- [Docker](https://www.docker.com/) - Container platform
- [yarn](https://yarnpkg.com/) - Package manager

### Install

A step by step series of examples that tell you how to get a development environment running:

```bash
git clone git@github.com:coworking-metz/tickets-backend.git
cd tickets-backend
yarn
```

### Initialize database with an archive

Start the database through Docker prior importing the archive:
```bash
docker-compose up -d
```

```bash
docker exec -i tickets-backend-mongodb /usr/bin/mongorestore --username user --password password --nsInclude="tickets.*" --archive < /Users/whatever/2023-09-01-12-00-01-mongo-tickets.mongoarchive
```

### Start the project

```bash
yarn dev
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

- [README-Template](https://github.com/PurpleBooth/a-good-readme-template) for what you're reading

