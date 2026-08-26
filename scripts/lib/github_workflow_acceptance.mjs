function selectWorkflowRun(runs, options = {}) {
  const commit = String(options.commit || '').trim();
  const branch = String(options.branch || '').trim();
  const event = String(options.event || '').trim();

  return (Array.isArray(runs) ? runs : [])
    .filter((run) => !commit || run?.head_sha === commit)
    .filter((run) => !branch || run?.head_branch === branch)
    .filter((run) => !event || run?.event === event)
    .sort((left, right) => {
      const createdOrder = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
      if (createdOrder !== 0) return createdOrder;
      return Number(right?.run_attempt || 0) - Number(left?.run_attempt || 0);
    })[0] || null;
}

function workflowRunState(run) {
  if (!run) return { state: 'waiting', message: 'matching workflow run has not started' };
  if (run.status !== 'completed') {
    return { state: 'waiting', message: `workflow run ${run.id} is ${run.status || 'pending'}` };
  }
  if (run.conclusion === 'success') {
    return { state: 'accepted', message: `workflow run ${run.id} succeeded` };
  }
  return {
    state: 'rejected',
    message: `workflow run ${run.id} completed with ${run.conclusion || 'no conclusion'}`
  };
}

export {
  selectWorkflowRun,
  workflowRunState
};
