FROM node:24-alpine
WORKDIR /app
COPY server.mjs gates.json ./
USER node
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.mjs"]
