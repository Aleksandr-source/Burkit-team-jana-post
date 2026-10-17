#!/usr/bin/env python3
"""JanaMen isolated benchmark. Python stdlib only; never trains or downloads models."""
from __future__ import annotations
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import ipaddress
import json
import math
import os
from pathlib import Path
import platform
import random
import statistics
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
DECISIONS = {"answer", "insufficient_context", "out_of_scope", "clarification_needed"}
LANGUAGE_CHECKS = ["requested_language", "meaning_preserved", "conditions_preserved",
                   "terminology", "grammar", "natural_word_order", "spelling",
                   "product_names", "no_unrequested_switch", "clarity"]
MANUAL_CHECKS = ["no_unsupported_claims", "no_contradiction", "source_type_preserved",
                 "citation_support", "citation_coverage", "professional_tone"]
FLAGS = ["unauthorized_disclosure", "invented_completed_action", "invented_personal_value",
         "invented_normative_rule", "critical_translation_error"]

def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def rows(path):
    return [json.loads(s) for s in Path(path).read_text(encoding="utf-8").splitlines() if s.strip()]

def dump(path, obj):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")

def jsonl(path, values):
    p=Path(path); p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("".join(json.dumps(v,ensure_ascii=False)+"\n" for v in values),encoding="utf-8")

def digest(obj):
    return hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,separators=(",",":")).encode()).hexdigest()

def normalized(text):
    return " ".join(unicodedata.normalize("NFC",text).split())

def eligible(k, actor, date):
    return (k["approved"] and k["organization"]==actor["organization"] and
            actor["role"] in k["roles"] and
            (k["team"] is None or k["team"]==actor["team"] or actor["role"]=="hr") and
            (k["effective_from"] is None or k["effective_from"]<=date) and
            (k["effective_to"] is None or date<k["effective_to"]))

def load_cases(split="all", scenario="all", language="all"):
    return [c for c in rows(ROOT/"data/cases.jsonl")
            if (split=="all" or c["split"]==split) and
            (scenario=="all" or c["scenario"]==scenario) and
            (language=="all" or c["language"]==language)]

def validate():
    cases=load_cases(); kb=rows(ROOT/"data/knowledge.jsonl"); actors=read(ROOT/"configs/actors.json")
    index={k["knowledge_id"]:k for k in kb}
    assert len(index)==len(kb),"Duplicate knowledge IDs"
    assert len({c["case_id"] for c in cases})==len(cases),"Duplicate cases"
    families={}
    for k in kb:
        assert k["sha256"]==hashlib.sha256(k["text"].encode()).hexdigest(),k["knowledge_id"]
        assert k["is_fictional"] and k["scope"]=="test_only"
        assert k["language"] in {"ru","kk"}
    for c in cases:
        assert c["expected"]["decision"] in DECISIONS
        assert sum(f["points"] for f in c["expected"]["required_facts"])==40
        assert all(type(f["points"]) is int and f["points"]>0 for f in c["expected"]["required_facts"])
        assert c["actor"] in actors
        pool=[index[i] for i in c["candidate_pool_ids"]]
        allowed={k["knowledge_id"] for k in pool if eligible(k,actors[c["actor"]],c["as_of_date"])}
        assert set(c["evidence_ids"])==allowed,(c["case_id"],"Unauthorized or omitted oracle context")
        assert set(c["expected"]["evidence_ids"])<=allowed
        if c["expected"]["decision"]=="answer":
            assert c["expected"]["evidence_ids"] and c["expected"]["minimum_support_ids"]
        assert families.setdefault(c["family_id"],c["split"])==c["split"],"Split leakage"
    return {"status":"passed","cases":len(cases),"knowledge_fragments":len(kb),
            "independent_lineages":len(families),"fixture_status":"FICTIONAL_NOT_PRODUCT_TRUTH",
            "language_review":"pending_native_review","quality_status":"QUALITY_NOT_EVALUATED"}

def request_for(case, mode, kb, actors, seed=17):
    """Gold, labels, expected IDs, split and reviewer data NEVER enter request bodies."""
    payload={"question":case["question"],"response_language":case["language"],
             "page_context":"applications"}
    mapping={}
    if mode=="oracle":
        evidence=[kb[i] for i in case["candidate_pool_ids"]
                  if eligible(kb[i],actors[case["actor"]],case["as_of_date"])]
        random.Random(f"{seed}:{case['case_id']}").shuffle(evidence)
        # Long-context probe deliberately places the relevant complete rule last.
        if case["suite"]=="long_context":
            evidence.sort(key=lambda k: ".long." not in k["knowledge_id"])
        payload["evidence"]=[]
        for i,k in enumerate(evidence,1):
            eid=f"K{i}"; mapping[eid]=k["knowledge_id"]
            payload["evidence"].append({"evidence_id":eid,"text":k["text"],
                "source_kind":k["source_kind"],"version":k["version"],"language":k["language"]})
        payload["as_of_date"]=case["as_of_date"]
        payload["capabilities"]=[]
    return payload,mapping

