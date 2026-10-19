"""The abstention study that calibrates ABSTAIN_BELOW (src/engine/answer.ts)."""

from __future__ import annotations

from pipeline.engine import Corpus
from pipeline.evaluate import (
    AbstentionCase,
    GoldQuery,
    abstention_study,
    candidate_thresholds,
    choose_threshold,
    resolve_question,
    unavoidable_refusals,
)


def case(cid: str, score: float, answerable: bool, linked: bool = False) -> AbstentionCase:
    return AbstentionCase(
        id=cid,
        query=cid,
        resolved=cid,
        answerable=answerable,
        best_score=score,
        entities=("topic:Gender",) if linked else (),
    )


def test_candidates_are_rounded_midpoints_between_distinct_scores() -> None:
    assert candidate_thresholds([0.0, 1.0, 1.0, 3.0, 3.004]) == [0.5, 2.0, 3.0]
    assert candidate_thresholds([2.0]) == []


def test_abstains_only_on_a_weak_match_with_no_linked_topic() -> None:
    assert case("a", 1.0, False).abstains(2.0)
    assert not case("b", 1.0, False, linked=True).abstains(2.0)
    assert not case("c", 2.0, False).abstains(2.0)  # "below" is strict, as in composeBrief


def test_a_linked_country_alone_does_not_prevent_abstaining() -> None:
    place = AbstentionCase(
        id="p", query="weather in London", resolved="weather in London", answerable=False,
        best_score=1.0, entities=("country:United Kingdom",),
    )
    assert place.abstains(2.0)


def test_picks_the_most_refusals_that_never_refuse_an_answerable_question() -> None:
    cases = [
        case("probe-0", 0.0, False),
        case("probe-1", 1.0, False),
        case("probe-5", 5.0, False),
        case("answer-4", 4.0, True),
        case("answer-linked", 0.5, True, linked=True),  # a link protects it at any threshold
        case("answer-9", 9.0, True),
    ]
    chosen, outcomes = choose_threshold(cases)
    assert [(o.threshold, o.correct_abstentions, o.false_abstentions) for o in outcomes] == [
        (0.25, 1, 0),
        (0.75, 1, 0),
        (2.5, 2, 0),
        (4.5, 2, 1),
        (7.0, 3, 1),
    ]
    assert chosen is not None and chosen.threshold == 2.5  # 7.0 refuses more probes but also answer-4


def test_ties_go_to_the_lowest_threshold() -> None:
    cases = [case("probe", 0.0, False), case("a", 2.0, True, linked=True), case("b", 6.0, True, linked=True)]
    chosen, _ = choose_threshold(cases)
    assert chosen is not None and chosen.threshold == 1.0  # 4.0 refuses the same single probe


def test_unavoidable_false_refusals_are_reported_and_not_compounded() -> None:
    cases = [
        case("typo", 0.0, True),  # refused at every candidate
        case("probe", 3.0, False),
        case("answer", 5.0, True),
    ]
    chosen, outcomes = choose_threshold(cases)
    assert chosen is not None and (chosen.threshold, chosen.false_abstentions) == (4.0, 1)
    assert unavoidable_refusals(cases, outcomes) == ["typo"]


def test_study_scores_the_spelling_corrected_question(corpus: Corpus) -> None:
    assert resolve_question(corpus, "preparedniss index") == "preparedness index"
    assert resolve_question(corpus, "trust police Norway") == "trust police Norway"
    gold = [
        GoldQuery("q-typo", "preparedniss index", {"preparedness-index": 2}),
        GoldQuery("q-police", "trust police Norway", {"policing-trust": 2}),
        GoldQuery("p-mercury", "boiling point of mercury", {}),
    ]
    study = abstention_study(corpus, gold)
    rows = {row["id"]: row for row in study["queries"]}
    assert rows["q-typo"]["resolved"] == "preparedness index"
    assert rows["q-typo"]["entities"] == ["topic:Preparedness Index"]
    assert rows["p-mercury"]["bestScore"] == 0
    assert (study["answerable"], study["unanswerable"]) == (2, 1)
    assert (study["correctAbstentions"], study["falseAbstentions"], study["feasible"]) == (1, 0, True)
    assert rows["p-mercury"]["abstains"] and not rows["q-police"]["abstains"]


def test_study_without_candidates_reports_no_threshold(corpus: Corpus) -> None:
    study = abstention_study(corpus, [GoldQuery("p", "boiling point of mercury", {})])
    assert study["threshold"] is None
    assert study["candidates"] == []
    assert study["unavoidableFalseAbstentions"] == []
