#!/bin/sh -eux

if id -u \
| grep '^0$'
then
  echo "Hello, World!"
else
  echo "You aren't root. :("
  exit 5
fi
