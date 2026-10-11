/** A cell's guided queue contains anatomical questions, never a contact-review quota. */
import {effectiveQuestionOutcome} from './focused-review.js';
import {navigationQuestions} from './review-navigation.js';
import {findScopedQuestionDecision} from './review-scope.js';

/** Keep canonical catalog order across views; only active-scope relevance changes membership. */
export function cellReviewQueue(catalog,states,recipientId) {
  if(!recipientId)return [];
  return navigationQuestions(catalog,states,{cellId:recipientId});
}

/** Recorded uncertainty is saved work, but remains unresolved rather than certifying anatomy. */
export function cellReviewSummary(catalog,states,recipientId) {
  const queue=cellReviewQueue(catalog,states,recipientId),questionIds=queue.map(question=>question.id);
  const outcomes=questionIds.map(id=>effectiveQuestionOutcome(catalog,findScopedQuestionDecision(states,id,catalog)));
  const isResolved=outcome=>outcome==='supported'||outcome==='contradicted';
  const unresolvedIds=questionIds.filter((id,index)=>!isResolved(outcomes[index]));
  const unreviewed=outcomes.filter(outcome=>outcome==='unreviewed').length;
  return {
    total:queue.length,
    recorded:queue.length-unreviewed,
    resolved:queue.length-unresolvedIds.length,
    unresolved:unresolvedIds.length,
    unreviewed,
    questionIds,
    unresolvedIds,
  };
}

/** Resume preferences are navigation only; choosing a case never creates a decision. */
export function chooseCellCase(queue,savedId,currentId) {
  const ids=new Set(queue.map(question=>question.id));
  return [savedId,currentId].find(id=>ids.has(id))??queue[0]?.id??null;
}
