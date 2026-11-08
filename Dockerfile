FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY database ./database
COPY scripts ./scripts
ENV NODE_ENV=production DEMO_MODE=false HOST=0.0.0.0
USER node
CMD ["npm", "start"]
