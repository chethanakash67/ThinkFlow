const path = require('path');

const LANGUAGE_CONFIGS = {
  c: {
    sourceFile: 'main.c',
    executable: 'main',
    compile: {
      command: 'gcc',
      args: ['-O2', '-pipe', '-std=gnu17', '-static', '-s', 'main.c', '-o', 'main'],
      cpuTimeMs: 10000,
      realTimeMs: 15000,
      memoryKb: 512000,
      fileSizeKb: 262144,
      outputLimitKb: 1024,
      processCount: 32,
    },
    run: {
      command: './main',
      args: [],
    },
  },
  cpp: {
    sourceFile: 'main.cpp',
    executable: 'main',
    compile: {
      command: 'g++',
      args: ['-O2', '-pipe', '-std=gnu++20', '-static', '-s', 'main.cpp', '-o', 'main'],
      cpuTimeMs: 12000,
      realTimeMs: 18000,
      memoryKb: 768000,
      fileSizeKb: 262144,
      outputLimitKb: 1024,
      processCount: 32,
    },
    run: {
      command: './main',
      args: [],
    },
  },
  java: {
    sourceFile: 'Main.java',
    executable: 'Main.class',
    compile: {
      command: 'javac',
      args: ['-encoding', 'UTF-8', 'Main.java'],
      cpuTimeMs: 15000,
      realTimeMs: 20000,
      memoryKb: 768000,
      fileSizeKb: 262144,
      outputLimitKb: 1024,
      processCount: 64,
    },
    run: {
      command: 'java',
      args: ['-Xss256m', '-XX:+UseSerialGC', '-Xms64m', '-Xmx256m', 'Main'],
    },
  },
  python: {
    sourceFile: 'main.py',
    executable: 'main.py',
    compile: null,
    run: {
      command: 'python3',
      args: ['main.py'],
    },
  },
  javascript: {
    sourceFile: 'main.js',
    executable: 'main.js',
    compile: null,
    run: {
      command: 'node',
      args: ['--stack_size=65500', 'main.js'],
    },
  },
};

const resolveCheckerPath = (checkerFile) => path.resolve(__dirname, '..', 'checkers', checkerFile);

module.exports = {
  LANGUAGE_CONFIGS,
  resolveCheckerPath,
};
