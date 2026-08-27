#!/bin/bash
cd /Users/allenzhang/Desktop/workspace/task_enhancer/cluster/final
for p in A B; do
  for i in 1 2 3; do
    python3 run.py $p >> pass$p.log 2>&1
    [ "$(ls r$p 2>/dev/null|wc -l)" -ge 85 ] && break
    sleep 90
  done
done
python3 third.py > third.log 2>&1
if [ -s third_batches.txt ]; then
  for i in 1 2 3; do
    python3 run.py C third_batches.txt >> passC.log 2>&1
    [ "$(ls rC 2>/dev/null|wc -l)" -ge "$(wc -l < third_batches.txt)" ] && break
    sleep 90
  done
fi
echo DONE > chain.done
