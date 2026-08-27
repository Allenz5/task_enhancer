#!/bin/bash
cd /Users/allenzhang/Desktop/workspace/task_enhancer/cluster
while pgrep -f "runfull.py A" > /dev/null; do sleep 20; done
python3 runfull.py B > passB.log 2>&1
python3 mkthird.py > third.log 2>&1
if [ -s third_batches.txt ]; then
  python3 runfull.py C third_batches.txt > passC.log 2>&1
fi
echo DONE > chain.done
