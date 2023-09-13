# Mock

In order to properly consume external services on your local setup, we need to mock their responses.
This is done through the use of [mockoon](https://mockoon.com/).

# How to update mocked endpoints

- Download the desktop app https://mockoon.com/download/#download-section
- Import `mockoon.json` environment file
- Change whatever you want according to your need
  - File is saved on-the-fly on each modification
- Restart `mockoon` container with
```bash
docker-compose up --force-recreate -d
```
