#!/usr/bin/env python3
import math
import sys

if len(sys.argv) != 4:
    print("usage: checker <input> <expected> <actual>", file=sys.stderr)
    sys.exit(2)

with open(sys.argv[2], "r", encoding="utf-8") as expected_file:
    expected_raw = expected_file.read().strip()

with open(sys.argv[3], "r", encoding="utf-8") as actual_file:
    actual_raw = actual_file.read().strip()

try:
    expected = float(expected_raw)
    actual = float(actual_raw)
except ValueError:
    print("invalid numeric output", file=sys.stderr)
    sys.exit(1)

if math.isclose(expected, actual, rel_tol=1e-6, abs_tol=1e-6):
    sys.exit(0)

print(f"expected {expected_raw}, got {actual_raw}", file=sys.stderr)
sys.exit(1)