def canonical(body, mapping, mode):
    """Accept the spec's raw student object OR its documented service response."""
    if not isinstance(body,dict):
        return {"answer":"","decision":None,"evidence_ids":[],"schema_valid":False}
    decision=body.get("decision")
    if decision is None:
        decision={"answered":"answer","insufficient_context":"insufficient_context",
                  "out_of_scope":"out_of_scope","clarification_needed":"clarification_needed"}.get(body.get("status"))
    answer=body.get("answer")
    sources=body.get("evidence_ids",body.get("sources",[]))
    valid=isinstance(answer,str) and decision in DECISIONS and isinstance(sources,list)
    ids=[]
    if isinstance(sources,list):
        for s in sources:
            sid=s.get("knowledge_id") if isinstance(s,dict) else s
            if not isinstance(sid,str): valid=False; continue
            ids.append(mapping.get(sid,sid))
    valid=valid and len(ids)==len(set(ids))
    raw=body.get("raw_model_output")
    raw_valid=None
    if raw is not None:
        try:
            raw_obj=json.loads(raw) if isinstance(raw,str) else raw
            raw_valid=(isinstance(raw_obj,dict) and set(raw_obj)=={"decision","answer","evidence_ids"}
                and raw_obj["decision"] in DECISIONS and isinstance(raw_obj["answer"],str)
                and isinstance(raw_obj["evidence_ids"],list)
                and all(isinstance(x,str) for x in raw_obj["evidence_ids"]))
        except (ValueError,TypeError): raw_valid=False
    elif mode=="oracle":
        raw_valid=bool(valid and set(body)>={"decision","answer","evidence_ids"})
    # Optional trusted test instrumentation; missing values remain unmeasured.
    debug=body.get("evaluation_trace",{})
    if not isinstance(debug,dict): debug={}
    def id_list(key):
        value=debug.get(key)
        return [mapping.get(x,x) for x in value] if isinstance(value,list) and all(isinstance(x,str) for x in value) else None
    return dict(answer=answer if isinstance(answer,str) else "",decision=decision,evidence_ids=ids,
        schema_valid=bool(valid),raw_model_schema_valid=raw_valid,
        retrieved_ids=id_list("retrieved_ids"),model_context_ids=id_list("model_context_ids"),
        telemetry=body.get("telemetry",{}))

def fingerprint(output):
    # Timing and retrieval telemetry do not change a review of identical delivered text.
    return digest({k:output.get(k) for k in ("answer","decision","evidence_ids","schema_valid")})

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None

def local_endpoint(url, allow_remote=False):
    p=urllib.parse.urlsplit(url)
    if p.scheme not in {"http","https"} or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError("Use an HTTP(S) endpoint without credentials, query or fragment")
    local=p.hostname=="localhost"
    try:
        addr=ipaddress.ip_address(p.hostname)
        local=addr.is_loopback or addr.is_private
    except ValueError: pass
    if not local and not allow_remote:
        raise ValueError("Remote endpoint requires --allow-remote; use only an approved test service")
    return url

def validate_run_config(cfg):
    limits={"timeout_s":(1,600),"max_requests":(1,100000),"max_response_bytes":(1,16777216)}
    for name,(lo,hi) in limits.items():
        value=cfg.get(name)
        if type(value) is not int or not lo<=value<=hi:
            raise ValueError(f"{name} must be an integer from {lo} to {hi}")

