# ---------- Build Stage ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy only dependency-related files for caching
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client (needs schema and env for DATABASE_URL)
RUN npx prisma generate

# Build the TypeScript code
RUN pnpm run build


# ---------- Production Stage ----------
FROM node:22-alpine AS runner

WORKDIR /app

# Install pnpm (if needed in runtime, optional)
RUN npm install -g pnpm

# Copy only built output and required runtime files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

# Expose the backend port
EXPOSE 3000

# Start command (prisma deploy handled in compose)
CMD ["node", "dist/server.js"]
