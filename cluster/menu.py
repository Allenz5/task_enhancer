"""菜单 = G2 2239 品类 + 垂直补充。
v2 修订：删掉与 G2 撞车的补充项，给易混项加显式辨析。"""
import json

SUPPLEMENT = {
    "x-motion-capture-biomechanics-lab": "Motion Capture / Biomechanics Lab Software — 动捕采集与肌骨建模工作流 (OpenSim, Vicon Nexus, Qualisys QTM, Visual3D, OpenCap)；注意与 sports-performance-analytics（面向教练的运动表现分析）区分",
    "x-materials-property-database":     "Materials Property Database — 材料结构与性质检索库 (Materials Project, AFLOW, OQMD, NOMAD)",
    "x-atomistic-simulation-package":    "Atomistic / Molecular Simulation Package — 分子动力学与第一性原理计算 (LAMMPS, VASP, GROMACS, Quantum ESPRESSO)",
    "x-test-bench-daq":                  "Test Bench / Data Acquisition Software — 台架试验的多通道采集与回放 (NI DIAdem, NI LabVIEW, Dewesoft X, HBM catman)；注意与 SCADA（在线生产监控）区分",
    "x-process-historian":               "Process Historian — 工厂时序位号历史库与趋势查询 (AVEVA PI System, Ignition Historian, WinCC)；注意与 supervisory-control-and-data-acquisition-scada（实时监控 HMI）区分",
    "x-hpc-job-scheduler":               "HPC Cluster / Job Scheduler Portal — 作业提交队列与算例日志 (Slurm, PBS, OpenOnDemand)",
    "x-ml-experiment-tracking":          "ML Experiment Tracking / Model Registry — 逐 run 指标对比与模型版本 (MLflow, Weights & Biases, Neptune)；注意与 mlops-platforms（部署运维平台）区分",
    "x-research-dataset-repository":     "Research Dataset Repository — 公开数据集下载页与元数据 (UCI ML Repository, Zenodo, figshare, Kaggle Datasets)",
    "x-genomics-data-repository":        "Genomics / Bioinformatics Data Repository — 组学数据集与样本注释 (NCBI GEO, ENA, Ensembl, TCGA)",
    "x-seismic-waveform-data-center":    "Seismic Waveform Data Center — 台站波形与事件目录检索 (IRIS/FDSN, SeisComP; .mseed)",
    "x-seismic-processing-workstation":  "Seismic Interpretation / Processing Workstation — 道集处理与解释 (Petrel, OpendTect, SeisSpace, Kingdom)",
    "x-government-statistics-portal":    "Government Statistics / Open Data Portal — 官方统计与开放数据查询 (EPA GHGRP, Eurostat, 国家统计局)",
    "x-regulatory-registry":             "Regulatory Registry / Compliance Filing Database — 备案与合规申报检索库 (ECHA, FDA, 住建部/药监局备案平台)",
    "x-game-liveops-console":            "Game Engine Editor / LiveOps Admin Console — 游戏内容编辑器或运营后台 (Unity Editor, Unreal, 游戏数值/活动后台)",
}
# 已删除（与 G2 撞车）：
#   x-eda-design-verification  → 用 G2 的 pcb-design
#   x-code-review-workbench    → 用 G2 的 version-control-hosting / version-control-software
