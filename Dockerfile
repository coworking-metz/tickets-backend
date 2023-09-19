FROM node:18

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package.json yarn.lock ./
RUN [ "yarn", "--prod" ]

# Bundle app source
COPY . .

EXPOSE 8080
ENV PORT 8080

CMD [ "node", "server.js" ]
