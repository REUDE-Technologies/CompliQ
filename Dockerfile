FROM node:22-alpine

WORKDIR /app

# Install only production dependencies from the backend lockfile.
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm ci --omit=dev --prefix ./backend \
    --fetch-retries=4 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=60000 \
    --fetch-timeout=120000

# The Express app serves the frontend from /app/public.
COPY backend/server.js ./backend/server.js
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "backend/server.js"]
