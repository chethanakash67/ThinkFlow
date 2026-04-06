FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    openjdk-17-jdk-headless \
    python3 \
    python3-pip \
    isolate \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package.json
RUN npm install --omit=dev

COPY . .

RUN useradd -m -u 10001 judge \
    && mkdir -p /tmp/judge-work /var/local/lib/isolate \
    && chown -R judge:judge /app /tmp/judge-work /var/local/lib/isolate

ENV JUDGE_SERVICE_NAME=judge-worker
USER judge
CMD ["npm", "run", "judge:worker"]
