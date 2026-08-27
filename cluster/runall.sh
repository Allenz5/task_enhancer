#!/bin/bash
cd "$(dirname "$0")"
run() {
  b="$1"; n="$(basename "$b" .txt)"; o="out/$n.json"
  [ -s "$o" ] && return 0
  for i in 1 2 3; do
    cat "$b" | claude -p --model sonnet > "$o" 2> "out/$n.err"
    [ -s "$o" ] && { echo "ok $n try$i"; return 0; }
    sleep $((i*5))
  done
  echo "FAIL $n" >> out/failures.log
}
export -f run
ls batches/*.txt | xargs -P 4 -I{} bash -c 'run "$@"' _ {}
echo DONE > out/.done
