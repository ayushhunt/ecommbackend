# Use Node.js base image
FROM node:22-alpine

# Set working directory
WORKDIR /src

# Install pnpm
RUN npm install -g pnpm

# Copy only the dependency files first (layer caching)
COPY package.json pnpm-lock.yaml* ./

# Install dependencies inside the container
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# (Optional) Run Prisma migrations for production
# If you use `prisma migrate dev` locally, use `deploy` here


# Build TypeScript
RUN pnpm run build

# Expose backend port
EXPOSE 3000

# Start the app
CMD ["node", "dist/server.js"]
