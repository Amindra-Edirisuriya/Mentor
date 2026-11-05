import json

from app.analysis.report import AnalysisReport, analyse_project, collect_evidence
from tests.fixtures import MERN_PROJECT


def test_analyse_project_assembles_report(make_tree) -> None:
    root = make_tree(MERN_PROJECT)

    report = analyse_project(root, ["soundapp/vendor.zip"])

    s = report.summary
    assert s.file_count == len(MERN_PROJECT)
    assert set(s.frameworks_used) >= {"Express", "Mongoose", "MongoDB", "JWT", "React", "Axios"}
    assert "Multer (file uploads)" in s.frameworks_declared_only  # declared, never imported
    assert s.route_count == 3 and s.model_count == 1
    assert report.structure.root_prefix == "soundapp"
    assert report.skipped_nested_archives == ["soundapp/vendor.zip"]
    assert report.scan.get("soundapp/server/.env").sensitive


def test_report_is_deterministic_and_json_roundtrips(make_tree) -> None:
    root = make_tree(MERN_PROJECT)

    a = analyse_project(root).model_dump(mode="json")
    b = analyse_project(root).model_dump(mode="json")

    assert a == b
    assert AnalysisReport.model_validate(json.loads(json.dumps(a))).model_dump(mode="json") == a


def test_collect_evidence_from_model_and_json(make_tree) -> None:
    report = analyse_project(make_tree(MERN_PROJECT))

    from_model = collect_evidence(report)
    from_json = collect_evidence(report.model_dump(mode="json"))

    assert from_model.keys() == from_json.keys()
    assert len(from_model) > 10
    detectors = {e.detector for e in from_model.values()}
    assert {"manifest", "ts-imports", "ts-express-routes", "ts-mongoose-models"} <= detectors
