# Orienteering Cloud Data Hub

"OrienteerFeed" is designed to be a dynamic and interactive web API platform which is specifically made for the orienteering community. Delivering real-time updates, live tracking, and a continuous stream of information about orienteering events is its key service.

⭐ Star us on GitHub — it motivates us a lot!

[![](https://dcbadge.limes.pink/api/server/https://discord.gg/YWURC23tHZ)](https://discord.gg/YWURC23tHZ)

## How It Works

This application is like a digital hub for all things related to orienteering events. It serves as a one-stop platform where you can get details about various events, the classes offered at these events, and the competitors participating in them. It provides these services through a web server and is capable of communicating using both RESTful APIs and GraphQL, which are two ways of fetching data from a server.

### Key Components

- Web Server: Built on Node.js and Express, this server acts as the central point that handles all requests from users' browsers or apps. It processes these requests and sends back the required information.
- RESTful API: This is a set of URLs (like links you click on the web) that you can access to get data about events, competitors, etc. For example, you might have a URL to get a list of all events and another to get detailed information about a specific event. You can access the API documentation by visiting `[server]/api-docs` in your web browser. This documentation is presented in the Swagger format, which provides a clear and interactive way of understanding the available API endpoints, their required parameters, and the responses they return. This tool also allows you to directly test API requests from within the documentation interface to see real-time responses from the server.
- GraphQL API: Unlike the RESTful API where each type of data might have its URL, GraphQL allows you to send queries to a single endpoint to fetch exactly the data you need. For example, you could ask for the names of all competitors in a specific class without getting any other unnecessary data. Explore and interact with our GraphQL API using the Apollo Sandbox by navigating to `[server]/graphql` in your web browser. The Apollo Sandbox provides an intuitive, interactive environment where you can construct and test your GraphQL queries and mutations directly against our live data.
- Persistence Storage: This is where all the data about events, classes, competitors, etc., is stored. Each time you make a query, the server retrieves data from this storage. It is set up using the MariaDB database.
- Our application secures sensitive operations, such as adding or modifying event details, through a robust user authentication system. Users are required to log in to gain access to these features. Authentication is managed using [JSON Web Tokens (JWT)](https://jwt.io/), a secure method that helps ensure that only authorized users can perform certain actions.
  - When a user logs in, they receive a JWT that encapsulates their user credentials and permissions.
  - This token must be included as a Bearer token in the headers of HTTP requests made to the API for operations that modify data.
  - The server validates this token to ensure it is valid and checks if the user has the right permissions to perform the requested action.
- XML Processing: The app can handle IOF-XML v3 data, which is a standard format for organizing data. This is useful for uploading and downloading data about entries or results from different systems that use [IOF-XML](https://github.com/international-orienteering-federation/datastandard-v3).

## Development

We will be using [Node.js](https://nodejs.org/) v22.14.0 (current LTS).
New JavaScript features (ES2015) are "enabled". Can be used with promises, ES6 generators and async/await using [Babel](https://babeljs.io/).

### NodeJS Express

- **[Express docs](https://expressjs.com/en/starter/hello-world.html)**

### Local development

Clone the git repo, install dependencies, and deploy database schema.
To clone and run this application, you'll need Git and Node.js (which comes with npm) installed on your computer. For consistent development and deployment environments, this project specifies a required Node.js version in the [.nvmrc](./.nvmrc) file. It is recommended to manage your Node.js installation using [Node Version Manager](https://github.com/nvm-sh/nvm) (nvm), which helps ensure that you are using the exact version of Node.js needed for this project. From your command line:

```bash
# Clone this repository
git clone https://github.com/orienteerfeed/ofeed.git
# Go into the repository
cd ofeed
# Install root dependencies
# (Root dependencies include shared development tools like Prettier and ESLint,
# which are used for code formatting, linting, and maintaining a consistent code style
# across both the client and server applications. These tools are not needed in production
# but are essential for a clean and maintainable codebase during development.)
npm install
```

#### Server

```bash
# Go into the app folder
cd server
Create .env from the template in .env.example and fill in the credentials to your database and keys to 3rd party.
# Install dependencies
npm install
# Deploy database schema
npx prisma migrate deploy
npx prisma db seed
# Run the app
npm run start:dev
```

#### Client

```bash
# Go into the app folder
cd client
Create .env from the template in .env.example and fill in the base url for backend api service.
# Install dependencies
npm install
# Run the app
npm run start
```

#### How to update database schema

1. Modify your `./server/prisma/schema.prisma` file to reflect the changes you want in your [database schema](https://www.prisma.io/docs/orm/prisma-schema/data-model/models). This could involve adding new models, updating existing models, or deleting models. For example, to add a new model:

```
model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
}
```

2. Generate Migration

```
npx prisma migrate dev --name your_migration_name
```

## Docker compose
```bash
# Create server and client env files
Create server/.env from the template in server/.env.example and fill in the credentials to your database and keys to 3rd party.
Create client/.env from the template in client/.env.example and fill in the base url for backend api service.
# Start the OFeed platform with one command, docker must be running (e.g. Docker Desktop)
docker compose up -d
```

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

1. Create your feature branch: `git checkout -b Feature/my-new-feature`
2. Commit your changes: `git commit -am 'Add some feature'`
3. Push to the branch: `git push origin Feature/my-new-feature`
4. Submit a pull request :D

## Changelog

In separate file [CHANGELOG.md](CHANGELOG.md). Please [keep a CHANGELOG](https://keepachangelog.com/).

This project adheres to [Semantic Versioning](https://semver.org/).

## Credits

- [Martin Křivda](https://github.com/martinkrivda)
- [Lukáš Kettner](https://github.com/lukaskett)
- [All Contributors](https://github.com/orienteerfeed/ofeed/graphs/contributors)

## License

[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](/LICENSE)
