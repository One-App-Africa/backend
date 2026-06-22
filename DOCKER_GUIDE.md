# One App Docker Guide

## Quick Start

Start all services:
```bash
make docker-up
```

Stop all services:
```bash
make docker-down
```

View logs:
```bash
make docker-logs
```

## Services Running

All services are now running and healthy:

### 1. PostgreSQL Database
- **Port**: 5434 (host) → 5432 (container)
- **Container**: `oneapp-postgres`
- **Credentials**:
  - User: `oneapp_user`
  - Password: `oneapp_password_2024`
  - Database: `oneapp`
- **Connect**: `psql -h localhost -p 5434 -U oneapp_user -d oneapp`

### 2. Redis Cache
- **Port**: 6381 (host) → 6379 (container)
- **Container**: `oneapp-redis`
- **Password**: `oneapp_redis_2024`
- **Connect**: `redis-cli -h localhost -p 6381 -a oneapp_redis_2024`

### 3. Backend API
- **Port**: 4000 (host) → 3000 (container)
- **Container**: `oneapp-backend`
- **URL**: http://localhost:4000
- **API Base**: http://localhost:4000/api/v1
- **Health Check**: http://localhost:4000/api/v1/health

### 4. pgAdmin (Database Management)
- **Port**: 5050
- **Container**: `oneapp-pgadmin`
- **URL**: http://localhost:5050
- **Credentials**:
  - Email: admin@oneapp.com
  - Password: admin123

## Useful Commands

### Container Management
```bash
# View all One App containers
docker ps | grep oneapp

# Check specific container logs
docker logs oneapp-backend
docker logs oneapp-postgres
docker logs oneapp-redis

# Access PostgreSQL shell
make db-shell

# Access Redis CLI
make redis-shell

# Restart specific service
docker-compose restart backend
docker-compose restart postgres
docker-compose restart redis
```

### Database Operations
```bash
# Connect to PostgreSQL
docker exec -it oneapp-postgres psql -U oneapp_user -d oneapp

# View all tables
\dt

# Quit PostgreSQL
\q
```

### Cleanup
```bash
# Stop and remove containers (keeps data)
make docker-down

# Remove containers and volumes (deletes data)
make docker-clean
```

## Testing the API

### Health Check
```bash
curl http://localhost:4000/api/v1/health
```

### Register a User
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+2348012345678",
    "password": "SecurePass123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

## Database Schema

The database is automatically initialized with:
- Complete schema (30+ tables)
- Indexes and constraints
- Triggers for updated_at columns
- Sample seed data (admin user, first 10K campaign)

## Environment Variables

All environment variables are set in `docker-compose.yml`:
- Database connection
- Redis connection
- JWT secrets
- API keys (using test credentials)

## Troubleshooting

### Container keeps restarting
```bash
# Check logs
docker logs oneapp-backend --tail 50

# Check container status
docker ps -a | grep oneapp
```

### Cannot connect to database
```bash
# Verify PostgreSQL is healthy
docker ps | grep oneapp-postgres

# Check PostgreSQL logs
docker logs oneapp-postgres
```

### Port conflicts
If ports are already in use, edit `docker-compose.yml`:
- Backend: Change `4000:3000` to another port
- PostgreSQL: Change `5434:5432` to another port
- Redis: Change `6381:6379` to another port

## Next Steps

1. **Develop locally**: Edit files in `src/` and rebuild with `docker-compose up -d --build`
2. **Access pgAdmin**: Open http://localhost:5050 to manage the database visually
3. **Test endpoints**: Use Postman or curl to test API endpoints
4. **View logs**: Use `make docker-logs` to see real-time logs
5. **Database migrations**: Create migrations with `npm run migrate:create <name>`

## Architecture

```
┌─────────────────────────────────────────┐
│         Docker Network                   │
│                                          │
│  ┌──────────┐    ┌──────────────────┐  │
│  │ Backend  │───▶│   PostgreSQL     │  │
│  │ :3000    │    │   :5432          │  │
│  └────┬─────┘    └──────────────────┘  │
│       │                                  │
│       │          ┌──────────────────┐  │
│       └─────────▶│     Redis        │  │
│                  │     :6379        │  │
│                  └──────────────────┘  │
└─────────────────────────────────────────┘
         │
         │ Exposed Ports
         ▼
   localhost:4000  (Backend API)
   localhost:5434  (PostgreSQL)
   localhost:6381  (Redis)
   localhost:5050  (pgAdmin)
```

## Production Deployment

For production:
1. Update environment variables in `docker-compose.yml`
2. Use strong encryption keys and passwords
3. Set `NODE_ENV=production`
4. Use proper JWT secrets
5. Configure real provider API keys
6. Set up SSL/TLS
7. Configure proper logging and monitoring
