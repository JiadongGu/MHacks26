FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8789
CMD ["npm", "start"]
