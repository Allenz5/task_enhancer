# -*- coding: utf-8 -*-
"""骨架自带的占位数据。字段名全部照 LabKey 的真实 domain（见 reference/capture.md），
   第二层灌任务数据时只替换 data/*.json，不动字段名。"""
import json, random, datetime
random.seed(1783)

TECHS = ["Rae T", "Ivo N", "Lior P", "Nadia S"]
INCUB = ["INC-001", "INC-002", "INC-003"]
QC = ["Reviewed - Passed", "Reviewed - Rejected", "Not Yet Reviewed"]
MEDIA = ["control", "MediaX", "MediaY"]
SAMPLES = ["109", "217", "334"]

batches = [
  {"RowId": 501, "Name": "CellCulture-Batch-2019Q3", "Hypothesis": "MediaY sustains growth past day 7",
   "Contact": "Rae T", "Comments": "Initial media comparison, three groups.",
   "Created": "2019-08-06 16:20:11", "CreatedBy": "raet", "RunCount": 3},
  {"RowId": 502, "Name": "CellCulture-Batch-2023Q2", "Hypothesis": "Reproduce 2019 result on new incubator",
   "Contact": "Lior P", "Comments": "Re-run after INC-001 recalibration.",
   "Created": "2023-04-26 15:40:02", "CreatedBy": "raet", "RunCount": 2},
]

runs = [
  {"RowId": 1605, "Name": "CellCulture-Group2", "Batch": 501, "cellCultureUser": "Rae T",
   "incubatorName": "INC-002", "QCFlags": "Reviewed - Passed", "Flag": "",
   "Created": "2019-08-06 16:32:57", "CreatedBy": "raet",
   "Comments": "Nominal run.", "ReplacesRun": None, "ReplacedByRun": None,
   "DataFile": "CellCulture_run2.xlsx"},
  {"RowId": 1606, "Name": "CellCulture-Group3", "Batch": 501, "cellCultureUser": "Rae T",
   "incubatorName": "INC-002", "QCFlags": "Reviewed - Passed", "Flag": "",
   "Created": "2019-08-06 16:33:17", "CreatedBy": "raet",
   "Comments": "Nominal run.", "ReplacesRun": None, "ReplacedByRun": None,
   "DataFile": "CellCulture_run3.xlsx"},
  {"RowId": 1608, "Name": "CellCulture-Group4", "Batch": 501, "cellCultureUser": "Ivo N",
   "incubatorName": "INC-001", "QCFlags": "Reviewed - Rejected", "Flag": "cells died in all media",
   "Created": "2019-08-07 15:08:17", "CreatedBy": "raet",
   "Comments": "Cell death observed in control as well; unrelated to media under test. Excluded.",
   "ReplacesRun": None, "ReplacedByRun": 43950, "DataFile": "CellCulture_run4.xlsx"},
  {"RowId": 43950, "Name": "CellCulture-Group1", "Batch": 502, "cellCultureUser": "Rae T",
   "incubatorName": "INC-001", "QCFlags": "Not Yet Reviewed", "Flag": "",
   "Created": "2023-04-26 15:48:17", "CreatedBy": "raet",
   "Comments": "Repeat of Group 4 after incubator service.",
   "ReplacesRun": 1608, "ReplacedByRun": None, "DataFile": "CellCulture_run1.xlsx"},
  {"RowId": 43951, "Name": "Data_2023-04-26_15-45-06-1.xlsx", "Batch": 502, "cellCultureUser": "Rae T",
   "incubatorName": "INC-001", "QCFlags": "Not Yet Reviewed", "Flag": "",
   "Created": "2023-04-26 16:15:02", "CreatedBy": "raet",
   "Comments": "Direct file import, assay id defaulted to filename.",
   "ReplacesRun": None, "ReplacedByRun": None, "DataFile": "Data_2023-04-26_15-45-06-1.xlsx"},
]

def curve(media, day, dead=False):
    if dead:
        return max(0, int(round(2 * max(0.0, 1 - day / 5.0) + random.gauss(0, .3))))
    if media == "control":
        base = 1 + 0.15 * day
    elif media == "MediaX":
        base = 1 + 3.0 * day * pow(2.718, -((day - 7) ** 2) / 12.0)
    else:
        base = 1 + 0.9 * pow(1.32, day)
    return max(0, int(round(base + random.gauss(0, base * .08))))

results = []
for r in runs:
    dead = r["QCFlags"] == "Reviewed - Rejected"
    start = datetime.date.fromisoformat(r["Created"][:10]) - datetime.timedelta(days=14)
    for s in SAMPLES:
        for m in MEDIA:
            for day in range(1, 15):
                excluded = dead
                results.append({
                    "ParticipantID": s,
                    "Date": (start + datetime.timedelta(days=day - 1)).isoformat(),
                    "Day": day,
                    "cellCount": curve(m, day, dead),
                    "media": m,
                    "Run": r["RowId"],
                    "FlaggedAsExcluded": excluded,
                    "ExclusionComment": "Run failed QC review — cell death in control" if excluded else "",
                })

json.dump({"rows": batches}, open("data/batches.json", "w"), ensure_ascii=False, indent=1)
json.dump({"rows": runs}, open("data/runs.json", "w"), ensure_ascii=False, indent=1)
json.dump({"rows": results}, open("data/results.json", "w"), ensure_ascii=False, indent=1)
json.dump({"assayName": "Cell Culture",
           "description": "Cultures different participant cells for 14 days in different media",
           "folder": "Assay Data Analysis",
           "files": ["assaydata/", "Assays/", "CellCulture_run1.xlsx", "CellCulture_run2.xlsx",
                     "CellCulture_run3.xlsx", "CellCulture_run4.xlsx",
                     "Data_2023-04-26_15-45-06-1.xlsx"]},
          open("data/assay.json", "w"), ensure_ascii=False, indent=1)
print("batches", len(batches), "runs", len(runs), "results", len(results))
