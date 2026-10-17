#!/usr/bin/env python3
"""Build readable reference files, execute local checks and package a release."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import evaluate as e
import service_probes

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--spec",type=Path)
    p.add_argument("--archive",type=Path,required=True)
    args=p.parse_args()
    if args.archive.exists(): raise ValueError("Archive exists; choose a new release filename")
    cases=e.load_cases(); audit=e.validate()
    lines=["# Каталог тестов JanaMen, v1.0", "",
        "128 вымышленных тестовых случаев. 100 баллов требуют всех обязательных фактов, правильного решения, подтверждающих источников, языка и формата. Подробности — SCORING.md.", "",
        "Эталоны — авторские черновики для предметной и языковой проверки. Демо-числа и маршруты не являются правилами работодателя или законодательством.",""]
    for s,label in (("leave","Отпуск / Демалыс"),("advance","Аванс / Аванс")):
        lines += [f"## {label}",""]
        for c in cases:
            if c["scenario"]!=s: continue
            exp=c["expected"]
            lines += [f"### {c['case_id']} — {c['suite']}","",
                f"Раздел: `{c['split']}`. Группа: `{c['family_id']}`. Роль: `{c['actor']}`. Дата: `{c['as_of_date']}`. Критический: {'да' if c['critical'] else 'нет'}.","",
                f"**Вопрос:** {c['question']}","",f"**Эталон:** {exp['answer']}","",
                f"**Решение:** `{exp['decision']}`. **Источники эталона:** {', '.join(exp['evidence_ids']) or 'нет' }.","",
                f"Контекст oracle: {', '.join(c['evidence_ids']) or 'пустой'}. Пул до фильтрации: {', '.join(c['candidate_pool_ids']) or 'пустой'}.","",
                "Обязательные факты (всего 40 баллов):",""]
            lines += [f"- **{f['points']}** — {f['text']}" for f in exp["required_facts"]]
            lines += [""]
    (ROOT/"docs/CASEBOOK.md").write_text("\n".join(lines),encoding="utf-8")
    # Only context conditions may be installed in the service, never gold answer data.
    e.jsonl(ROOT/"data/service-snapshots.jsonl",[
        {"case_id":c["case_id"],"as_of_date":c["as_of_date"],"candidate_pool_ids":c["candidate_pool_ids"]} for c in cases])
    e.dump(ROOT/"configs/service-probes.json",{"source":"service_probes.py definitions()","read_only_probes":service_probes.definitions(),"additional_business_state_checks":4,"total":41})
    kb={k["knowledge_id"]:k for k in e.rows(ROOT/"data/knowledge.jsonl")}
    c=cases[0]; request,mapping=e.request_for(c,"oracle",kb,e.read(ROOT/"configs/actors.json"))
    e.dump(ROOT/"examples/oracle-request.json",request)
    inverse={v:k for k,v in mapping.items()}
    e.dump(ROOT/"examples/oracle-response.json",{
        "decision":c["expected"]["decision"],"answer":c["expected"]["answer"],"evidence_ids":[inverse[i] for i in c["expected"]["evidence_ids"]]})
    audit.update(schema_version="1.0",prepared_date="2026-10-17",counts_by_slice=dict(Counter(f"{c['scenario']}.{c['language']}" for c in cases)),
        counts_by_split=dict(Counter(c["split"] for c in cases)),counts_by_suite=dict(Counter(c["suite"] for c in cases)),
        normative_source_status="supplied_engineering_spec_only_original_customer_docx_unavailable",
        model_status="not_run",gpu_status="not_run",external_teacher_requests=0,
        service_probes_status="definitions_only_no_project_endpoint_available")
    if args.spec:
        audit["supplied_spec"]={"name":args.spec.name,"sha256":hashlib.sha256(args.spec.read_bytes()).hexdigest()}
    trace={
        "C07_C12":{"meaning":"KB-only answer, sources, correct no-answer behavior","covered_by":"supported, missing, evidence_removed, irrelevant_evidence, conflict, revoked","status":"fixture_cases_ready_product_not_run"},
        "C02_C10_C13":{"meaning":"roles, object/team access, real backend boundary","covered_by":"unauthorized, authorized, service_probes, context traces","status":"fixture_cases_ready_real_auth_not_run"},
        "C04":{"meaning":"application scenario, status and history","covered_by":"both leave and advance cases 01–07, 20–21","status":"demo_workflows_only_actual_workflow_unknown"},
        "C09":{"meaning":"official personnel data are read-only","covered_by":"common.scope and business-state hash contract","status":"partial_fixture_coverage_real_personnel_write_paths_require_app_review"},
        "C14":{"meaning":"help agrees with platform capabilities","covered_by":"notifications, multi_hop, payment_or_balance","status":"requires_L4_review_against_current_UI"},
        "O01":{"meaning":"RU and KK generation","covered_by":"32 cases per scenario/language, cross_language and noise","status":"authored_not_native_reviewed"},
        "O02_O03":{"meaning":"small baseline versus SFT and final serving artifact","covered_by":"experiment-plan.json and model-metadata.template.json","status":"planned_no_models_measured"},
        "user_current_request":{"meaning":"independent tests of BOTH leave and advance with 0–100 score and performance analysis","covered_by":"128 cases, scoring, HTTP runner, reports, comparison","status":"implemented_locally_verified"}}
    e.dump(ROOT/"docs/requirements-traceability.json",{"authority":"Digest from supplied specification, not independently checked customer DOCX","requirements":trace})
    commands=[[sys.executable,"-m","unittest","discover","-s","tests","-v"],
              [sys.executable,"evaluate.py","validate"]]
    checks=[]
    for i,cmd in enumerate(commands,1):
        result=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True)
        (ROOT/f"reports/check-{i}.log").write_text(result.stdout+result.stderr,encoding="utf-8")
        checks.append({"command":cmd,"exit_code":result.returncode,"output":f"reports/check-{i}.log"})
        if result.returncode: raise RuntimeError(f"Check failed: {cmd}")
    audit.update(checks=checks,python=platform.python_version(),dependency_policy="Python standard library only",verification_status="passed")
    e.dump(ROOT/"reports/validation.json",audit)
    e.dump(ROOT/"data/dataset-card.json",{k:v for k,v in audit.items() if k not in {"checks","python"}})
    # Recreate no model results: calibration stays separately labelled and contains null timings.
    calibration=ROOT/"reports/release-calibration"
    if not calibration.exists():
        result=subprocess.run([sys.executable,"evaluate.py","self-test","--out",str(calibration)],cwd=ROOT,capture_output=True,text=True)
        if result.returncode: raise RuntimeError(result.stdout+result.stderr)
        result=subprocess.run([sys.executable,"evaluate.py","score","--results",str(calibration/"results.jsonl"),"--reviews",str(calibration/"reviews.jsonl"),"--out",str(calibration/"summary")],cwd=ROOT,capture_output=True,text=True)
        if result.returncode: raise RuntimeError(result.stdout+result.stderr)
    def include(path):
        rel=path.relative_to(ROOT)
        return path.is_file() and "__pycache__" not in rel.parts and path.suffix!=".pyc" and rel.as_posix()!="manifest.json" and not rel.as_posix().startswith("reports/scorer-calibration/")
    files=sorted(p for p in ROOT.rglob("*") if include(p))
    manifest={"version":"1.0.0","prepared_date":"2026-10-17","model_quality":"NOT_EVALUATED",
              "sha256":{p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    e.dump(ROOT/"manifest.json",manifest)
    args.archive.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(args.archive,"w",zipfile.ZIP_DEFLATED) as z:
        for p in files+[ROOT/"manifest.json"]: z.write(p,Path("janamen-eval")/p.relative_to(ROOT))
    print(json.dumps({"archive":str(args.archive),"sha256":hashlib.sha256(args.archive.read_bytes()).hexdigest(),"files":len(files)+1,"status":"checks_passed_model_not_evaluated"},ensure_ascii=False,indent=2))

if __name__=="__main__": main()