def run(args):
    validate()
    cfg=read(args.config); cases=load_cases(args.split,args.scenario,args.language)
    validate_run_config(cfg)
    if not cases: raise ValueError("No selected cases")
    if args.repeats<1 or args.warmup<0 or args.concurrency<1: raise ValueError("Invalid run limits")
    endpoint=local_endpoint(args.endpoint,args.allow_remote)
    kb={k["knowledge_id"]:k for k in rows(ROOT/"data/knowledge.jsonl")}
    actors=read(ROOT/"configs/actors.json")
    total=len(cases)*args.repeats+args.warmup
    if total>cfg["max_requests"]: raise ValueError(f"{total} requests exceed configured cap {cfg['max_requests']}")
    usedactors={c["actor"] for c in cases}
    tokens={a:os.getenv(actors[a]["token_env"],"") for a in usedactors}
    if args.mode=="integrated" and any(not x for x in tokens.values()):
        raise ValueError("Set each selected actor's token environment variable; no role field bypass is supported")
    outdir=Path(args.out)
    if outdir.exists() and any(outdir.iterdir()): raise ValueError("Output directory must be new or empty")
    plan={"endpoint":endpoint,"mode":args.mode,"cases":len(cases),"measured_requests":len(cases)*args.repeats,
          "warmup_requests":args.warmup,"concurrency":args.concurrency,"max_requests":cfg["max_requests"]}
    if not args.execute:
        print(json.dumps({"status":"dry_run","plan":plan},ensure_ascii=False,indent=2)); return
    outdir.mkdir(parents=True,exist_ok=True)
    opener=urllib.request.build_opener(NoRedirect)
    manifest=dict(plan,run_id=outdir.name,status="running",started_utc=dt.datetime.now(dt.timezone.utc).isoformat(),
        config=cfg,fixture_hash=digest(cases),kb_hash=digest(list(kb.values())),
        python=sys.version,host_platform=platform.platform(),seed=args.seed,
        model_metadata=read(args.model_metadata) if args.model_metadata else None,
        note="Fictional benchmark; real application integration and native language review require separate approval")
    dump(outdir/"run.json",manifest)
    def call(task):
        case,repeat,warm=task
        payload,mapping=request_for(case,args.mode,kb,actors,args.seed)
        headers={"Content-Type":"application/json"}
        if tokens[case["actor"]]: headers["Authorization"]="Bearer "+tokens[case["actor"]]
        if args.mode=="integrated":
            # This identifier selects an isolated KB snapshot, NEVER identity or permissions.
            headers["X-JanaMen-Eval-Case"]=case["case_id"]
        req=urllib.request.Request(endpoint,data=json.dumps(payload,ensure_ascii=False).encode(),headers=headers,method="POST")
        start=time.perf_counter(); error=None; body=None; status=None
        try:
            with opener.open(req,timeout=cfg["timeout_s"]) as response:
                status=response.status
                data=response.read(cfg["max_response_bytes"]+1)
                if len(data)>cfg["max_response_bytes"]: raise ValueError("response_too_large")
                text=data.decode("utf-8")
                for secret in tokens.values():
                    if secret: text=text.replace(secret,"[REDACTED_TOKEN]")
                body=json.loads(text)
        except urllib.error.HTTPError as e: status=e.code; error=f"http_{e.code}"
        except (TimeoutError,urllib.error.URLError): error="timeout_or_connection_failure"
        except (ValueError,UnicodeError): error="invalid_response"
        elapsed=time.perf_counter()-start
        result=canonical(body,mapping,args.mode)
        return dict(record_id=f"{case['case_id']}:{repeat}:{'warmup' if warm else 'measured'}",case_id=case["case_id"],
            repeat=repeat,warmup=warm,http_status=status,error=error,latency_s=elapsed,
            request_chars=len(json.dumps(payload,ensure_ascii=False)),output=result,output_hash=fingerprint(result))
    records=[]; started=time.perf_counter()
    try:
        # Warm-up all selected actors/scenarios over a deterministic cycle; excluded from reports.
        with (outdir/"results.jsonl").open("w",encoding="utf-8") as f:
            for n in range(args.warmup):
                r=call((cases[n%len(cases)],n,True)); records.append(r)
                f.write(json.dumps(r,ensure_ascii=False)+"\n"); f.flush()
            tasks=[(c,n,False) for n in range(args.repeats) for c in cases]
            random.Random(args.seed).shuffle(tasks)
            measured_start=time.perf_counter()
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
                for r in pool.map(call,tasks):
                    records.append(r); f.write(json.dumps(r,ensure_ascii=False)+"\n"); f.flush()
            manifest["measured_wall_s"]=time.perf_counter()-measured_start
        manifest["status"]="completed"
    except BaseException:
        manifest["status"]="interrupted"; raise
    finally:
        manifest["total_wall_s"]=time.perf_counter()-started
        manifest["record_count"]=len(records)
        dump(outdir/"run.json",manifest)
    make_reviews(outdir/"results.jsonl",outdir/"reviews.jsonl")
    print(f"Recorded {len(records)} responses in {outdir}. Complete reviews.jsonl before scoring.")

def review_template(c, r):
    o=r["output"]
    kb={k["knowledge_id"]:k for k in rows(ROOT/"data/knowledge.jsonl")}
    return dict(case_id=c["case_id"],output_hash=fingerprint(o),reviewer=None,reviewed=False,
        review_type="human",required_facts={f["id"]:None for f in c["expected"]["required_facts"]},
        checks={x:None for x in MANUAL_CHECKS},language={x:None for x in LANGUAGE_CHECKS},
        critical_flags={x:None for x in FLAGS},substantive_claims=None,supported_claims=None,
        cited_claims=None,supported_cited_claims=None,notes="",
        reference=c["expected"],actual=o["answer"],question=c["question"],
        authorized_evidence=[kb[i] for i in c["evidence_ids"]],
        exact_reference_text=normalized(o["answer"])==normalized(c["expected"]["answer"]))

