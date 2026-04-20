FROM node:20-alpine AS base

# Install curl for healthcheck and postgresql-client for pg_isready
RUN apk add --no-cache curl postgresql-client

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy package file (install without lockfile in Docker — workspace lockfile not portable)
COPY apps/web/package.json ./

# Create .npmrc for non-workspace install
RUN echo "shamefully-hoist=true" > .npmrc

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy prisma schema and generate client
COPY apps/web/prisma ./prisma/
RUN npx prisma generate

# Copy application source
COPY apps/web/src ./src/
COPY apps/web/public ./public/
COPY apps/web/next.config.ts ./
COPY apps/web/tsconfig.json ./
COPY apps/web/tailwind.config.ts ./
COPY apps/web/postcss.config.js ./

# Build Next.js
RUN pnpm build

# Standalone output: copy static assets and public into the standalone dir
RUN cp -r .next/static .next/standalone/.next/static && \
    cp -r public .next/standalone/public

# Copy entrypoint
COPY apps/web/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy seed script and prisma for entrypoint
COPY apps/web/prisma ./prisma/

# Create uploads directory
RUN mkdir -p /app/storage/uploads

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
