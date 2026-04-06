FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY . .

ENV JUDGE_SERVICE_NAME=judge-api
CMD ["npm", "run", "judge:api"]
