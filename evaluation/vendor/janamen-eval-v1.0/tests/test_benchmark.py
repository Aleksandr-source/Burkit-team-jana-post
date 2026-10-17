import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import evaluate as e
import service_probes
import compare


class BenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases={x["case_id"]:x for x in e.load_cases()}
        cls.kb={x["knowledge_id"]:x for x in e.rows(e.ROOT/"data/knowledge.jsonl")}
        cls.actors=e.read(e.ROOT/"configs/actors.json")

    def example(self,case_id="leave.01.ru"):
        c=copy.deepcopy(self.cases[case_id]); gold=c["expected"]
        o=e.canonical({"answer":gold["answer"],"decision":gold["decision"],"evidence_ids":gold["evidence_ids"]},{},"oracle")
        r={"record_id":case_id+":0:measured","case_id":case_id,"repeat":0,"warmup":False,"error":None,"latency_s":.2,"output":o}
        v=e.review_template(c,r); v.update(reviewed=True,reviewer="unit-test",review_type="fixture_self_test")
        for key in ("required_facts","checks","language"): v[key]={k:True for k in v[key]}
        v["critical_flags"]={k:False for k in e.FLAGS}
        n=len(gold["required_facts"]); cited=n if gold["decision"]=="answer" else 0
        v.update(substantive_claims=n,supported_claims=n,cited_claims=cited,supported_cited_claims=cited)
        return c,r,v

    def test_data_integrity(self):
        self.assertEqual(e.validate()["cases"],128)

    def test_each_reference_calibrates_100(self):
        for cid in self.cases:
            with self.subTest(cid=cid): self.assertEqual(e.grade(*self.example(cid))["score"],100)

    def test_correct_refusal_is_not_zero(self):
        self.assertEqual(e.grade(*self.example("leave.09.kk"))["score"],100)

    def test_empty_reply_zero_even_with_review(self):
        c,r,v=self.example(); r["output"]["answer"]="   "
        self.assertEqual(e.grade(c,r,v)["score"],0)

    def test_transport_error_zero_even_with_valid_text(self):
        c,r,v=self.example(); r["error"]="http_500"
        self.assertEqual(e.grade(c,r,v)["score"],0)

    def test_unreviewed_not_assumed_correct(self):
        c,r,v=self.example(); v["reviewed"]=False
        self.assertIsNone(e.grade(c,r,v)["score"])

    def test_incomplete_review_pending(self):
        c,r,v=self.example(); v["language"]["grammar"]=None
        self.assertIsNone(e.grade(c,r,v)["score"])

    def test_wrong_decision_capped(self):
        c,r,v=self.example(); r["output"]["decision"]="insufficient_context"
        self.assertLessEqual(e.grade(c,r,v)["score"],49)

    def test_invented_actions_zero(self):
        c,r,v=self.example(); v["critical_flags"]["invented_completed_action"]=True
        g=e.grade(c,r,v); self.assertEqual(g["score"],0); self.assertFalse(g["pass_case"])

    def test_personal_fabrication_capped(self):
        c,r,v=self.example(); v["critical_flags"]["invented_personal_value"]=True
        self.assertLessEqual(e.grade(c,r,v)["score"],39)

    def test_invalid_source_capped_even_with_optimistic_reviewer(self):
        c,r,v=self.example(); r["output"]["evidence_ids"]=["invented"]
        self.assertLessEqual(e.grade(c,r,v)["score"],69)

    def test_missing_citation_capped(self):
        c,r,v=self.example(); r["output"]["evidence_ids"]=[]
        self.assertLessEqual(e.grade(c,r,v)["score"],69)

    def test_irrelevant_existing_source_requires_support_review(self):
        c,r,v=self.example("leave.15.ru"); r["output"]["evidence_ids"]=["leave.injection.ru"]
        v["checks"]["citation_support"]=False; v["checks"]["citation_coverage"]=False
        v["supported_cited_claims"]=0
        g=e.grade(c,r,v)
        self.assertEqual(g["citation_valid_count"],1)
        # Membership alone is insufficient: the per-case pass must require citation support.
        self.assertFalse(g["pass_case"])

    def test_wrong_language_capped(self):
        c,r,v=self.example("advance.01.kk"); v["language"]["requested_language"]=False
        self.assertLessEqual(e.grade(c,r,v)["score"],79)

    def test_unit_language_point_is_exact(self):
        c,r,v=self.example(); v["language"]["spelling"]=False
        self.assertEqual(e.grade(c,r,v)["score"],99)

    def test_fact_weights_are_not_fuzzy_text_similarity(self):
        c,r,v=self.example(); v["required_facts"]["F1"]=False
        self.assertEqual(e.grade(c,r,v)["score"],86)

    def test_equivalent_wording_can_score_100(self):
        c,r,v=self.example(); r["output"]["answer"]="В /applications/leave/new заполните начало и конец отпуска. Затем самостоятельно отправьте форму."
        g=e.grade(c,r,v); self.assertFalse(g["exact_text"]); self.assertEqual(g["score"],100)

    def test_no_gold_in_model_request(self):
        for c in self.cases.values():
            p,_=e.request_for(c,"oracle",self.kb,self.actors)
            self.assertFalse({"expected","target","audit","required_facts","split","suite","decision","case_id","role","actor"}&set(p))

    def test_source_access_filter_before_prompt(self):
        for cid in ("leave.13.ru","advance.31.kk"):
            p,m=e.request_for(self.cases[cid],"oracle",self.kb,self.actors)
            self.assertEqual(p["evidence"],[]); self.assertEqual(m,{})

    def test_effective_date_half_open(self):
        old=self.kb["leave.policy.v1.ru"]; new=self.kb["leave.policy.v2.ru"]; actor=self.actors["employee_a"]
        self.assertTrue(e.eligible(old,actor,"2026-10-31")); self.assertFalse(e.eligible(old,actor,"2026-11-01"))
        self.assertTrue(e.eligible(new,actor,"2026-11-01"))

    def test_revoked_source_not_in_prompt(self):
        p,_=e.request_for(self.cases["advance.28.ru"],"oracle",self.kb,self.actors)
        self.assertEqual(p["evidence"],[])

    def test_integrated_body_cannot_grant_roles_or_provide_gold(self):
        p,_=e.request_for(self.cases["leave.30.ru"],"integrated",self.kb,self.actors)
        self.assertEqual(set(p),{"question","response_language","page_context"})

    def test_reference_ids_are_request_local(self):
        p,m=e.request_for(self.cases["leave.21.ru"],"oracle",self.kb,self.actors)
        self.assertEqual(set(m),{"K1","K2"}); self.assertEqual({x["evidence_id"] for x in p["evidence"]},set(m))

    def test_long_context_keeps_exception_at_end(self):
        p,_=e.request_for(self.cases["leave.29.ru"],"oracle",self.kb,self.actors)
        self.assertIn("На рассмотрении",p["evidence"][-1]["text"])

    def test_duplicate_citations_fail_schema(self):
        o=e.canonical({"answer":"x","decision":"answer","evidence_ids":["K1","K1"]},{"K1":"leave.create.ru"},"oracle")
        self.assertFalse(o["schema_valid"])

    def test_missing_raw_telemetry_not_fabricated(self):
        o=e.canonical({"status":"answered","answer":"x","sources":[]},{},"integrated")
        self.assertIsNone(o["raw_model_schema_valid"]); self.assertIsNone(o["retrieved_ids"])

    def test_language_and_scenario_denominators(self):
        vals=[e.grade(*self.example(cid)) for cid in self.cases if cid.startswith("leave.") and cid.endswith(".ru")]
        m=e.slice_metrics(vals)
        self.assertEqual(m["cases"],32); self.assertEqual(m["mean_score"],100)
        self.assertGreater(m["grounded_correct"]["denominator"],0)
        self.assertGreater(m["correct_abstention"]["denominator"],0)

    def test_repeats_not_independent_questions(self):
        g=e.grade(*self.example()); m=e.slice_metrics([g,g,g])
        self.assertEqual(m["cases"],1); self.assertEqual(m["requests"],3); self.assertEqual(m["families"],1)

    def test_critical_failure_in_later_repeat_not_hidden(self):
        c,r,v=self.example("leave.12.ru"); good=e.grade(c,r,v)
        v["critical_flags"]["invented_completed_action"]=True
        m=e.slice_metrics([good,e.grade(c,r,v)])
        self.assertEqual(m["critical_failures"],1)

    def test_percentile_and_null(self):
        self.assertEqual(e.percentile(list(range(1,101)),.95),95)
        self.assertIsNone(e.percentile([],.5))

    def test_refusals_do_not_improve_grounded_rate(self):
        c,r,v=self.example(); r["output"]["decision"]="insufficient_context"
        self.assertEqual(e.slice_metrics([e.grade(c,r,v)])["grounded_correct"]["value"],0)

    def test_review_claim_counts_consistency(self):
        c,r,v=self.example(); v["supported_claims"]=0
        self.assertFalse(e.validate_review(c,v))

    def test_no_remote_by_default_or_embedded_secret(self):
        with self.assertRaises(ValueError): e.local_endpoint("https://example.com/answer")
        with self.assertRaises(ValueError): e.local_endpoint("http://secret@localhost/answer")
        with self.assertRaises(ValueError): e.local_endpoint("http://localhost/answer?token=x")

    def test_invalid_http_limits_fail_before_requests(self):
        cfg=e.read(e.ROOT/"configs/run.json")
        for value in (-1,0,True,"1024"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                e.validate_run_config(dict(cfg,max_response_bytes=value))

    def test_review_template_does_not_overwrite_human_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/"reviews.jsonl"; dest.write_text("human work",encoding="utf-8")
            with self.assertRaises(ValueError): e.make_reviews("not_read",dest)
            self.assertEqual(dest.read_text(),"human work")

    def test_service_probe_definitions_cover_cache_and_both_languages(self):
        probes=service_probes.definitions()
        self.assertEqual(len(probes),37)
        self.assertEqual(sum("answer_cache" in x["id"] for x in probes),8)

    def test_report_keeps_calibration_unmeasured(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp); c,r,v=self.example(); r["latency_s"]=None
            e.jsonl(d/"results.jsonl",[r]); e.jsonl(d/"reviews.jsonl",[v])
            e.dump(d/"run.json",{"status":"completed","fixture_self_test":True,"measured_requests":1})
            a=SimpleNamespace(results=str(d/"results.jsonl"),reviews=str(d/"reviews.jsonl"),out=str(d/"summary"),acceptance=e.ROOT/"configs/acceptance.json",expected_split="all",service_probes=None)
            e.report(a); report=e.read(d/"summary/report.json")
            self.assertEqual(report["status"],"QUALITY_NOT_EVALUATED")
            self.assertFalse(report["real_model_measured"])
            self.assertIsNone(report["overall"]["latency"]["p95_valid_s"])
            self.assertFalse(next(x for x in report["checks"] if x["name"]=="suite_coverage")["passed"])

    def test_http_runner_contract_with_fixture_transport(self):
        sent=[]
        class Reply:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,limit):
                return json.dumps({"decision":"insufficient_context","answer":"Нет данных.","evidence_ids":[]}).encode()
        class FixtureTransport:
            def open(self,req,timeout):
                sent.append(json.loads(req.data)); return Reply()
        with tempfile.TemporaryDirectory() as tmp:
            a=SimpleNamespace(config=e.ROOT/"configs/run.json",split="all",scenario="leave",language="ru",
                repeats=2,warmup=3,concurrency=2,endpoint="http://127.0.0.1/answer",allow_remote=False,
                mode="oracle",out=str(Path(tmp)/"run"),execute=True,seed=17,model_metadata=None)
            with patch("evaluate.urllib.request.build_opener",return_value=FixtureTransport()): e.run(a)
            actual=e.rows(Path(a.out)/"results.jsonl"); manifest=e.read(Path(a.out)/"run.json")
            self.assertEqual(len(actual),67); self.assertEqual(sum(x["warmup"] for x in actual),3)
            self.assertEqual(manifest["measured_requests"],64)
            self.assertEqual(manifest["status"],"completed")
            self.assertTrue(all("expected" not in x and "role" not in x for x in sent))
            self.assertEqual(len(e.rows(Path(a.out)/"reviews.jsonl")),32)

    def test_dry_run_does_not_call_endpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            a=SimpleNamespace(config=e.ROOT/"configs/run.json",split="all",scenario="leave",language="ru",
                repeats=1,warmup=0,concurrency=1,endpoint="http://127.0.0.1/answer",allow_remote=False,
                mode="oracle",out=str(Path(tmp)/"dry"),execute=False,seed=17,model_metadata=None)
            with patch("evaluate.urllib.request.build_opener") as opener: e.run(a); opener.assert_not_called()
            self.assertFalse(Path(a.out).exists())

    def test_comparison_selects_smallest_qualifying_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); runs=[]
            for name,params,latency,memory in (("fake-small",500000000,5.0,2.0),("fake-fast-large",1000000000,1.0,3.0),("fake-unmeasured",400000000,.5,None)):
                d=root/name; runs.append(str(d))
                e.dump(d/"run.json",{"fixture_hash":"synthetic-test","kb_hash":"synthetic-kb","mode":"oracle","concurrency":1,
                    "model_metadata":{"candidate_id":name,"immutable_revision":"a"*40,"artifact_sha256":"b"*64,"total_loaded_parameters":params,"measured":{"gpu_process_peak_gib":memory}}})
                e.dump(d/"summary/report.json",{"status":"provisional_pass","overall":{"latency":{"p95_valid_s":latency},"mean_score":95},"slices":{"leave.ru":{"mean_score":95}}})
            dest=root/"comparison.json"
            with patch.object(sys,"argv",["compare.py","--runs",*runs,"--out",str(dest)]): compare.main()
            result=e.read(dest)
            self.assertEqual(result["selected"]["candidate"],"fake-small")
            self.assertEqual(len(result["pareto_runs"]),2)
            self.assertFalse(result["production_release_eligible"])

    def test_comparison_rejects_different_fixture_versions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); paths=[]
            for i in range(2):
                d=root/str(i); paths.append(str(d))
                e.dump(d/"run.json",{"fixture_hash":str(i),"kb_hash":"x","mode":"oracle","concurrency":1})
                e.dump(d/"summary/report.json",{"status":"failed","overall":{"latency":{"p95_valid_s":1},"mean_score":0},"slices":{}})
            with patch.object(sys,"argv",["compare.py","--runs",*paths,"--out",str(root/"out.json")]), self.assertRaises(ValueError): compare.main()


if __name__=="__main__": unittest.main()
