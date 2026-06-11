# Build Stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npm run build
RUN npx prisma generate

# Production Runner Stage
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev
COPY --from=builder /usr/src/app/dist ./dist
RUN npx prisma generate

ENV NODE_ENV=production

# Start the bot
CMD ["node", "dist/index.js"]
