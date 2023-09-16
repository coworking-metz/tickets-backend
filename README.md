# Tickets API

This project holds the Coworking Metz tickets API source code, which keep entries about
each period a coworker is physically present in the open space.

## Getting Started

These instructions will give you a copy of the project up and running on
your local machine for development and testing purposes.

### API Testing with Postman

There are files in the /doc/ folder that can be used in the Postman app to test and debug the API.

1. **Open Postman**: Launch the Postman application (or https://www.postman.com/).

2. **Import Option**: Click on the "File" menu, then select "Import..." or use the "Import" button usually found on the left upper corner.

3. **Choose File**: In the opened dialog, select "Upload Files" and browse your computer to select the JSON file.

4. **Confirm Import**: After selecting the file, click "Import" to add the collection to Postman.

5. **Run Requests**: Once imported, you'll see your requests on the left sidebar under "Collections". You can click on each one to view or edit details and execute the request.

6. **Testing**: You can run the requests individually or use Postman's Collection Runner to run a sequence of tests.

7. **Set Global Variables**: If needed, you can set global variables for use in your API requests. Go to the "Environments" tab on the top right corner, click on the "Globals" tab, then add key-value pairs. Click "Save" to store these settings.

Your API endpoints are now ready to be tested in Postman. You can also use the global variables set in the last step within your API requests.

### Prerequisites

Requirements for the software and other tools to build, test and push

- [Git](https://git-scm.com/) - Version control system
- [NodeJS](https://nodejs.org/) - Cross-platform JavaScript runtime environment
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

### Start the project

```bash
yarn start
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

- [README-Template](https://github.com/PurpleBooth/a-good-readme-template) for what you're reading