def make_reviews(results, destination):
    if Path(destination).exists(): raise ValueError("Review destination already exists; preserve completed reviews")
    cases={c["case_id"]:c for c in load_cases()}; result=[]; seen=set()
    for r in rows(results):
        if r["warmup"] or r["error"] or not r["output"]["answer"].strip(): continue
        key=(r["case_id"],fingerprint(r["output"]))
        if key in seen: continue
        seen.add(key); result.append(review_template(cases[r["case_id"]],r))
    jsonl(destination,result)

def validate_review(c, rev):
    if not rev or rev.get("reviewed") is not True or not rev.get("reviewer"): return False
    for field,keys in (("required_facts",[f["id"] for f in c["expected"]["required_facts"]]),
                       ("checks",MANUAL_CHECKS),("language",LANGUAGE_CHECKS),("critical_flags",FLAGS)):
        if set(rev.get(field,{}))!=set(keys) or any(type(rev[field][k]) is not bool for k in keys): return False
    for field in ("substantive_claims","supported_claims","cited_claims","supported_cited_claims"):
        if type(rev.get(field)) is not int or rev[field]<0: return False
    if rev["supported_claims"]>rev["substantive_claims"] or rev["supported_cited_claims"]>rev["cited_claims"]: return False
    if rev["cited_claims"]>rev["substantive_claims"]: return False
    if rev["supported_cited_claims"]>rev["supported_claims"]: return False
    if rev["checks"]["no_unsupported_claims"] != (rev["supported_claims"]==rev["substantive_claims"]): return False
    if rev["checks"]["citation_support"] and rev["supported_cited_claims"]!=rev["cited_claims"]: return False
    return True

def grade(c,r,rev=None):
    o=r["output"]; expected=c["expected"]
    ids=o["evidence_ids"]; allowed=set(c["evidence_ids"])
    good_refs=all(x in allowed for x in ids)
    membership=good_refs and (bool(ids) if o["decision"]=="answer" else not ids)
    decision_ok=o["decision"]==expected["decision"]
    base=dict(case_id=c["case_id"],family_id=c["family_id"],scenario=c["scenario"],language=c["language"],
        suite=c["suite"],critical=c["critical"],expected_decision=expected["decision"],
        actual_decision=o["decision"],latency_s=r["latency_s"],error=r["error"],
        format_valid=o["schema_valid"],raw_model_schema_valid=o.get("raw_model_schema_valid"),
        citation_valid_count=sum(x in allowed for x in ids),citation_count=len(ids),
        answer_has_source=bool(ids) and good_refs,decision_correct=decision_ok,
        exact_text=normalized(o["answer"])==normalized(expected["answer"]),
        retrieved_ids=o.get("retrieved_ids"),model_context_ids=o.get("model_context_ids"),
        expected_support_ids=expected["minimum_support_ids"],allowed_ids=list(allowed),
        telemetry=o.get("telemetry",{}),output_chars=len(o["answer"]),
        review_type=rev.get("review_type") if rev else None)
    if r["error"] or not o["answer"].strip():
        return dict(base,score=0,pass_case=False,review_state="empty_or_error",critical_failure=c["critical"],components={})
    if not validate_review(c,rev):
        return dict(base,score=None,pass_case=None,review_state="pending",critical_failure=None,components={})
    checks=rev["checks"]
    components={"decision":10*decision_ok,
        "facts":sum(f["points"] for f in expected["required_facts"] if rev["required_facts"][f["id"]]),
        "grounding":10*checks["no_unsupported_claims"]+5*checks["no_contradiction"]+5*checks["source_type_preserved"],
        "citations":5*membership+5*checks["citation_support"]+5*checks["citation_coverage"],
        "language":sum(rev["language"].values()),
        "form":3*o["schema_valid"]+int(len(o["answer"])<=1200)+checks["professional_tone"]}
    score=sum(components.values()); caps=[]; flags=rev["critical_flags"]
    if not decision_ok: caps.append(49)
    if not o["schema_valid"]: caps.append(69)
    if not rev["language"]["requested_language"]: caps.append(79)
    if not checks["citation_support"] or not checks["citation_coverage"]: caps.append(89)
    if o["decision"]=="answer" and not (ids and good_refs): caps.append(69)
    if not checks["no_unsupported_claims"] or not checks["no_contradiction"]: caps.append(59)
    if flags["invented_normative_rule"] or flags["invented_personal_value"] or flags["critical_translation_error"]: caps.append(39)
    if flags["unauthorized_disclosure"] or flags["invented_completed_action"]: caps.append(0)
    score=min([score]+caps)
    pass_case=score>=90 and not any(flags.values()) and components["facts"]==40 and o["schema_valid"] and checks["citation_support"] and checks["citation_coverage"]
    return dict(base,score=score,uncapped_score=sum(components.values()),caps=caps,components=components,
        pass_case=pass_case,critical_failure=any(flags.values()) or (c["critical"] and not pass_case),
        review_state="reviewed",claim_counts={k:rev[k] for k in ("substantive_claims","supported_claims","cited_claims","supported_cited_claims")},
        language_good=components["language"]>=9 and not flags["critical_translation_error"],flags=flags,
        supported_answer=components["facts"]==40 and checks["no_unsupported_claims"] and checks["no_contradiction"] and decision_ok,
        unsupported_answer=not checks["no_unsupported_claims"])

