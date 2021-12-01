#!/bin/bash

CWD="$(dirname $0)"

TTL=1
ENTRIES=100000
REFERENCES=5
GET=1
INVALIDATE=0


echo "Running benchmarks..."

node $CWD/storage.js memory $TTL $ENTRIES $REFERENCES $GET $INVALIDATE

echo -e "\n-----\n"

node $CWD/storage.js redis  $TTL $ENTRIES $REFERENCES $GET $INVALIDATE

echo -e "\n-----\n"

REFERENCES=1
INVALIDATE=1

node $CWD/storage.js memory $TTL $ENTRIES $REFERENCES $GET $INVALIDATE

echo -e "\n-----\n"

node $CWD/storage.js redis  $TTL $ENTRIES $REFERENCES $GET $INVALIDATE
