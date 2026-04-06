const http = require('http');

const payload = JSON.stringify({
  problemId: 'sum-two-integers',
  language: 'cpp',
  sourceCode: `
#include <bits/stdc++.h>
using namespace std;

int main() {
  long long a, b;
  cin >> a >> b;
  cout << a + b << "\\n";
  return 0;
}
`.trim(),
});

const req = http.request({
  host: process.env.JUDGE_API_HOST || '127.0.0.1',
  port: Number(process.env.JUDGE_API_PORT || 4010),
  path: '/submissions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
}, (res) => {
  let body = '';
  res.on('data', (chunk) => {
    body += chunk.toString();
  });
  res.on('end', () => {
    console.log(body);
  });
});

req.write(payload);
req.end();
