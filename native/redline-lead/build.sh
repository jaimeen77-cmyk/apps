#!/bin/sh
# Builds redline-someip for the head unit: Ubuntu 18.04 (gcc 7.5, glibc 2.27, the userland the unit's libvsomeip3
# 3.1.34 was built against), linked against a stub of the unit's libvsomeip3 and checked against its ABI. Needs docker
# and idrive-apps' native/cluster-render (its vsomeip headers, symbol list and abi.py) at $CR.
set -e
CR=${CR:-../../../idrive-apps/native/cluster-render}
HERE=$(cd "$(dirname "$0")" && pwd); CR=$(cd "$CR" && pwd); OUT=$(mktemp -d)
docker build -q -t mgu-build:18.04 - <<'DOCKER'
FROM ubuntu:18.04
RUN apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends g++ make binutils python3 python3-pyelftools >/dev/null && rm -rf /var/lib/apt/lists/*
DOCKER
docker run --rm -v "$HERE":/src -v "$CR":/cr:ro -v "$OUT":/out mgu-build:18.04 sh -c '
set -e; cd /out
python3 /cr/dcsm/tools/abi.py stub /cr/dcsm/abi/libvsomeip3.so.3.symbols vsomeip_stub.S
g++ -shared -nostdlib -Wl,-soname,libvsomeip3.so.3 -o libvsomeip3.so.3 vsomeip_stub.S
g++ -std=c++14 -O2 -Wall -Wextra -Werror -pthread -isystem /cr/dcsm/third_party/vsomeip/interface \
    -Wl,--dynamic-linker=/lib/ld-linux-x86-64.so.2 -o redline-someip /src/src/redline-someip.cpp ./libvsomeip3.so.3
strip redline-someip
python3 /cr/dcsm/tools/abi.py check redline-someip /cr/dcsm/abi/libvsomeip3.so.3.symbols'
cp "$OUT/redline-someip" "$HERE/redline-someip"; rm -rf "$OUT"; echo "built $HERE/redline-someip"
