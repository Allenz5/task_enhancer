#!/bin/bash
cd /Users/allenzhang/Desktop/workspace/task_enhancer/cluster/v2
for i in 1 2 3; do
  python3 runfull.py C third_batches.txt >> passC.log 2>&1
  n=$(ls fullC | wc -l); need=$(wc -l < third_batches.txt)
  echo "attempt $i: $n/$need" >> passC.log
  [ "$n" -ge "$need" ] && break
  sleep 120
done
echo DONE > chainC.done
