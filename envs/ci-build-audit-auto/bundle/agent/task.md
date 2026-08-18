# CI Build Audit

The data for this task is not available as a file. It lives in **Meridian**,
running at **http://localhost:5273**. Work through the interface to obtain it.

Report:

1. `total_failed_duration_sec` — the sum of `duration_sec` across all builds where
   `branch == "main"` and `status == "failed"`.
2. `longest_failure_commit_sha` — the full `commit_sha` of the single longest-running
   build among that same set.

Write the answer to `answer.json` as:

```json
{"total_failed_duration_sec": <int>, "longest_failure_commit_sha": "<40-char sha>"}
```
