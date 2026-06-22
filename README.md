# One App Backend

Backend API for One App - Africa's Value Distribution Network

## Quick Start with Docker (Recommended)

1. Start all services (PostgreSQL, Redis, Backend):
```bash
make docker-up
```

2. View logs:
```bash
make docker-logs
```

3. Stop all services:
```bash
make docker-down
```

The backend will be available at: http://localhost:3000/api/v1

Access pgAdmin at: http://localhost:5050
- Email: admin@oneapp.com
- Password: admin123

## Manual Setup (Without Docker)

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Configure your `.env` file with your credentials

4. Set up PostgreSQL and Redis locally

5. Run database migrations:
```bash
npm run migrate:latest
```

6. Start development server:
```bash
npm run dev
```

## Available Commands

### Docker Commands
- `make docker-build` - Build Docker images
- `make docker-up` - Start all services (PostgreSQL, Redis, Backend)
- `make docker-down` - Stop all services
- `make docker-logs` - View logs from all services
- `make docker-clean` - Clean up containers and volumes
- `make docker-restart` - Restart all services
- `make db-shell` - Connect to PostgreSQL shell
- `make redis-shell` - Connect to Redis CLI

### NPM Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Start production server
- `npm run lint` - Lint code
- `npm run test` - Run tests
- `npm run migrate:create` - Create new migration
- `npm run migrate:latest` - Run migrations
- `npm run migrate:rollback` - Rollback last migration

## API Documentation

API endpoints are defined in `documents/API_SPECIFICATIONS.md`

Base URL: `http://localhost:3000/api/v1`

## Project Structure

```
backend/
├── src/
│   ├── main.ts              # Application entry point
│   ├── app.module.ts        # Root module
│   ├── config/              # Configuration (database, redis)
│   ├── modules/             # Feature modules
│   │   ├── auth/           # Authentication
│   │   ├── user/           # User management
│   │   ├── kyc/            # KYC verification
│   │   ├── wallet/         # Wallet operations
│   │   ├── one-share/      # One Share feature
│   │   ├── card/           # Virtual card management
│   │   ├── payment/        # Payments
│   │   ├── transaction/    # Transaction history
│   │   ├── campaign/       # Campaigns
│   │   ├── one-bot/        # WhatsApp bot
│   │   ├── admin/          # Admin dashboard
│   │   └── webhook/        # Webhook handlers
│   └── services/           # Shared services
├── package.json
└── tsconfig.json
```

## Environment Variables

See `.env.example` for all required environment variables.

## Tech Stack

- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: PostgreSQL (with Knex)
- **Cache**: Redis
- **Queue**: Bull
- **Authentication**: JWT with Passport
- **Validation**: class-validator
- **Containerization**: Docker & Docker Compose

## Docker Services

The `docker-compose.yml` includes:

1. **PostgreSQL** (Port 5432)
   - Database for application data
   - Includes initialization scripts
   - Persistent volume for data

2. **Redis** (Port 6379)
   - Caching and session management
   - Persistent volume for data

3. **Backend API** (Port 3000)
   - NestJS application
   - Hot-reload enabled in development

4. **pgAdmin** (Port 5050)
   - Web-based PostgreSQL management
   - Optional service for database administration

## License

PROPRIETARY
