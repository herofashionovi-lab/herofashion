Docker deployment and run instructions

Quick start (development/demo):

1. Copy example env and set a real JWT secret

   cp .env.example .env
   # Edit .env and set JWT_SECRET to a secure value

2. Build and run with Docker Compose (runs backend on 4000 and frontend on 3000)

   docker-compose up --build -d

3. Open in your browser
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:4000

Notes:
- The SQLite database file is stored in a Docker volume named `dbdata` and is mounted at /data/orders.db inside the backend container.
- To see backend logs:

   docker-compose logs -f backend

- To stop and remove containers (keeps volume):

   docker-compose down

- To stop and remove containers and the database volume (data will be lost):

   docker-compose down -v

Creating an admin user:
- Use the register endpoint, e.g.:

  curl -X POST http://localhost:4000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Admin","email":"admin@example.com","password":"yourpassword"}'

- Then login to get a token and use the app.

Production notes:
- Replace JWT_SECRET in the .env with a strong secret.
- Consider using Postgres for production and migrate the schema (this scaffold uses SQLite for simplicity).
- Configure HTTPS / reverse proxy in front of the frontend/backend as needed.