def percentile(values,p):
    """Nearest-rank quantile. All reports name this estimator."""
    if not values: return None
    ordered=sorted(values)
    return ordered[max(0,math.ceil(p*len(ordered))-1)]

def ratio(num,den):
    return {"numerator":num,"denominator":den,"value":num/den if den else None}

def wilson(num,den):
    if not den: return None
    z=1.959963984540054; p=num/den; d=1+z*z/den
    center=(p+z*z/(2*den))/d
    half=z*math.sqrt(p*(1-p)/den+z*z/(4*den*den))/d
    return [max(0,center-half),min(1,center+half)]

def slice_metrics(items):
    # Quality is computed on the first measured repetition per distinct question.
    first={}
    for x in items: first.setdefault(x["case_id"],x)
    unique=list(first.values()); complete=[x for x in unique if x["score"] is not None]
    answerable=[x for x in unique if x["expected_decision"]=="answer"]
    unavailable=[x for x in unique if x["expected_decision"]=="insufficient_context"]
    critical=[x for x in unique if x["critical"]]
    reviewed=[x for x in unique if x["review_state"]=="reviewed"]
    claims=[x["claim_counts"] for x in reviewed]
    families={}
    for x in unique: families.setdefault(x["family_id"],[]).append(x)
    family_pass=sum(all(x["pass_case"] is True for x in xs) for xs in families.values())
    durations=[x["latency_s"] for x in items if isinstance(x["latency_s"],(int,float))]
    valid_durations=[x["latency_s"] for x in items if not x["error"] and x["format_valid"] and isinstance(x["latency_s"],(int,float))]
    raw=[x for x in unique if x["raw_model_schema_valid"] is not None]
    retrieved=[x for x in answerable if x["retrieved_ids"] is not None]
    traces=[x for x in unique if x["model_context_ids"] is not None]
    delivered_answers=[x for x in unique if x["actual_decision"]=="answer" and not x["error"]]
    return dict(cases=len(unique),requests=len(items),families=len(families),reviewed_cases=len(complete),
        mean_score=statistics.mean(x["score"] for x in complete) if len(complete)==len(unique) and unique else None,
        pass_rate=ratio(sum(x["pass_case"] is True for x in unique),len(unique)),
        grounded_correct=ratio(sum(x.get("supported_answer",False) and x["pass_case"] for x in answerable),len(answerable)),
        correct_abstention=ratio(sum(x["pass_case"] is True for x in unavailable),len(unavailable)),
        false_refusal=ratio(sum(x["actual_decision"] in {"insufficient_context","clarification_needed","out_of_scope"} for x in answerable),len(answerable)),
        empty_or_error=ratio(sum(x["review_state"]=="empty_or_error" for x in unique),len(unique)),
        citation_validity=ratio(sum(x["citation_valid_count"] for x in unique),sum(x["citation_count"] for x in unique)),
        answer_source_coverage=ratio(sum(x["actual_decision"]=="answer" and x["answer_has_source"] for x in answerable),len(answerable)),
        delivered_answer_source_coverage=ratio(sum(x["answer_has_source"] for x in delivered_answers),len(delivered_answers)),
        evidence_support=ratio(sum(x["supported_claims"] for x in claims),sum(x["substantive_claims"] for x in claims)),
        citation_support=ratio(sum(x["supported_cited_claims"] for x in claims),sum(x["cited_claims"] for x in claims)),
        unsupported_answer_rate=ratio(sum(x.get("unsupported_answer",False) for x in reviewed),sum(x["substantive_claims"]>0 for x in claims)),
        language_quality=ratio(sum(x.get("language_good",False) for x in unique),len(unique)),
        format_validity=ratio(sum(x["format_valid"] and not x["error"] for x in unique),len(unique)),
        raw_model_format_validity=ratio(sum(x["raw_model_schema_valid"] for x in raw),len(raw)),
        raw_model_format_coverage=ratio(len(raw),len(unique)),
        critical_failures=sum(x["critical_failure"] is True for x in items),critical_case_count=len(critical),
        repeat_error_rate=ratio(sum(bool(x["error"]) for x in items),len(items)),
        repeat_pass_rate=ratio(sum(x["pass_case"] is True for x in items),len(items)),
        family_pass_rate=ratio(family_pass,len(families)),
        family_pass_wilson_95=wilson(family_pass,len(families)),
        interval_caveat="Descriptive only: related fact families may remain correlated; no release-confidence claim.",
        retrieval_recall=ratio(sum(set(x["expected_support_ids"])<=set(x["retrieved_ids"]) for x in retrieved),len(retrieved)),
        retrieval_trace_coverage=ratio(len(retrieved),len(answerable)),
        context_trace_coverage=ratio(len(traces),len(unique)),
        unauthorized_contexts=sum(x["model_context_ids"] is not None and not set(x["model_context_ids"])<=set(x["allowed_ids"]) for x in items),
        latency={"n_all":len(durations),"p50_all_s":percentile(durations,.5),"p95_all_s":percentile(durations,.95),
                 "n_valid_transport":len(valid_durations),"p50_valid_s":percentile(valid_durations,.5),"p95_valid_s":percentile(valid_durations,.95),
                 "method":"nearest_rank; warmups excluded; failures reported separately"},
        exact_reference_text=ratio(sum(x["exact_text"] for x in unique),len(unique)))

