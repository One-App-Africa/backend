.PHONY: help docker-build docker-up docker-down docker-logs docker-clean docker-restart

# Default target
help:
	@echo "One App Backend - Docker Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make docker-build    - Build Docker images"
	@echo "  make docker-up       - Start all services"
	@echo "  make docker-down     - Stop all services"
	@echo "  make docker-logs     - View logs"
	@echo "  make docker-clean    - Clean up containers and volumes"
	@echo "  make docker-restart  - Restart all services"
	@echo "  make db-shell        - Connect to PostgreSQL shell"
	@echo "  make redis-shell     - Connect to Redis shell"
	@echo ""

# Build Docker images
docker-build:
	@echo "Building Docker images..."
	docker-compose build

# Start all services
docker-up:
	@echo "Starting all services..."
	cp .env.docker .env
	docker-compose up -d
	@echo "Services started! Backend: http://localhost:3000"
	@echo "pgAdmin: http://localhost:5050 (admin@oneapp.com / admin123)"

# Stop all services
docker-down:
	@echo "Stopping all services..."
	docker-compose down

# View logs
docker-logs:
	docker-compose logs -f

# Clean up
docker-clean:
	@echo "Cleaning up containers, volumes, and networks..."
	docker-compose down -v
	docker system prune -f

# Restart services
docker-restart:
	@echo "Restarting services..."
	docker-compose restart

# PostgreSQL shell
db-shell:
	docker exec -it oneapp-postgres psql -U oneapp_user -d oneapp

# Redis shell
redis-shell:
	docker exec -it oneapp-redis redis-cli -a oneapp_redis_2024
