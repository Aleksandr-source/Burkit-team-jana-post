#!/usr/bin/env python3
"""Compare measured candidates on identical fixtures. No model calls."""
import argparse
import re
from pathlib import Path
from evaluate import dump,read

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--runs",nargs="+",required=True,help="Run directories with run.json and summary/report.json")
    p.add_argument("--out",required=True); a=p.parse_args()
    results=[]; baseline=None
    for directory in a.runs:
        d=Path(directory); run=read(d/"run.json"); report=read(d/"summary/report.json")
        identity=(run.get("fixture_hash"),run.get("kb_hash"),run.get("mode"),run.get("concurrency"))
        if baseline is None: baseline=identity
        if identity!=baseline or not all(identity[:3]): raise ValueError("Different or unidentified fixture/KB/mode/concurrency: compare separately")
        meta=run.get("model_metadata") or {}; measured=meta.get("measured") or {}
        params=meta.get("total_loaded_parameters"); memory=measured.get("gpu_process_peak_gib")
        latency=report["overall"]["latency"]["p95_valid_s"]
        identity_complete=bool(re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}",str(meta.get("immutable_revision"))) and re.fullmatch(r"[0-9a-f]{64}",str(meta.get("artifact_sha256"))) and type(params) is int and params>0)
        resource_ok=type(memory) in (int,float) and 0<memory<=7
        eligible=report["status"]=="provisional_pass" and identity_complete and resource_ok and latency is not None
        results.append(dict(run=str(d),candidate=meta.get("candidate_id"),total_parameters=params,
            gpu_peak_gib=memory,p95_s=latency,mean_score=report["overall"]["mean_score"],
            weakest_slice_score=min((x["mean_score"] for x in report["slices"].values() if x["mean_score"] is not None),default=None),
            report_status=report["status"],eligible_on_fixture=eligible,metadata_complete=identity_complete))
    eligible=[x for x in results if x["eligible_on_fixture"]]
    eligible.sort(key=lambda x:(x["total_parameters"],x["gpu_peak_gib"],x["p95_s"],-x["weakest_slice_score"]))
    pareto=[]
    for x in eligible:
        def dominates(y):
            comparisons=[y["total_parameters"]<=x["total_parameters"],y["gpu_peak_gib"]<=x["gpu_peak_gib"],y["p95_s"]<=x["p95_s"],y["mean_score"]>=x["mean_score"]]
            strict=y["total_parameters"]<x["total_parameters"] or y["gpu_peak_gib"]<x["gpu_peak_gib"] or y["p95_s"]<x["p95_s"] or y["mean_score"]>x["mean_score"]
            return all(comparisons) and strict
        if not any(dominates(y) for y in eligible if y is not x): pareto.append(x["run"])
    dump(a.out,{"status":"smallest_observed_fixture_candidate" if eligible else "no_acceptable_candidate",
        "selected":eligible[0] if eligible else None,"pareto_runs":pareto,"runs":results,"production_release_eligible":False,
        "limitation":"Minimum only among measured candidates on this fictional regression suite; not universal or production qualification."})
    print(a.out)

if __name__=="__main__": main()