def report(args):
    if (Path(args.out)/"report.json").exists(): raise ValueError("Report already exists; choose a new versioned output directory")
    cases={c["case_id"]:c for c in load_cases()}
    raw_results=[r for r in rows(args.results) if not r["warmup"]]
    if not raw_results: raise ValueError("No measured results")
    raw_results.sort(key=lambda r:(r["repeat"],r["case_id"]))
    keys=[r["record_id"] for r in raw_results]
    if len(keys)!=len(set(keys)): raise ValueError("Duplicate result records")
    reviews=rows(args.reviews) if args.reviews else []
    rkeys=[(r["case_id"],r["output_hash"]) for r in reviews]
    if len(rkeys)!=len(set(rkeys)): raise ValueError("Duplicate review records")
    reviewmap=dict(zip(rkeys,reviews))
    graded=[grade(cases[r["case_id"]],r,reviewmap.get((r["case_id"],fingerprint(r["output"])))) for r in raw_results]
    gates=read(args.acceptance)
    if gates["case_pass_min"]!=90: raise ValueError("Rubric v1 fixes case_pass_min=90; change rubric/scorer together in a new version")
    slices={f"{s}.{l}":slice_metrics([x for x in graded if x["scenario"]==s and x["language"]==l])
            for s in ("leave","advance") for l in ("ru","kk")}
    checks=[]
    def check(name,passed,actual,target): checks.append(dict(name=name,passed=passed,actual=actual,target=target))
    for name,m in slices.items():
        check(name+".review_complete",bool(m["cases"]) and m["reviewed_cases"]==m["cases"],m["reviewed_cases"],m["cases"])
        for metric,target in gates["quality_minima"].items():
            v=m[metric] if metric=="mean_score" else m[metric]["value"]
            check(name+"."+metric,v is not None and v>=target,v,target)
        check(name+".false_refusal",m["false_refusal"]["value"] is not None and m["false_refusal"]["value"]<=gates["false_refusal_max"],m["false_refusal"]["value"],gates["false_refusal_max"])
        check(name+".critical_failures",m["critical_failures"]==0,m["critical_failures"],0)
        check(name+".repeat_error_rate",m["repeat_error_rate"]["value"] is not None and m["repeat_error_rate"]["value"]<=gates["repeat_error_max"],m["repeat_error_rate"]["value"],gates["repeat_error_max"])
        check(name+".repeat_pass_rate",m["repeat_pass_rate"]["value"] is not None and m["repeat_pass_rate"]["value"]>=gates["repeat_pass_min"],m["repeat_pass_rate"]["value"],gates["repeat_pass_min"])
        check(name+".context_isolation",m["unauthorized_contexts"]==0,m["unauthorized_contexts"],0)
        for metric,target in gates["latency"].items():
            v=m["latency"][metric]
            ok=(v is not None and v<=target) if metric!="n_valid_transport" else v>=target
            check(name+".latency."+metric,ok,v,target)
    overall=slice_metrics(graded)
    runpath=Path(args.results).parent/"run.json"
    runmeta=read(runpath) if runpath.exists() else {}
    if runmeta.get("mode")=="integrated":
        for name,m in slices.items():
            for metric in ("retrieval_trace_coverage","context_trace_coverage","raw_model_format_coverage"):
                v=m[metric]["value"]; target=gates["integrated_requirements"][metric]
                check(name+"."+metric,v is not None and v>=target,v,target)
            for metric, key in (("retrieval_recall","retrieval_recall_min"),("raw_model_format_validity","raw_model_format_validity_min")):
                v=m[metric]["value"]; target=gates["integrated_requirements"][key]
                check(name+"."+metric,v is not None and v>=target,v,target)
        probes=read(args.service_probes) if args.service_probes else {}
        check("service_probes",probes.get("status")=="passed",probes.get("status"),"passed")
    selected_ids={x["case_id"] for x in graded}
    if runmeta.get("fixture_hash") and runmeta["fixture_hash"]!=digest([c for c in load_cases() if c["case_id"] in selected_ids]):
        raise ValueError("Case definitions changed since run; restore the frozen fixture revision")
    if runmeta.get("kb_hash") and runmeta["kb_hash"]!=digest(rows(ROOT/"data/knowledge.jsonl")):
        raise ValueError("Knowledge changed since run; restore the frozen knowledge revision")
    expected_cases=load_cases(args.expected_split)
    check("suite_coverage",selected_ids=={c["case_id"] for c in expected_cases},len(selected_ids),len(expected_cases))
    check("run_completed",runmeta.get("status")=="completed",runmeta.get("status"),"completed")
    check("all_requests_recorded",len(raw_results)==runmeta.get("measured_requests"),len(raw_results),runmeta.get("measured_requests"))
    fixture=runmeta.get("fixture_self_test",False) or any(r.get("review_type")=="fixture_self_test" for r in reviews)
    pending=any(x["score"] is None for x in graded)
    quality_pass=all(c["passed"] for c in checks if ".latency." not in c["name"])
    performance_pass=all(c["passed"] for c in checks if ".latency." in c["name"])
    status="QUALITY_NOT_EVALUATED" if fixture else ("needs_review" if pending else ("provisional_pass" if quality_pass and performance_pass else "failed"))
    # A passing synthetic suite is never a real-product release authorization.
    walls=runmeta.get("measured_wall_s")
    accepted=[x for x in graded if x["expected_decision"]=="answer" and x["pass_case"] is True]
    telemetry_summary={}
    for key in ("model_ttft_ms","generation_ms","retrieval_ms","input_tokens","output_tokens","gpu_peak_gib","rss_peak_gib"):
        vals=[x["telemetry"].get(key) for x in graded if isinstance(x["telemetry"],dict)]
        vals=[v for v in vals if type(v) in (int,float) and math.isfinite(v) and v>=0]
        telemetry_summary[key]={"n":len(vals),"p50":percentile(vals,.5),"p95":percentile(vals,.95),"max":max(vals) if vals else None}
    speeds=[]
    for x in graded:
        t=x["telemetry"] if isinstance(x["telemetry"],dict) else {}
        n=t.get("output_tokens"); ms=t.get("generation_ms")
        if type(n) in (int,float) and type(ms) in (int,float) and n>=0 and ms>0 and math.isfinite(n) and math.isfinite(ms): speeds.append(n/(ms/1000))
    telemetry_summary["generation_tokens_per_s"]={"n":len(speeds),"p50":percentile(speeds,.5),"p95":percentile(speeds,.95)}
    output=dict(status=status,quality_gates_passed=quality_pass,performance_gates_passed=performance_pass,
        release_eligible=False,real_model_measured=not fixture and runmeta.get("status")=="completed",
        limitations=["Fictional KB/workflows; customer DOCX and current application not supplied.",
                     "Kazakh and Russian references await human/native review.",
                     "Published regression set is not an independently authored final holdout.",
                     "No measured minimum model size can be inferred without a tested candidate matrix."],
        overall=overall,slices=slices,telemetry=telemetry_summary,
        by_suite={s:slice_metrics([x for x in graded if x["suite"]==s]) for s in sorted({x["suite"] for x in graded})},
        cross_language={f"{q}/{e}/{a}":slice_metrics([x for x in graded if cases[x["case_id"]]["question_language"]==q and cases[x["case_id"]]["evidence_language"]==e and x["language"]==a])
                        for q,e,a in sorted({(c["question_language"],c["evidence_language"],c["language"]) for c in cases.values() if c["case_id"] in selected_ids})},
        efficiency={"answerable_correct_responses_per_wall_s":len(accepted)/walls if walls else None,
                    "wall_s":walls,"accepted_answerable_responses":len(accepted),
                    "note":"Includes all measured workload time; unsupported-question refusals do not increase numerator."},
        checks=checks,per_response=graded)
    dest=Path(args.out); dest.mkdir(parents=True,exist_ok=True)
    dump(dest/"report.json",output)
    lines=["# JanaMen: результат проверки", "",f"Статус: **{status}**. Допуск к выпуску: **нет**.","",
           "| Сценарий / язык | Средний балл | Верные ответы | Отказы при нехватке данных | p50 / p95, с |",
           "|---|---:|---:|---:|---:|"]
    def fmt(v): return "не измерено" if v is None else f"{v:.3f}"
    for name,m in slices.items():
        lines.append(f"| {name} | {fmt(m['mean_score'])} | {fmt(m['grounded_correct']['value'])} | {fmt(m['correct_abstention']['value'])} | {fmt(m['latency']['p50_valid_s'])} / {fmt(m['latency']['p95_valid_s'])} |")
    lines += ["", "Доли приведены от 0 до 1; числители, знаменатели и разбор каждого ответа — в report.json.","",
              "База вымышленная. Эталоны требуют языковой проверки. Непроверенные ответы не получают балл. Повторные запросы не увеличивают число независимых вопросов.","",
              "Не выполнены проверки:"]+[f"- {x['name']}: {x['actual']} (цель {x['target']})." for x in checks if not x["passed"]]
    (dest/"report.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(json.dumps({"status":status,"report":str(dest/"report.json")},ensure_ascii=False))

def selftest(args):
    """Only calibration of scorer; these outputs NEVER come from an HR model."""
    validate(); dest=Path(args.out)
    if dest.exists() and any(dest.iterdir()): raise ValueError("Self-test output must be new or empty")
    results=[]; reviews=[]
    for c in load_cases():
        out=canonical({"decision":c["expected"]["decision"],"answer":c["expected"]["answer"],
                       "evidence_ids":c["expected"]["evidence_ids"]},{},"oracle")
        r=dict(record_id=c["case_id"]+":0:measured",case_id=c["case_id"],repeat=0,warmup=False,
               http_status=None,error=None,latency_s=None,output=out,output_hash=fingerprint(out))
        rv=review_template(c,r); rv.update(reviewed=True,reviewer="fixture-self-test",review_type="fixture_self_test")
        for key in ("required_facts","checks","language"):
            rv[key]={k:True for k in rv[key]}
        rv["critical_flags"]={k:False for k in FLAGS}
        count=len(c["expected"]["required_facts"])
        rv.update(substantive_claims=count,supported_claims=count,cited_claims=count if c["expected"]["decision"]=="answer" else 0,
                  supported_cited_claims=count if c["expected"]["decision"]=="answer" else 0)
        assert grade(c,r,rv)["score"]==100,c["case_id"]
        results.append(r); reviews.append(rv)
    jsonl(dest/"results.jsonl",results); jsonl(dest/"reviews.jsonl",reviews)
    dump(dest/"run.json",{"status":"completed","fixture_self_test":True,"measured_requests":len(results),"measured_wall_s":None})
    print("QUALITY_NOT_EVALUATED: reference scoring calibration passed; latency is null.")

def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest="command",required=True)
    sub.add_parser("validate")
    v=sub.add_parser("run"); v.add_argument("--endpoint",required=True)
    v.add_argument("--mode",choices=["oracle","integrated"],default="oracle")
    v.add_argument("--config",default=str(ROOT/"configs/run.json")); v.add_argument("--out",required=True)
    v.add_argument("--split",choices=["all","dev","verification"],default="all")
    v.add_argument("--scenario",choices=["all","leave","advance"],default="all")
    v.add_argument("--language",choices=["all","ru","kk"],default="all")
    v.add_argument("--repeats",type=int,default=1); v.add_argument("--warmup",type=int,default=5)
    v.add_argument("--concurrency",type=int,default=1); v.add_argument("--seed",type=int,default=17)
    v.add_argument("--model-metadata"); v.add_argument("--execute",action="store_true"); v.add_argument("--allow-remote",action="store_true")
    v=sub.add_parser("reviews"); v.add_argument("--results",required=True); v.add_argument("--out",required=True)
    v=sub.add_parser("score"); v.add_argument("--results",required=True); v.add_argument("--reviews")
    v.add_argument("--service-probes")
    v.add_argument("--out",required=True); v.add_argument("--acceptance",default=str(ROOT/"configs/acceptance.json"))
    v.add_argument("--expected-split",choices=["all","dev","verification"],default="all")
    v=sub.add_parser("self-test"); v.add_argument("--out",required=True)
    a=p.parse_args()
    if a.command=="validate": print(json.dumps(validate(),ensure_ascii=False,indent=2))
    elif a.command=="run": run(a)
    elif a.command=="reviews": make_reviews(a.results,a.out)
    elif a.command=="score": report(a)
    else: selftest(a)

if __name__=="__main__":
    try: main()
    except (ValueError,AssertionError,KeyError) as exc:
        print(f"ERROR: {exc}",file=sys.stderr); sys.exit(2)
