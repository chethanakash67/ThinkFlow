# ThinkFlow Judge Platform

This directory contains a production-oriented online judge subsystem designed around three isolated roles:

- `judge-api`: accepts submissions, persists status, exposes metrics.
- `redis`: durable queue + submission state store.
- `judge-worker`: compiles once and executes every testcase in a fresh `isolate` sandbox.

## Highlights

- Queue-based architecture with BullMQ and Redis.
- Hardened sandbox runner using `isolate`, not plain Docker execution.
- Per-testcase isolation: every testcase gets its own clean sandbox.
- Resource limits: CPU time, real time, memory, file size, process count, output bytes.
- Verdicts: `AC`, `WA`, `TLE`, `MLE`, `RE`, `OLE`, `CE`, `SE`.
- Checker modes: exact, trimmed, custom executable.
- Structured logs per submission and testcase.
- Metrics endpoint for queue depth and average compile/run timings.

## Layout

- `api/src/server.js`: submission API and metrics endpoint.
- `worker/src/worker.js`: queue consumer.
- `worker/src/judge/judge-service.js`: compile and judge pipeline.
- `worker/src/judge/sandbox.js`: `isolate` integration.
- `shared/problems.json`: example problems and testcase fixtures.
- `checkers/floating_average_checker.py`: example custom checker executable.

## Run Locally

From the repository root:

```bash
docker compose up --build redis judge-api judge-worker
```

Then submit:

```bash
curl -X POST http://localhost:4010/submissions \
  -H 'Content-Type: application/json' \
  -d '{
    "problemId": "sum-two-integers",
    "language": "cpp",
    "sourceCode": "#include <bits/stdc++.h>\nusing namespace std;\nint main(){long long a,b;cin>>a>>b;cout<<a+b<<\"\\n\";return 0;}"
  }'
```

Poll:

```bash
curl http://localhost:4010/submissions/<submission-id>
```

Metrics:

```bash
curl http://localhost:4010/metrics
```

## Security Notes

- Sandboxing is enforced by `isolate` inside the worker, not by the queue or API.
- Network is disabled per run with `--share-net=0`.
- Runs are bound to a small writable workspace; output size is capped.
- Worker container runs as non-root.
- For stronger production hardening, deploy the worker with:
  - AppArmor or SELinux profile.
  - read-only container root filesystem.
  - dedicated kernel with cgroups v2 enabled.
  - isolated worker nodes with no east-west network except Redis.
  - separate seccomp profile and capability minimization.

## Production Notes

- Scale horizontally by increasing `judge-worker` replicas.
- Keep Redis external or highly available for real deployments.
- Persist logs to your logging stack instead of Redis lists.
- Store submissions and testcase artifacts in object storage if audit retention is required.
